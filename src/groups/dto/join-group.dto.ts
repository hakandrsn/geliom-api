import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class JoinGroupDto {
  @ApiProperty({ description: 'Group invite code', example: 'ABC123' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(6, 6, { message: 'Davet kodu 6 karakter olmalıdır' })
  inviteCode: string;
}
