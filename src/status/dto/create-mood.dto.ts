import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMoodDto {
  @ApiProperty({ description: 'Mood text', example: 'Mutlu' })
  @IsString()
  @MaxLength(50)
  text: string;

  @ApiPropertyOptional({ description: 'Mood emoji', example: '😊' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string;
}
