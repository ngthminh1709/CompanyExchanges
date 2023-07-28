import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CatchException } from '../exceptions/common.exception';
import { BaseResponse } from '../utils/utils.response';
import { CastFlowDto } from './dto/castFlow.dto';
import { EnterprisesSameIndustryDto } from './dto/enterprisesSameIndustry.dto';
import { SearchStockDto } from './dto/searchStock.dto';
import { StockOrderDto } from './dto/stock-order.dto';
import { StockDto } from './dto/stock.dto';
import { TransactionDataDto } from './dto/transactionData.dto';
import { BusinessResultsResponse } from './responses/businessResults.response';
import { EnterprisesSameIndustryResponse } from './responses/enterprisesSameIndustry.response';
import { EventCalendarResponse } from './responses/eventCalendar.response';
import { FinancialIndicatorsResponse } from './responses/financialIndicators.response';
import { HeaderStockResponse } from './responses/headerStock.response';
import { SearchStockResponse } from './responses/searchStock.response';
import { TradingPriceFluctuationsResponse } from './responses/tradingPriceFluctuations.response';
import { TransactionStatisticsResponse } from './responses/transaction-statistics.response';
import { TransactionDataResponse } from './responses/transactionData.response';
import { SharesService } from './shares.service';

@Controller('shares')
@ApiTags('Shares - Site Cổ phiếu')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get('search')
  @ApiOperation({summary: 'Tìm kiếm cổ phiếu'})
  @ApiOkResponse({type: SearchStockResponse})
  async searchStock(@Query() q: SearchStockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.searchStock(q.key_search)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('header')
  @ApiOperation({summary: 'Header'})
  @ApiOkResponse({type: HeaderStockResponse})
  async header(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.header(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('thong-ke-giao-dich')
  @ApiOperation({summary: 'Thống kê giao dịch'})
  @ApiOkResponse({type: TransactionStatisticsResponse})
  async transactionStatistics(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.transactionStatistics(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('ket-qua-kinh-doanh')
  @ApiOperation({summary: 'Kết quả kinh doanh'})
  @ApiOkResponse({type: BusinessResultsResponse})
  async businessResults(@Query() q: StockOrderDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.businessResults(q.stock, +q.order, q.type.toUpperCase())
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('can-doi-ke-toan')
  @ApiOperation({summary: 'Cân đối kế toán'})
  @ApiOkResponse({type: BusinessResultsResponse})
  async balanceSheet(@Query() q: StockOrderDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.balanceSheet(q.stock, +q.order, q.type.toUpperCase())
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }
  
  @Get('luu-chuyen-tien-te')
  @ApiOperation({summary: 'Lưu chuyển tiền tệ'})
  @ApiOkResponse({type: BusinessResultsResponse})
  async castFlow(@Query() q: CastFlowDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.castFlow(q.stock, +q.order)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  } 

  @Get('chi-so-tai-chinh')
  @ApiOperation({summary: 'Chỉ số tài chính'})
  @ApiOkResponse({type: FinancialIndicatorsResponse})
  async financialIndicators(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.financialIndicators(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('doanh-nghiep-cung-nganh')
  @ApiOperation({summary: 'Doanh nghiệp cùng ngành'})
  @ApiOkResponse({type: EnterprisesSameIndustryResponse})
  async enterprisesSameIndustry(@Query() q: EnterprisesSameIndustryDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.enterprisesSameIndustry(q.stock, q.exchange)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('lich-su-kien')
  @ApiOperation({summary: 'Lịch sự kiện'})
  @ApiOkResponse({type: EventCalendarResponse})
  async eventCalendar(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.eventCalendar(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('du-lieu-giao-dich')
  @ApiOperation({summary: 'Dữ liệu giao dịch'})
  @ApiOkResponse({type: TransactionDataResponse})
  async transactionData(@Query() q: TransactionDataDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.transactionData(q.stock, q.from, q.to)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('bien-dong-gia-giao-dich')
  @ApiOperation({summary: 'Biến động giá giao dịch'})
  @ApiOkResponse({type: TradingPriceFluctuationsResponse})
  async tradingPriceFluctuations(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.tradingPriceFluctuations(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }

  @Get('khoi-luong-giao-dich-binh-quan-ngay')
  @ApiOperation({summary: 'Khối lượng giao dịch bình quân/ngày'})
  @ApiOkResponse({type: TradingPriceFluctuationsResponse})
  async averageTradingVolume(@Query() q: StockDto, @Res() res: Response) {
    try {
      const data = await this.sharesService.averageTradingVolume(q.stock)
      return res.status(HttpStatus.OK).send(new BaseResponse({ data }));
    } catch (e) {
      throw new CatchException(e)
    }
  }
}
