import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushDebounceService } from './push-debounce.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, PushDebounceService],
  exports: [NotificationsService, PushDebounceService],
})
export class NotificationsModule {}
