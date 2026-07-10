import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MuteGroupDto {
  @ApiProperty({ description: 'Mute state', example: true })
  @IsBoolean({ message: 'isMuted boolean olmalıdır' })
  isMuted: boolean;
}
