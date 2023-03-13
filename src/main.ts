import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  HttpStatus,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExceptionResponse } from './exceptions/common.exception';
import { UtilCommonTemplate } from './utils/utils.common';
import { ValidationFilter } from './filters/validation.filter';
import { HttpLogger } from './interceptors/http-logger';
import * as cookieParser from 'cookie-parser';
import { CONFIG_SERVICE } from './constants';

async function bootstrap() {
  const logger = new Logger('AppLogger');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });
  app.enableCors({origin: '*'})
  app.use(cookieParser());
  app.setGlobalPrefix(process.env.API_PREFIX);
  app.useGlobalInterceptors(new HttpLogger());

  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle('Stock Swagger')
    .setDescription('Stock API - Talented Investor')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Stock Swagger',
  });

  app.useGlobalFilters(new ValidationFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory(errors: ValidationError[]) {
        logger.error(errors);
        return new ExceptionResponse(
          HttpStatus.BAD_REQUEST,
          UtilCommonTemplate.getMessageValidator(errors),
        );
      },
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'public'));

  // app.connectMicroservice(app.get(CONFIG_SERVICE).createKafkaConfig());
  // await app.startAllMicroservices().catch((e) => console.log(e));

  await app.listen(parseInt(process.env.SERVER_PORT)).then(() => {
    console.log(
      `Server is running at ${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`,
    );
  });
}

bootstrap();
