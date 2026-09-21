import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'demo@pulseboard.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo1234', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  // bcrypt silently ignores anything past 72 bytes, so reject it up front.
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@pulseboard.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() createdAt!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT to send as a Bearer token and in the socket handshake.' })
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
