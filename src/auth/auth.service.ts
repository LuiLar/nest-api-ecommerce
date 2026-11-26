import { ConflictException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthRegister } from './auth.schema.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
}
