import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/client.js';

export const Roles = Reflector.createDecorator<Role[]>();
