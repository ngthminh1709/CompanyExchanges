import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import * as _ from 'lodash';
import * as moment from 'moment';
import { DataSource } from 'typeorm';
import { DB_SERVER } from '../constants';
import { RedisKeys } from '../enums/redis-keys.enum';
import { MssqlService } from '../mssql/mssql.service';
import { SessionDatesInterface } from '../stock/interfaces/session-dates.interface';
import { UtilCommonTemplate } from '../utils/utils.common';
import { IPriceChangePerformance } from './interfaces/price-change-performance.interface';
import { LiquidityChangePerformanceResponse } from './responses/liquidity-change-performance.response';
import { PriceChangePerformanceResponse } from './responses/price-change-performance.response';
import { IndusLiquidityResponse } from './responses/indus-liquidity.response';
import { IndusLiquidityInterface } from './interfaces/indus-liquidity.interface';
import { IndsReportResponse } from './responses/inds-report.response';
import { EquityChangeResponse } from './responses/equity-change.response';
import { LiabilitiesChangeResponse } from './responses/liabilities-change.response';

@Injectable()
export class MarketService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly redis: Cache,
    @InjectDataSource() private readonly db: DataSource,
    @InjectDataSource(DB_SERVER) private readonly dbServer: DataSource,
    private readonly mssqlService: MssqlService,
  ) {}

  //Get the nearest day have transaction in session, week, month...
  public async getSessionDate(
    table: string,
    column: string = 'date',
    instance: any = this.dbServer,
  ): Promise<SessionDatesInterface> {
    const redisData = await this.redis.get<SessionDatesInterface>(
      `${RedisKeys.SessionDate}:${table}:${column}`,
    );
    if (redisData) return redisData;

    const lastYear = moment().subtract('1', 'year').format('YYYY-MM-DD');
    const firstDateYear = moment().startOf('year').format('YYYY-MM-DD');
    const quarterDate = moment()
      .subtract(1, 'quarter')
      .endOf('quarter')
      .format('YYYY-MM-DD');

    const query: string = `
          WITH data as (
              SELECT DISTINCT TOP 5 [date]
              FROM ${table}
              WHERE [date] IS NOT NULL 
              ORDER BY [date] DESC
              UNION ALL
              SELECT TOP 1 [date]
              FROM ${table}
              WHERE [date] IS NOT NULL
              AND [date] <= @0
              ORDER BY [date] DESC
              UNION ALL
              SELECT TOP 1 [date]
              FROM ${table}
              WHERE [date] IS NOT NULL
              AND [date] >= @1
              ORDER BY [date]
              UNION ALL
              SELECT TOP 1 [date]
              FROM ${table}
              WHERE [date] IS NOT NULL
              AND [date] >= @2
              ORDER BY [date]
          )
          select * from data
        `;

    const data = await instance.query(query, [
      quarterDate,
      firstDateYear,
      lastYear,
    ]);

    const result = {
      latestDate: UtilCommonTemplate.toDate(data[0][column]),
      lastFiveDate: UtilCommonTemplate.toDate(data[4][column]),
      lastQuarterDate: UtilCommonTemplate.toDate(data[5][column]),
      firstYearDate: UtilCommonTemplate.toDate(data[6][column]),
      lastYearDate: UtilCommonTemplate.toDate(data[7][column]),
    };

    await this.redis.set(`${RedisKeys.SessionDate}:${table}:${column}`, result);
    return result;
  }

  async getNearestDate(table: string, date: Date | string) {
    const redisData = await this.redis.get(
      `${RedisKeys.NearestDate}:${table}:${date}`,
    );
    if (redisData) return redisData;

    const query: string = `
      SELECT TOP 1 [date]
      FROM ${table}
      WHERE [date] IS NOT NULL
      AND [date] <= '${date}'
      ORDER BY [date] DESC
    `;

    const dated = await this.mssqlService.getDate(query);
    await this.redis.set(`${RedisKeys.NearestDate}:${table}:${date}`, dated);
    return dated;
  }

  async priceChangePerformance(ex: string, industries: string[]) {
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const {
      latestDate,
      lastFiveDate,
      lastQuarterDate,
      firstYearDate,
      lastYearDate,
    } = await this.getSessionDate('[marketTrade].dbo.tickerTradeVND');

    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);

    const query: string = `
      select
          other.date, other.code,
          (now.closePrice - other.closePrice) / nullif(other.closePrice, 0) * 100 as perChange
      from (
          select [date], t.code, closePrice
          from [marketTrade].dbo.tickerTradeVND t
          inner join [marketInfor].dbo.info i
          on i.code = t.code
          where [date] = '${latestDate}' and i.LV2 in ${inds}
              and i.floor in ${floor} and i.type in ('STOCK', 'ETF')
      ) as now
      inner join (
              select [date], t.code, closePrice
          from [marketTrade].dbo.tickerTradeVND t
          inner join [marketInfor].dbo.info i
          on i.code = t.code
          where [date] in ('${lastFiveDate}', '${lastQuarterDate}', '${firstYearDate}', '${lastYearDate}') 
          and i.LV2 in ${inds}
              and i.floor in ${floor} and i.type in ('STOCK', 'ETF')
      ) as other
      on now.date > other.date and now.code = other.code
      group by other.date, other.code, now.closePrice, other.closePrice
      order by perChange desc, other.code, other.date desc
    `;

    const data = await this.dbServer.query(query);

    const mappedData: IPriceChangePerformance[] =
      UtilCommonTemplate.transformData([...data], {
        latestDate,
        lastFiveDate,
        lastQuarterDate,
        firstYearDate,
        lastYearDate,
      });

    return new PriceChangePerformanceResponse().mapToList(
      _.take(_.orderBy(mappedData, 'perFive', 'desc'), 50),
    );
  }

  async liquidityChangePerformance(ex: string, industries: string[]) {
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);

    const redisData = await this.redis.get(
      `${RedisKeys.LiquidityChangePerformance}:${floor}:${inds}`,
    );
    if (redisData) return redisData;

    const quarterDate = UtilCommonTemplate.getPastDate(5);
    const latestQuarterDate = quarterDate[0];
    const secondQuarterDate = quarterDate[1];
    const yearQuarterDate = quarterDate[4];
    const fourYearsDate = moment(new Date(latestQuarterDate))
      .subtract(4, 'years')
      .format('YYYY/MM/DD');
    const timeQuery: string = `
      WITH data as (
              SELECT TOP 1 [date]
              FROM [marketTrade].dbo.tickerTradeVND
              WHERE [date] IS NOT NULL
              AND [date] <= '${latestQuarterDate}'
              ORDER BY [date] DESC
              UNION ALL
              SELECT TOP 1 [date]
              FROM [marketTrade].dbo.tickerTradeVND
              WHERE [date] IS NOT NULL
              AND [date] <= '${secondQuarterDate}'
              ORDER BY [date] DESC
              UNION ALL
              SELECT TOP 1 [date]
              FROM [marketTrade].dbo.tickerTradeVND
              WHERE [date] IS NOT NULL
              AND [date] <= '${yearQuarterDate}'
              ORDER BY [date] DESC
              UNION ALL
              SELECT TOP 1 [date]
              FROM [marketTrade].dbo.tickerTradeVND
              WHERE [date] IS NOT NULL
              AND [date] <= '${fourYearsDate}'
              ORDER BY [date] DESC
          )
          select * from data
    `;

    const dates = await this.dbServer.query(timeQuery);

    const query: string = `
        select
        other.date, other.code,
            (now.totalVal - other.totalVal) / nullif(other.totalVal, 0) * 100 as perChange
        from (
            select [date], t.code, totalVal
            from [marketTrade].dbo.tickerTradeVND t
            inner join [marketInfor].dbo.info i
            on i.code = t.code
            where [date] = @0 and i.LV2 in ${inds}
                and i.floor in ${floor} and i.type in ('STOCK', 'ETF')
        ) as now
        inner join (
                select [date], t.code, totalVal
            from [marketTrade].dbo.tickerTradeVND t
            inner join [marketInfor].dbo.info i
            on i.code = t.code
            where [date] in (@1, @2, @3)
            and i.LV2 in ${inds}
                and i.floor in ${floor} and i.type in ('STOCK', 'ETF')
        ) as other
        on now.date >= other.date and now.code = other.code
        group by other.date, other.code, now.totalVal, other.totalVal
        order by perChange desc, other.code, other.date desc;
    `;
    const correctDate = [
      ...dates.map((i) => UtilCommonTemplate.toDate(i.date)),
    ];
    const data = await this.dbServer.query(query, correctDate);

    const mappedData: IPriceChangePerformance[] =
      UtilCommonTemplate.transformDataLiquid([...data], {
        latestQuarterDate: correctDate[0],
        secondQuarterDate: correctDate[1],
        yearQuarterDate: correctDate[2],
        fourYearsDate: correctDate[3],
      });

    const result = new LiquidityChangePerformanceResponse().mapToList(
      _.take(_.orderBy(mappedData, 'perQuarter', 'desc'), 50),
    );

    await this.redis.set(
      `${RedisKeys.LiquidityChangePerformance}:${floor}:${inds}`,
      result,
    );

    return result;
  }

  async marketCapChangePerformance(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.marketCapChange}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getPastDate(type, order);

    const { startDate, dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
        now.date, now.industry,
        ((now.value - prev.value) / NULLIF(prev.value, 0)) * 100 AS perChange
      FROM
        (
          SELECT
            [date],
            i.LV2 as industry,
            sum(value) as value
          FROM [RATIO].[dbo].[ratio] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] in ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.ratioCode = 'MARKETCAP'
          group by [date], i.LV2
        ) AS now
      INNER JOIN
        (
          SELECT
            [date],
            i.LV2 as industry,
            sum(value) as value
          FROM [RATIO].[dbo].[ratio] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] = '${startDate}'
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.ratioCode = 'MARKETCAP'
          group by [date], i.LV2
        ) AS prev
      ON now.[date] >= prev.[date] and now.industry = prev.industry
      GROUP BY now.[date], now.industry, prev.[date], now.value, prev.value
      ORDER BY now.[date]
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
    );

    await this.redis.set(
      `${RedisKeys.marketCapChange}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );
    return mappedData;
  }

  async indsLiquidityChangePerformance(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.IndusLiquidity}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getPastDate(type, order);

    const { startDate, dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
        now.date, now.industry,
        ((now.totalVal - prev.totalVal) / NULLIF(prev.totalVal, 0)) * 100 AS perChange
      FROM
        (
          SELECT
            [date],
            i.LV2 as industry,
            sum(totalVal) as totalVal
          FROM [marketTrade].[dbo].[tickerTradeVND] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] in ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
          group by [date], i.LV2
        ) AS now
      INNER JOIN
        (
          SELECT
            [date],
            i.LV2 as industry,
            sum(totalVal) as totalVal
          FROM [marketTrade].[dbo].[tickerTradeVND] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] = '${startDate}'
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
          group by [date], i.LV2
        ) AS prev
      ON now.[date] >= prev.[date] and now.industry = prev.industry
      GROUP BY now.[date], now.industry, prev.[date], now.totalVal, prev.totalVal
      ORDER BY now.[date]
    `;
    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
    );

    await this.redis.set(
      `${RedisKeys.IndusLiquidity}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );
    return mappedData;
  }

  async equityIndsChangePerformance(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.EquityIndsChange}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(type, order);
    const { startDate, dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
          now.year as date, now.industry,
          ((now.value - prev.value) / NULLIF(prev.value, 0)) * 100 AS perChange
        FROM
          (
            SELECT
              [year],
              i.LV2 as industry,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] in ${dateFilter}
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName = N'VỐN CHỦ SỞ HỮU'
            group by [year], i.LV2
          ) AS now
        INNER JOIN
          (
            SELECT
              [year],
              i.LV2 as industry,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${startDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName = N'VỐN CHỦ SỞ HỮU'
            group by [year], i.LV2
          ) AS prev
        ON now.[year] >= prev.[year] and now.industry = prev.industry
        GROUP BY now.[year], now.industry, prev.[year], now.value, prev.value
        ORDER BY now.[year]
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
      1,
    );

    await this.redis.set(
      `${RedisKeys.EquityIndsChange}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async liabilitiesIndsChangePerformance(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.LiabilitiesIndsChange}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(type, order);

    const { startDate, dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
          now.year as date, now.industry,
          ((now.value - prev.value) / NULLIF(prev.value, 0)) * 100 AS perChange
        FROM
          (
            SELECT
              [year],
              i.LV2 as industry,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] in ${dateFilter}
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (N'NỢ PHẢI TRẢ', N'Tổng nợ phải trả')
            group by [year], i.LV2
          ) AS now
        INNER JOIN
          (
            SELECT
              [year],
              i.LV2 as industry,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${startDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (N'NỢ PHẢI TRẢ', N'Tổng nợ phải trả')
            group by [year], i.LV2
          ) AS prev
        ON now.[year] >= prev.[year] and now.industry = prev.industry
        GROUP BY now.[year], now.industry, prev.[year], now.value, prev.value
        ORDER BY now.[year]
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
      1,
    );

    await this.redis.set(
      `${RedisKeys.LiabilitiesIndsChange}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async equityChangePerformance(ex: string, industries: string[]) {
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);

    const redisData = await this.redis.get(
      `${RedisKeys.EquityChange}:${floor}:${inds}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(2);

    const { startDate, endDate } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
          now.year as date, now.[code], lower(now.report) as report,
          ((now.value - prev.value) / NULLIF(prev.value, 0)) * 100 AS perChange
        FROM
          (
            SELECT
              [year],
              t.[code],
              reportName as report,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${endDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (N'VỐN CHỦ SỞ HỮU',
                N'Thặng dư vốn cổ phần',
                N'Lợi ích cổ đông không kiểm soát',
                N'Lãi chưa phân phối')
            group by [year], t.[code], t.reportName
          ) AS now
        INNER JOIN
          (
            SELECT
              [year],
              t.[code],
              reportName as report,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${startDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (N'VỐN CHỦ SỞ HỮU',
                N'Thặng dư vốn cổ phần',
                N'Lợi ích cổ đông không kiểm soát',
                N'Lãi chưa phân phối')
            group by [year], t.[code], t.reportName
          ) AS prev
        ON now.[year] >= prev.[year] and now.code = prev.code and now.report = prev.report
        GROUP BY now.[year], now.code, prev.[year], now.value, prev.value, now.report
        ORDER BY perChange desc
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const tranformData: any[] = UtilCommonTemplate.transformEquityData([
      ...data,
    ]);

    const mappedData = new EquityChangeResponse().mapToList(
      _.orderBy(tranformData, 'vonChuSoHuu', 'desc'),
    );

    await this.redis.set(
      `${RedisKeys.EquityChange}:${floor}:${inds}`,
      mappedData,
    );

    return mappedData;
  }

  async liabilitiesChangePerformance(ex: string, industries: string[]) {
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);

    const redisData = await this.redis.get(
      `${RedisKeys.LiabilitiesChange}:${floor}:${inds}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(2);

    const { startDate, endDate } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      SELECT
          now.year as date, now.[code], lower(now.report) as report,
          ((now.value - prev.value) / NULLIF(prev.value, 0)) * 100 AS perChange
        FROM
          (
            SELECT
              [year],
              t.[code],
              reportName as report,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${endDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (
                N'Nợ ngắn hạn',
                N'Nợ dài hạn')
            group by [year], t.[code], t.reportName
          ) AS now
        INNER JOIN
          (
            SELECT
              [year],
              t.[code],
              reportName as report,
              sum(value) as value
            FROM financialReport.dbo.[financialReport] t
            inner join marketInfor.dbo.info i
            on t.code = i.code
            WHERE [year] = '${startDate}'
              and i.floor in ${floor}
              and i.type in ('STOCK', 'ETF')
              and i.LV2 in ${inds}
              and t.reportName in (
                N'Nợ ngắn hạn',
                N'Nợ dài hạn')
            group by [year], t.[code], t.reportName
          ) AS prev
        ON now.[year] >= prev.[year] and now.code = prev.code and now.report = prev.report
        GROUP BY now.[year], now.code, prev.[year], now.value, prev.value, now.report
        ORDER BY perChange desc
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const tranformData: any[] = UtilCommonTemplate.transformLiabilitiesData([
      ...data,
    ]);

    const mappedData = new LiabilitiesChangeResponse().mapToList(
      _.orderBy(tranformData, 'noNganHan', 'desc'),
    );

    await this.redis.set(
      `${RedisKeys.LiabilitiesChange}:${floor}:${inds}`,
      mappedData,
    );

    return mappedData;
  }

  async netRevenueInds(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.netRevenueInds}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [year],
            i.LV2 as industry,
            reportName as report,
            sum(value) as value
          FROM financialReport.dbo.[financialReport] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [year] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.reportName in (N'Doanh số thuần', N'Thu nhập lãi thuần')
          group by [year], i.LV2, t.reportName
      ) select [year] as [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [year])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [year])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
      1,
    );

    await this.redis.set(
      `${RedisKeys.netRevenueInds}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async profitInds(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.ProfitInds}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [year],
            i.LV2 as industry,
            reportName as report,
            sum(value) as value
          FROM financialReport.dbo.[financialReport] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [year] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.reportName in (N'Lãi gộp')
          group by [year], i.LV2, t.reportName
      ) select [year] as [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [year])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [year])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
      1,
    );

    await this.redis.set(
      `${RedisKeys.ProfitInds}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async activityProfitInds(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.ActivityProfitInds}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getYearQuarters(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [year],
            i.LV2 as industry,
            reportName as report,
            sum(value) as value
          FROM financialReport.dbo.[financialReport] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [year] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.reportName in (N'Lãi/(lỗ) từ hoạt động kinh doanh')
          group by [year], i.LV2, t.reportName
      ) select [year] as [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [year])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [year])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
      1,
    );

    await this.redis.set(
      `${RedisKeys.ActivityProfitInds}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async epsInds(ex: string, industries: string[], type: number, order: number) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.EPSInds}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getPastDate(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [date],
            i.LV2 as industry,
            itemName as report,
            sum(value) as value
          FROM [RATIO].dbo.[ratio] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.ratioCode ='EPS_TR'
          group by [date], i.LV2, t.itemName
      ) select [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [date])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [date])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
    );

    await this.redis.set(
      `${RedisKeys.EPSInds}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async ebitdaInds(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.EBITDAInds}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getPastDate(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [date],
            i.LV2 as industry,
            itemName as report,
            sum(value) as value
          FROM [RATIO].dbo.[ratio] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.ratioCode ='OPERATING_EBIT_MARGIN_QR'
          group by [date], i.LV2, t.itemName
      ) select [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [date])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [date])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
    );

    await this.redis.set(
      `${RedisKeys.EBITDAInds}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }

  async cashDividend(
    ex: string,
    industries: string[],
    type: number,
    order: number,
  ) {
    const inds: string = UtilCommonTemplate.getIndustryFilter(industries);
    const floor = ex == 'ALL' ? ` ('HOSE', 'HNX', 'UPCOM') ` : ` ('${ex}') `;
    const redisData = await this.redis.get(
      `${RedisKeys.CashDividend}:${floor}:${inds}:${order}:${type}`,
    );
    if (redisData) return redisData;

    const date = UtilCommonTemplate.getPastDate(type, order);
    const { dateFilter } = UtilCommonTemplate.getDateFilter(date);

    const query: string = `
      with temp_data as (
          SELECT
            [date],
            i.LV2 as industry,
            itemName as report,
            sum(value) as value
          FROM [RATIO].dbo.[ratio] t
          inner join marketInfor.dbo.info i
          on t.code = i.code
          WHERE [date] IN ${dateFilter}
            and i.floor in ${floor}
            and i.type in ('STOCK', 'ETF')
            and i.LV2 in ${inds}
            and t.ratioCode ='N'DIVIDEND_PAID_TR'
          group by [date], i.LV2, t.itemName
      ) select [date],
          [industry],
          ([value] - lag([value]) over (PARTITION BY industry, report ORDER BY [date])) /
          NULLIF(ABS(LAG([value]) OVER (PARTITION BY industry, report ORDER BY [date])), 0) * 100 AS perChange
      from [temp_data];
    `;

    const data = await this.mssqlService.query<IndusLiquidityInterface[]>(
      query,
    );

    const mappedData = new IndusLiquidityResponse().mapToList(
      _.orderBy(data, 'date'),
    );

    await this.redis.set(
      `${RedisKeys.CashDividend}:${floor}:${inds}:${order}:${type}`,
      mappedData,
    );

    return mappedData;
  }
}