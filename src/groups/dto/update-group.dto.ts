import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { GROUP_NAME_RULES } from '../../common/constants/premium.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateGroupDto {
  @ApiPropertyOptional({ description: 'Group name' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Grup adı boş olamaz' })
  @MinLength(GROUP_NAME_RULES.MIN_LENGTH, {
    message: `Grup adı en az ${GROUP_NAME_RULES.MIN_LENGTH} karakter olmalıdır`,
  })
  @MaxLength(GROUP_NAME_RULES.MAX_LENGTH, {
    message: `Grup adı en fazla ${GROUP_NAME_RULES.MAX_LENGTH} karakter olabilir`,
  })
  name?: string;

  @ApiPropertyOptional({ description: 'Group description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
