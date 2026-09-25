import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupsRepository } from './groups.repository';
import { GroupPlanService } from './group-plan.service';

import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsRepository, GroupPlanService],
  exports: [GroupsService, GroupPlanService],
})
export class GroupsModule {}
