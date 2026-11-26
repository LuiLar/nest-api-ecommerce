import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator.js';
import type { AuthRequest } from './jwt-auth.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    const roles = this.reflector.get(Roles, context.getHandler());

    if (!roles) return true;

    if (!roles.includes(user.role)) {
      throw new ForbiddenException('User does not have enough permissions');
    }

    return true;
  }
}
