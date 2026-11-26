import {
  HttpException,
  HttpStatus,
  Module,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { HttpErrorFilter } from './common/http-error.filter.js';
import { ProductsModule } from './products/products.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    HealthModule,
    PrismaModule,
    ProductsModule,
    AuthModule,
    OrdersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new HttpException(
            issues.map(({ path, message }) => ({
              field: (path || [])
                .map((s) => String(typeof s === 'object' ? s.key : s))
                .join('.'),
              message,
            })),
            HttpStatus.BAD_REQUEST,
          ),
      }),
    },
  ],
})
export class AppModule {}
