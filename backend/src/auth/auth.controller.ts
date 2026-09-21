import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtPayload, AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { AuthResponseDto, AuthUserDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and receive a JWT' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange email and password for a JWT' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the account behind the current token' })
  @ApiResponse({ status: 200, type: AuthUserDto })
  me(@CurrentUser() user: JwtPayload): Promise<AuthUserDto> {
    return this.auth.findById(user.sub);
  }
}
