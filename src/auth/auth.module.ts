import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FirebaseStrategy } from './strategies/firebase.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'firebase' }), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, FirebaseStrategy],
  exports: [AuthService],
})
export class AuthModule {}
