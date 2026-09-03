import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertSecureEnv, isProduction } from './common/config/security.env';
import { configureApp } from './configure-app';

async function bootstrap() {
  assertSecureEnv();

  const app = await NestFactory.create(AppModule);
  configureApp(app);

  if (!isProduction()) {
    const config = new DocumentBuilder()
      .setTitle('EventCart API')
      .setDescription('Eventcart API (disabled in production)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
