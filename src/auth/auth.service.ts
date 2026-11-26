import {
  ConflictException,
  Injectable,
  OnApplicationBootstrap,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import {
  emailSchema,
  type AuthLogin,
  type AuthRegister,
} from './auth.schema.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

@Injectable()
export class AuthService implements OnModuleInit, OnApplicationBootstrap {
  private dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('make me a dummy hash');
  }

  async onApplicationBootstrap() {
    const adminEmail = this.config.get('ADMIN_EMAIL', { infer: true });
    const adminHash = this.config.get('ADMIN_PASSWORD_HASH', { infer: true });

    if (adminEmail && adminHash) {
      await this.createAdmin(adminEmail, adminHash);
    }
  }

  async createAdmin(email: string, hash: string): Promise<void> {
    const emailSchemaResult = emailSchema.safeParse(email);

    if (!emailSchemaResult.success) {
      throw new Error('ADMIN_EMAIL is not a valid email');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: emailSchemaResult.data },
    });

    if (existing?.role === Role.admin) return;

    if (existing) {
      throw new Error('ADMIN_EMAIL belongs to a non-admin user');
    }

    await this.prisma.user.create({
      data: {
        email: emailSchemaResult.data,
        hashedPass: hash,
        role: Role.admin,
      },
    });
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
