import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { AdaptyController } from './adapty.controller';
import { AdaptyService } from './adapty.service';

@Module({
  imports: [ConfigModule, UsersModule, GroupsModule],
  controllers: [AdaptyController],
  providers: [AdaptyService],
})
export class AdaptyModule {}
