import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { JsonContentTypeMiddleware } from '../common/json-content-type.middleware.js';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonContentTypeMiddleware)
      .forRoutes({ path: 'orders', method: RequestMethod.POST });
  }
}
