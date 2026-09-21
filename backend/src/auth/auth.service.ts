import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthResponseDto, AuthUserDto } from './dto/auth.dto';
import { UsersRepository, UserRecord } from './users.repository';

export interface JwtPayload {
  sub: string;
  email: string;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Creates the demo account on first boot so the dashboard is usable at once. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('app.seedUserEmail');
    const password = this.config.get<string>('app.seedUserPassword');
    if (!email || !password) return;

    const created = await this.users.createIfMissing(email, await bcrypt.hash(password, BCRYPT_ROUNDS));
    if (created) this.logger.log(`Seeded demo user ${email}`);
  }

  async register(email: string, password: string): Promise<AuthResponseDto> {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('An account with that email already exists');

    const user = await this.users.create(email, await bcrypt.hash(password, BCRYPT_ROUNDS));
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(email);
    // Compare against a dummy hash when the user is missing so that a wrong
    // email and a wrong password take the same time to answer.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    return this.issue(user);
  }

  /**
   * Used by both the HTTP guard and the socket handshake, so a token is
   * accepted on exactly the same terms in both transports.
   */
  async verify(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async findById(id: string): Promise<AuthUserDto> {
    const user = await this.users.findById(id);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return toAuthUser(user);
  }

  private async issue(user: UserRecord): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: toAuthUser(user),
    };
  }
}

function toAuthUser(user: UserRecord): AuthUserDto {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}
