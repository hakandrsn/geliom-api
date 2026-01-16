import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Profile photo URL' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Avatar identifier' })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Show mood to others' })
  @IsBoolean()
  @IsOptional()
  showMood?: boolean;

  @ApiPropertyOptional({ description: 'Onboarding completed' })
  @IsBoolean()
  @IsOptional()
  hasCompletedOnboarding?: boolean;

  @ApiPropertyOptional({ description: 'OneSignal player ID for push notifications' })
  @IsString()
  @IsOptional()
  onesignalPlayerId?: string;
}
