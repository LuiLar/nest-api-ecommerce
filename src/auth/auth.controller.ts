import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type AuthLogin,
  authLoginSchema,
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body({ schema: authLoginSchema }) body: AuthLogin) {
    return this.service.login(body);
  }
}
