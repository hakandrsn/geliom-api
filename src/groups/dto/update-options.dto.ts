import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OPTION_TEXT_MAX } from '../../common/group-options';

export class OptionInputDto {
  @ApiPropertyOptional({ description: "Var olan seçeneğin id'si; yeni seçenekte gönderilmez" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ example: 'Kahve molası' })
  @IsString()
  @IsNotEmpty({ message: 'Seçenek metni boş olamaz' })
  @MaxLength(OPTION_TEXT_MAX, {
    message: `Seçenek metni en fazla ${OPTION_TEXT_MAX} karakter olabilir`,
  })
  text: string;

  @ApiPropertyOptional({ example: '☕' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiPropertyOptional({ description: 'Yalnızca durum: bu duruma geçince bildirim gitsin mi', default: true })
  @IsOptional()
  @IsBoolean()
  notifies?: boolean;
}

/**
 * Grubun seçenek listelerini SIRASIYLA ve TAMAMEN değiştirir. Gönderilmeyen
 * liste olduğu gibi kalır. Listede olmayan seçenek silinmiş sayılır.
 */
export class UpdateOptionsDto {
  @ApiPropertyOptional({ type: [OptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'En az bir durum seçeneği kalmalı' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => OptionInputDto)
  statusOptions?: OptionInputDto[];

  @ApiPropertyOptional({ type: [OptionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'En az bir ruh hali seçeneği kalmalı' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => OptionInputDto)
  moodOptions?: OptionInputDto[];
}
