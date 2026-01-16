import { IsString, IsOptional, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'Group name', example: 'Arkadaşlar' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Group type', example: 'friends' })
  @IsString()
  @MaxLength(50)
  type: string;

  @ApiPropertyOptional({ description: 'Maximum member count', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  memberLimit?: number;
}
