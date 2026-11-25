import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export const idSchema = z.int().positive().max(2147483647);

@Injectable()
export class ParseIdPipe implements PipeTransform {
  transform(value: string): number {
    const paramId = idSchema.safeParse(Number(value));

    if (!paramId.success) {
      throw new BadRequestException('Invalid ID');
    }

    return paramId.data;
  }
}
