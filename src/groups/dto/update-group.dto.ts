import { IsString, IsOptional, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateGroupDto {
  @ApiPropertyOptional({ description: 'Group name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Group type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ description: 'Maximum member count' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  memberLimit?: number;
}
