import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseMaxPricePipe implements PipeTransform {
  transform(value: string | undefined): number | undefined {
    if (!value) return undefined;

    const maxPrice = Number(value);

    if (!Number.isFinite(maxPrice)) {
      throw new BadRequestException('maxPrice has to be a number');
    }

    return maxPrice;
  }
}
