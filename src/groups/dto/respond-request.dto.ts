import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondRequestDto {
  @ApiProperty({ description: 'Join request response', enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'], { message: 'response APPROVED veya REJECTED olmalıdır' })
  response: 'APPROVED' | 'REJECTED';
}
