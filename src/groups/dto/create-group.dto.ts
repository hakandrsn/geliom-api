import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { GROUP_NAME_RULES } from '../../common/constants/premium.constants';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'Group name', example: 'Arkadaşlar' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Grup adı zorunludur' })
  @MinLength(GROUP_NAME_RULES.MIN_LENGTH, {
    message: `Grup adı en az ${GROUP_NAME_RULES.MIN_LENGTH} karakter olmalıdır`,
  })
  @MaxLength(GROUP_NAME_RULES.MAX_LENGTH, {
    message: `Grup adı en fazla ${GROUP_NAME_RULES.MAX_LENGTH} karakter olabilir`,
  })
  name: string;
}
