import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HTTP-level setup shared by the real server (main.ts) and the end-to-end
 * tests, so the tests exercise exactly what runs in production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.getOrThrow<string>('frontendOrigin') });
}
