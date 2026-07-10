import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Sınırlar socket tarafındaki validateStatusPayload ile aynı tutulur
export class AddMoodDto {
  @ApiProperty({ description: 'Mood text', example: 'Kahve molası' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'text zorunludur' })
  @MaxLength(200)
  text: string;

  @ApiPropertyOptional({ description: 'Mood emoji', example: '☕' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiProperty({ description: 'Mood key', example: 'relaxed' })
  @IsString()
  @IsNotEmpty({ message: 'mood zorunludur' })
  @MaxLength(50)
  mood: string;
}
