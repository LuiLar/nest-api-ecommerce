import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(maxPrice?: number) {
    const products = await this.prisma.product.findMany({
      orderBy: { id: 'asc' },
      where: maxPrice !== undefined ? { price: { lte: maxPrice } } : undefined,
    });

    return products;
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}
