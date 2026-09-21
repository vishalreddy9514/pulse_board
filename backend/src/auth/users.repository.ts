import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.query<UserRow>(
      'SELECT id, email, password_hash, created_at FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    const rows = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, password_hash, created_at`,
      [email.toLowerCase(), passwordHash],
    );
    return toRecord(rows[0]);
  }

  /** Used to seed the demo account without failing when it already exists. */
  async createIfMissing(email: string, passwordHash: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email.toLowerCase(), passwordHash],
    );
    return rows.length > 0;
  }
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
  };
}
