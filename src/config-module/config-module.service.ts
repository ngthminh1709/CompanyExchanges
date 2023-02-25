import { Injectable } from '@nestjs/common';
import { JwtModuleOptions } from '@nestjs/jwt/dist/interfaces/jwt-module-options.interface';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { redisStore } from 'cache-manager-redis-store';

@Injectable()
export class ConfigServiceProvider {
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'mssql',
      host: process.env.MSSQL_HOST,
      port: parseInt(process.env.MSSQL_PORT),
      username: process.env.MSSQL_USERNAME,
      password: process.env.MSSQL_PASSWORD,
      schema: 'dbo',
      // database: process.env.MSSQL_DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      // entities: [CityEntity, DistrictEntity, WardEntity, UserEntity, AuthEntity],
      autoLoadEntities: true,
      synchronize: true,
      options: { encrypt: false },
      // logging: true,
    };
  }

  createJwtOptions(): JwtModuleOptions {
    return {
      secretOrPrivateKey: process.env.ACCESS_TOKEN_SECRET,
      signOptions: {
        expiresIn: parseInt(process.env.EXPIRE_TIME),
      },
    };
  }

  async createRedisOptions(): Promise<any> {
    return {
      store: await redisStore({
        url: process.env.REDIS_URL,
      }),
      ttl: 1800,
    };
  }
}