import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { JsonContentTypeMiddleware } from '../common/json-content-type.middleware.js';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonContentTypeMiddleware)
      .forRoutes({ path: 'products', method: RequestMethod.POST });
  }
}
