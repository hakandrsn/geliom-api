import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({ description: 'Group ID' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ description: 'Status ID' })
  @IsInt()
  @Min(1)
  statusId: number;
}
