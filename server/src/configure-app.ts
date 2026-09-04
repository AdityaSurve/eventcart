import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { getCorsOrigins, isProduction } from './common/config/security.env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

export function configureApp(app: INestApplication) {
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const production = isProduction();

  app.use(
    helmet({
      contentSecurityPolicy: production,
      crossOriginEmbedderPolicy: false,
      hidePoweredBy: true,
    }),
  );

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'X-Guest-Id',
    ],
  });
}
