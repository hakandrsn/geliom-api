import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'displayName boş olamaz' })
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description:
      'Avatar: "avatar:<key>" (uygulamaya gömülü karakter), "tint:<0-7>" (baş harf tonu), https URL; null = kaldır',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(avatar:[a-z0-9-]{1,40}|tint:[0-7]|https:\/\/\S+)$/, {
    message: 'Geçersiz avatar değeri',
  })
  photoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Uygulama içi genel bildirim tercihi' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}
