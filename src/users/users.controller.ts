import { Controller, Get, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Mevcut kullanıcı profilini getir
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.findByIdOrThrow(user.id);
  }

  /**
   * Kullanıcı profilini güncelle
   */
  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @RateLimit(10, 60) // 10 güncelleme / dakika
  async updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }

  /**
   * Kullanıcının gruplarını getir
   */
  @Get('me/groups')
  @ApiOperation({ summary: 'Get current user groups' })
  async getMyGroups(@CurrentUser() user: { id: string }) {
    return this.usersService.getUserGroups(user.id);
  }

  /**
   * Custom ID ile kullanıcı bul
   */
  @Get('by-custom-id/:customId')
  @ApiOperation({ summary: 'Find user by custom ID' })
  async findByCustomId(@Param('customId') customId: string) {
    const user = await this.usersService.findByCustomId(customId.toUpperCase());

    if (!user) {
      return { found: false };
    }

    // Sadece public bilgileri döndür
    return {
      found: true,
      user: {
        customId: user.customId,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
      },
    };
  }

  /**
   * Hesabı sil
   */
  @Delete('me')
  @ApiOperation({ summary: 'Delete current user account' })
  @RateLimit(1, 3600) // Saatte 1 silme denemesi
  async deleteAccount(@CurrentUser() user: { id: string }) {
    await this.usersService.delete(user.id);
    return { success: true, message: 'Hesap başarıyla silindi' };
  }
}
