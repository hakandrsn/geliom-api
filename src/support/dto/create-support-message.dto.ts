import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SUPPORT_CATEGORIES = ['bug', 'suggestion', 'account', 'premium', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export class CreateSupportMessageDto {
  @ApiProperty({ enum: SUPPORT_CATEGORIES, example: 'bug' })
  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category: SupportCategory;

  @ApiProperty({ description: 'Kullanıcının mesajı', maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Mesaj boş olamaz' })
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Uygulama sürümü / platform gibi cihaz bilgisi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  appInfo?: string;
}
