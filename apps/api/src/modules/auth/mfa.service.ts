import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto.service';

/**
 * TOTP-based 2FA service (Wave 18d).
 *
 * - Secrets are AES-256-GCM encrypted at rest via CryptoService.
 * - Backup codes are sha256-hashed with a per-user salt; user gets the
 *   plaintext exactly once at provision time.
 * - `enabled=false` until `verifyAndEnable` succeeds, so a half-provisioned
 *   user can still log in normally.
 */
@Injectable()
export class MfaService {
  // Salt prefix for backup-code hashing. Combined with userId so that even
  // if the row is leaked, the 8-digit code space can't be precomputed
  // tenant-wide.
  private static readonly BACKUP_SALT_PREFIX = 'tokenwave-mfa-backup';

  /**
   * TOTP epoch tolerance in seconds. 30s = ±1 step (OWASP guideline) so
   * users transitioning between steps don't false-fail.
   */
  private readonly epochTolerance: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    config: ConfigService,
  ) {
    this.epochTolerance = Number(config.get('MFA_TOTP_TOLERANCE_SEC') ?? 30);
  }

  /**
   * Generate a fresh secret + 10 backup codes. Stores the secret encrypted
   * with `enabled=false`. Returns the otpauth URL, a QR SVG, and the
   * plaintext backup codes (the only time they're ever shown).
   *
   * If the user already has an enabled MFA record, throws — caller must
   * disable first to rotate.
   */
  async provision(
    userId: string,
  ): Promise<{ otpauth_url: string; qr_svg: string; backup_codes: string[] }> {
    // The userId here came from an already-validated JWT (the controller
    // pulls it from req.user.id), so a unique-key lookup is safe — the
    // tenant binding has already been verified by JwtStrategy.
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: { tenant: true, mfa: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    if (user.mfa?.enabled) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA is already enabled. Disable it first to re-provision.',
      });
    }

    const secret = generateSecret();
    const issuer = 'Tokenwave';
    const account = `${user.tenant.slug}:${user.email}`;
    const otpauthUrl = generateURI({ secret, issuer, label: account });
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1 });

    const backupCodes = Array.from({ length: 10 }, () => this.generateBackupCode());
    const hashedCodes = backupCodes.map((c) => this.hashBackupCode(userId, c));
    const secretEncrypted = this.crypto.encryptString(secret);

    await this.prisma.userMfaSecret.upsert({
      where: { userId },
      create: {
        userId,
        secretEncrypted,
        enabled: false,
        backupCodes: hashedCodes,
      },
      update: {
        // Re-provisioning a not-yet-enabled record overwrites the secret
        // and codes. (The enabled-record case is rejected above.)
        secretEncrypted,
        enabled: false,
        enabledAt: null,
        backupCodes: hashedCodes,
      },
    });

    return { otpauth_url: otpauthUrl, qr_svg: qrSvg, backup_codes: backupCodes };
  }

  /** Verifies a TOTP code against the *not-yet-enabled* secret and flips enabled=true. */
  async verifyAndEnable(userId: string, code: string): Promise<boolean> {
    const rec = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    if (!rec) {
      throw new BadRequestException({ code: 'MFA_NOT_PROVISIONED', message: 'Run provision first' });
    }
    if (rec.enabled) {
      throw new ConflictException({ code: 'MFA_ALREADY_ENABLED', message: 'MFA already enabled' });
    }
    const secret = this.crypto.decryptString(rec.secretEncrypted);
    const normalized = this.normalizeCode(code);
    if (!/^\d{6}$/.test(normalized)) return false;
    let ok = false;
    try {
      ok = verifySync({
        secret,
        token: normalized,
        epochTolerance: this.epochTolerance,
      }).valid;
    } catch {
      ok = false;
    }
    if (!ok) return false;
    await this.prisma.userMfaSecret.update({
      where: { userId },
      data: { enabled: true, enabledAt: new Date() },
    });
    return true;
  }

  /**
   * Login-flow check. Accepts either a valid TOTP or one unused backup
   * code. A consumed backup code is removed from the array (one-time use).
   */
  async verifyForLogin(userId: string, code: string): Promise<boolean> {
    const rec = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    if (!rec || !rec.enabled) return false;

    const normalized = this.normalizeCode(code);
    const secret = this.crypto.decryptString(rec.secretEncrypted);
    // otplib v13 throws on tokens of the wrong length, so only attempt
    // the TOTP path for 6-digit inputs.
    if (/^\d{6}$/.test(normalized)) {
      try {
        if (
          verifySync({ secret, token: normalized, epochTolerance: this.epochTolerance })
            .valid
        ) {
          return true;
        }
      } catch {
        // fall through to backup-code path
      }
    }

    // Try backup code path. 8-digit backup codes are numeric; reject early
    // if it's clearly a TOTP (6 digits).
    if (!/^\d{8}$/.test(normalized)) return false;
    const candidate = this.hashBackupCode(userId, normalized);
    const idx = rec.backupCodes.indexOf(candidate);
    if (idx === -1) return false;

    const remaining = rec.backupCodes.slice(0, idx).concat(rec.backupCodes.slice(idx + 1));
    await this.prisma.userMfaSecret.update({
      where: { userId },
      data: { backupCodes: remaining },
    });
    return true;
  }

  /** Disable MFA for a user. Requires a valid TOTP/backup code first. */
  async disable(userId: string, code: string): Promise<boolean> {
    const ok = await this.verifyForLogin(userId, code);
    if (!ok) return false;
    await this.prisma.userMfaSecret.delete({ where: { userId } });
    return true;
  }

  /** Whether the user has a fully-enabled MFA record. */
  async isEnabled(userId: string): Promise<boolean> {
    const rec = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    return !!rec?.enabled;
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  private generateBackupCode(): string {
    // 8 digits, zero-padded. randomInt is uniform in [min, max).
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
  }

  private hashBackupCode(userId: string, code: string): string {
    return createHash('sha256')
      .update(`${MfaService.BACKUP_SALT_PREFIX}:${userId}:${code}`)
      .digest('hex');
  }

  private normalizeCode(code: string): string {
    return (code ?? '').replace(/\s|-/g, '').trim();
  }
}
