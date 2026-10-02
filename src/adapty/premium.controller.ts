import { Controller, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { PremiumService } from './premium.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class PremiumController {
  constructor(private readonly premiumService: PremiumService) {}

  /**
   * Premium durumunu Adapty'den tazeler ve sahibi olunan grupları hizalar.
   * Uygulama açılışında, satın alma ve geri yüklemeden sonra çağrılır;
   * webhook gecikse ya da hiç gelmese de kullanıcı doğru durumu görür.
   */
  @Post('me/premium/sync')
  @ApiOperation({ summary: 'Sync premium status from Adapty' })
  @RateLimit(20, 60)
  async sync(@CurrentUser() user: { id: string }) {
    const updated = await this.premiumService.sync(user.id);
    if (!updated) throw new NotFoundException('Kullanıcı bulunamadı');
    return updated;
  }
}
