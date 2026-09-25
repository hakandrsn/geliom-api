import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushDebounceService } from './push-debounce.service';
import { PremiumReminderService } from './premium-reminder.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, PushDebounceService, PremiumReminderService],
  exports: [NotificationsService, PushDebounceService],
})
export class NotificationsModule {}
