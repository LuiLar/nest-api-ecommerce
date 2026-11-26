import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ProductsService } from './products.service.js';
import {
  type InputProduct,
  inputProductsSchema,
  outputProductSchema,
} from './products.schema.js';
import { ParseMaxPricePipe } from './parse-max-price.pipe.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  async list(
    @Query('maxPrice', ParseMaxPricePipe) maxPrice: number | undefined,
  ) {
    const products = await this.service.list(maxPrice);

    return products.map((p) => outputProductSchema.parse(p));
  }

  @Get(':id')
  async byId(@Param('id', ParseIdPipe) id: number) {
    const product = await this.service.findById(id);

    return outputProductSchema.parse(product);
  }

  @Roles([Role.admin])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  async create(@Body({ schema: inputProductsSchema }) body: InputProduct) {
    const createdProduct = await this.service.create(body);

    return outputProductSchema.parse(createdProduct);
  }
}
