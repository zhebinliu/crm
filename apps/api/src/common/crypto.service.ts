import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * Column-level PII encryption helper.
 *
 * AES-256-GCM via Node's `crypto`. Master key from env `ENCRYPTION_KEY`
 * (32 bytes, hex). If absent, derive a stable dev-key from JWT_SECRET so
 * developer machines don't break — but log a loud warning, since this is
 * an obvious downgrade from a real KMS-managed key.
 *
 * Token format: base64url("<iv>.<ciphertext>.<tag>"), each segment also
 * base64url. The whole thing is one opaque string the caller can store.
 *
 * Policy (Wave 18d):
 *   - Used today for `UserMfaSecret.secretEncrypted`.
 *   - DO NOT retrofit existing PII columns yet (Lead.email, Contact.phone,
 *     etc.) — that requires a one-shot migration job to re-encrypt every
 *     row and update read paths to decrypt. Tracked separately. Helper is
 *     here for new columns.
 */
@Injectable()
export class CryptoService {
  private readonly log = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex = config.get<string>('ENCRYPTION_KEY');
    if (hex) {
      const buf = Buffer.from(hex, 'hex');
      if (buf.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY must decode to 32 bytes (64 hex chars); got ${buf.length}`,
        );
      }
      this.key = buf;
    } else {
      const seed = config.get<string>('JWT_SECRET') ?? 'dev-secret';
      this.log.warn(
        'ENCRYPTION_KEY not set — deriving dev key from JWT_SECRET. ' +
          'INSECURE; set ENCRYPTION_KEY to 32 bytes hex in production.',
      );
      // scrypt gives us a deterministic 32-byte key from JWT_SECRET so dev
      // restarts don't invalidate previously-encrypted columns.
      this.key = scryptSync(seed, 'tokenwave-pii-v1', 32);
    }
  }

  /** AES-256-GCM encrypt; returns base64 "iv.ct.tag". */
  encryptString(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join('.');
  }

  /** Reverse of `encryptString`. Throws if tag verification fails. */
  decryptString(token: string): string {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error('Malformed crypto token (expected iv.ct.tag)');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const ct = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  }

  /**
   * Non-reversible hash for indexed PII lookup (e.g. find-by-email-hash
   * without storing the raw email). Salt is per-column / per-purpose.
   */
  hash(plain: string, salt = 'tokenwave'): string {
    return createHash('sha256').update(`${salt}:${plain}`).digest('hex');
  }
}

@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
