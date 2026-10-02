import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { AdaptyController } from './adapty.controller';
import { AdaptyService } from './adapty.service';
import { PremiumController } from './premium.controller';
import { PremiumService } from './premium.service';

@Module({
  imports: [ConfigModule, UsersModule, GroupsModule],
  controllers: [AdaptyController, PremiumController],
  providers: [AdaptyService, PremiumService],
  exports: [PremiumService],
})
export class AdaptyModule {}
