import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Tüm alanlar opsiyonel — yalnızca gönderilenler güncellenir. */
export class UpdateNotificationsDto {
  @ApiPropertyOptional({ description: 'Bu gruptan bildirim al' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Durum değişikliklerinde bildir' })
  @IsOptional()
  @IsBoolean()
  statusUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Ruh hali değişikliklerinde bildir' })
  @IsOptional()
  @IsBoolean()
  moodUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Bildirim istenmeyen üye ID listesi', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mutedUserIds?: string[];
}
