import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Public } from '../common/decorators/public.decorator';
import { SkipRateLimit } from '../common/decorators/rate-limit.decorator';
import { AdaptyService, AdaptyWebhookPayload } from './adapty.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class AdaptyController {
  constructor(
    private readonly adaptyService: AdaptyService,
    private readonly configService: ConfigService,
  ) {}

  @Post('adapty')
  @Public()
  @SkipRateLimit()
  @HttpCode(200)
  @ApiOperation({ summary: 'Adapty subscription webhook' })
  async handleWebhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() payload: AdaptyWebhookPayload,
  ) {
    this.verifySecret(authorization);
    await this.adaptyService.handleEvent(payload);
    return { received: true };
  }

  private verifySecret(authorization: string | undefined) {
    const secret = this.configService.get<string>('ADAPTY_WEBHOOK_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const provided = authorization ?? '';
    const providedBuf = Buffer.from(provided);
    const secretBuf = Buffer.from(secret);

    if (providedBuf.length !== secretBuf.length || !timingSafeEqual(providedBuf, secretBuf)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
