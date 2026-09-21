import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersRepository, UserRecord } from './users.repository';

const PASSWORD = 'correct-horse';

function makeUser(passwordHash: string): UserRecord {
  return {
    id: 'a0d6a0a4-0000-4000-8000-000000000001',
    email: 'demo@pulseboard.dev',
    passwordHash,
    createdAt: '2026-09-21T00:00:00.000Z',
  };
}

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UsersRepository, 'findByEmail' | 'findById' | 'create' | 'createIfMissing'>>;
  let service: AuthService;
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createIfMissing: jest.fn(),
    };

    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
    const config = { get: (key: string) => (key === 'app.seedUserEmail' ? undefined : undefined) } as ConfigService;
    service = new AuthService(users as unknown as UsersRepository, jwt, config);
  });

  describe('login', () => {
    it('returns a verifiable token for the right password', async () => {
      users.findByEmail.mockResolvedValue(makeUser(hash));

      const result = await service.login('demo@pulseboard.dev', PASSWORD);

      expect(result.user.email).toBe('demo@pulseboard.dev');
      await expect(service.verify(result.accessToken)).resolves.toMatchObject({
        sub: result.user.id,
        email: 'demo@pulseboard.dev',
      });
    });

    it('rejects a wrong password', async () => {
      users.findByEmail.mockResolvedValue(makeUser(hash));

      await expect(service.login('demo@pulseboard.dev', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown account without revealing that it is unknown', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.login('nobody@pulseboard.dev', PASSWORD)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('never returns the password hash', async () => {
      users.findByEmail.mockResolvedValue(makeUser(hash));

      const result = await service.login('demo@pulseboard.dev', PASSWORD);

      expect(JSON.stringify(result)).not.toContain(hash);
    });
  });

  describe('register', () => {
    it('stores a hash, not the password', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation(async (email, passwordHash) => makeUser(passwordHash) && {
        ...makeUser(passwordHash),
        email,
      });

      await service.register('new@pulseboard.dev', PASSWORD);

      const [, storedHash] = users.create.mock.calls[0];
      expect(storedHash).not.toBe(PASSWORD);
      await expect(bcrypt.compare(PASSWORD, storedHash)).resolves.toBe(true);
    });

    it('refuses a duplicate email', async () => {
      users.findByEmail.mockResolvedValue(makeUser(hash));

      await expect(service.register('demo@pulseboard.dev', PASSWORD)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('verify', () => {
    it('rejects a token signed with another secret', async () => {
      const foreign = new JwtService({ secret: 'someone-elses-secret' });
      const token = await foreign.signAsync({ sub: 'x', email: 'x@y.z' });

      await expect(service.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a garbage token', async () => {
      await expect(service.verify('not.a.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
