import {
  Injectable,
  NestMiddleware,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class JsonContentTypeMiddleware implements NestMiddleware {
  use(req: Request, _: Response, next: NextFunction) {
    if (!req.is('application/json')) {
      throw new UnsupportedMediaTypeException(
        '"Content-Type" must be "application/json"',
      );
    }

    next();
  }
}
