import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthLogin, AuthRegister } from './auth.schema.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('make me a dummy hash');
  }

  async register({ email, password }: AuthRegister) {
    try {
      const hashedPass = await argon2.hash(password);

      return await this.prisma.user.create({
        data: { email, hashedPass },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw e;
    }
  }

  async login({ email, password }: AuthLogin) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      omit: { hashedPass: false },
    });

    if (!user) {
      await argon2.verify(this.dummyHash, password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const { id, hashedPass } = user;
    const isPassLegit = await argon2.verify(hashedPass, password);

    if (!isPassLegit) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { token: await this.jwt.signAsync({ sub: id }) };
  }
}
