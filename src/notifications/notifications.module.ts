import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
