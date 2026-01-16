import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinGroupDto {
  @ApiProperty({ description: 'Group invite code', example: 'ABC123' })
  @IsString()
  @Length(6, 6, { message: 'Davet kodu 6 karakter olmalıdır' })
  inviteCode: string;
}
