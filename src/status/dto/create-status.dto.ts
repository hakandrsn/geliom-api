import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStatusDto {
  @ApiProperty({ description: 'Status text', example: 'Çalışıyorum' })
  @IsString()
  @MaxLength(100)
  text: string;

  @ApiPropertyOptional({ description: 'Status emoji', example: '💼' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string;

  @ApiPropertyOptional({ description: 'Should notify others', default: false })
  @IsOptional()
  @IsBoolean()
  notifies?: boolean;

  @ApiPropertyOptional({ description: 'Group ID (for group-specific status)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
