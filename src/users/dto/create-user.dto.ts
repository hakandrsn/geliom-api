import { IsString, IsEmail, IsOptional, IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  id: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;
}
