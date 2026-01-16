import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserMoodDto {
  @ApiProperty({ description: 'Group ID' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ description: 'Mood ID' })
  @IsInt()
  @Min(1)
  moodId: number;
}
