import { Controller, Get } from '@nestjs/common';

@Controller('')
export class HealthController {
  @Get()
  isAlive(): { message: string } {
    return { message: 'Server is alive!' };
  }
}
