import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Mevcut kullanıcı bilgilerini döndür
   * Token'ı doğrular ve kullanıcıyı yoksa oluşturur
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  async me(@CurrentUser() user: User) {
    return {
      id: user.id,
      customId: user.customId,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt,
    };
  }

  /**
   * Health check - public endpoint
   */
  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Auth health check' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
