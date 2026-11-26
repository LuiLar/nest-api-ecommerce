import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { type AuthRequest, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../generated/prisma/client.js';
import { Roles } from '../auth/roles.decorator.js';
import { inputOrderSchema, type InputOrder } from './orders.schema.js';
import { OrdersService, toOutputOrder } from './orders.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Roles([Role.customer])
  @Post()
  async create(
    @Req() req: AuthRequest,
    @Body({ schema: inputOrderSchema }) body: InputOrder,
  ) {
    const order = await this.service.create(req.user.id, body.items);

    return toOutputOrder(order);
  }
}
