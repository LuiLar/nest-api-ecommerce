import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
      return res.status(500).json({ message: 'Internal server error' });
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    if (Array.isArray(body)) {
      return res.status(status).json(body);
    }

    return res.status(status).json({ message: exception.message });
  }
}
