import { Body, Controller, Post } from '@nestjs/common';
import {
  authRegisterSchema,
  outputUserSchema,
  type AuthRegister,
} from './auth.schema.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('register')
  async register(@Body({ schema: authRegisterSchema }) body: AuthRegister) {
    const user = await this.service.register(body);

    return outputUserSchema.parse(user);
  }
}
