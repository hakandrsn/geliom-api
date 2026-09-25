import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { UserRecord } from '../firebase/firestore.types';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a support message (stored in Firestore)' })
  @RateLimit(5, 3600) // saatte 5 mesaj — spam koruması
  async create(@CurrentUser() user: UserRecord, @Body() dto: CreateSupportMessageDto) {
    return this.supportService.create(user, dto);
  }
}
