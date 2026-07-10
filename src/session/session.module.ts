import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionGateway } from './session.gateway';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [SessionService, SessionGateway],
  exports: [SessionService],
})
export class SessionModule {}
