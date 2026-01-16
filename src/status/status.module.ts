import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusRepository } from './status.repository';

import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [StatusController],
  providers: [StatusService, StatusRepository],
  exports: [StatusService],
})
export class StatusModule {}
