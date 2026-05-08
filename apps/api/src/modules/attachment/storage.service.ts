// ─── AttachmentStorageService ────────────────────────────────────────────
// S3-compatible attachment storage with a presigned-URL flow + a local
// filesystem fallback for `pnpm dev` (no S3 creds required).
//
// Backend strategy is selected by env STORAGE_BACKEND:
//   - "s3"    → presigned PUT against an S3 bucket (real or MinIO)
//   - "local" → file written to ./storage-data/<tenantId>/<key>, served by a
//               backend route that streams from disk after auth
//
// Lifecycle:
//   1. presignUpload  — create Attachment row (status=pending), return URL
//   2. (client uploads bytes to URL)
//   3. confirmUpload  — flip status=confirmed, set uploadedAt + checksum,
//                       virusScanStatus="skipped" (real AV scan is v2)
//   4. presignDownload — short-TTL signed GET URL
//   5. delete         — soft-delete (deletedAt). Blob purge is handled by a
//                       future cron (out of scope for v1).

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { createHmac } from 'crypto';
import * as path from 'path';

// ─── Allowlist & limits ──────────────────────────────────────────────────
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// MIME types we permit. Anything not on this list is refused. Specifically
// excludes executables, scripts, and shell formats.
const ALLOWED_CONTENT_TYPES = new Set<string>([
  // Images
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  // Docs
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Plain
  'text/plain', 'text/csv', 'text/markdown',
  // Archives (commonly needed)
  'application/zip',
  'application/json',
  // Generic binary fallback
  'application/octet-stream',
]);

// Disallowed extensions even if MIME slips through.
const BLOCKED_EXTENSIONS = new Set<string>([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.sh', '.bash',
  '.js', '.mjs', '.cjs', '.vbs', '.wsf', '.jar', '.app', '.dmg',
]);

// ─── Backend strategy contract ──────────────────────────────────────────
export interface PresignedUploadInfo {
  uploadUrl: string;
  attachmentId: string;
  storageKey: string;
  fields?: Record<string, string>;
  expiresAt: Date;
}

export interface PresignedDownloadInfo {
  url: string;
  expiresAt: Date;
}

interface StorageBackend {
  presignPut(key: string, contentType: string, sizeBytes: number, ttlSeconds: number): Promise<{ url: string; fields?: Record<string, string> }>;
  presignGet(key: string, attachmentId: string, ttlSeconds: number): Promise<{ url: string }>;
  /** Optional: only LocalStorage uses this to actually persist bytes. */
  writeBytes?(key: string, body: Buffer | Readable): Promise<void>;
  /** Optional: only LocalStorage uses this for the streaming download route. */
  readStream?(key: string): Promise<Readable>;
  exists?(key: string): Promise<boolean>;
  delete?(key: string): Promise<void>;
  readonly kind: 's3' | 'local';
}

// ─── Local-disk backend ─────────────────────────────────────────────────
class LocalStorage implements StorageBackend {
  readonly kind = 'local' as const;
  private readonly log = new Logger('LocalStorage');
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
    private readonly secret: string,
  ) {}

  private fullPath(key: string): string {
    // key already includes tenantId prefix, e.g. "tenantA/abc/file.pdf"
    return path.join(this.rootDir, key);
  }

  /** HMAC-SHA256 signature for short-TTL local URLs. */
  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  /** Verify a signed URL token. */
  verify(attachmentId: string, op: 'put' | 'get', expiresAt: number, sig: string): boolean {
    if (Date.now() > expiresAt) return false;
    const expected = this.sign(`${op}:${attachmentId}:${expiresAt}`);
    return expected === sig;
  }

  async presignPut(key: string, _ct: string, _sz: number, ttl: number) {
    const expiresAt = Date.now() + ttl * 1000;
    // The attachmentId is encoded inside the key as the basename's last segment;
    // upstream encodes <tenantId>/<attachmentId>/<filename>.
    const attachmentId = key.split('/')[1];
    const sig = this.sign(`put:${attachmentId}:${expiresAt}`);
    const url = `${this.publicBaseUrl}/api/attachments/${attachmentId}/local-upload?exp=${expiresAt}&sig=${sig}`;
    return { url, fields: {} };
  }

  async presignGet(_key: string, attachmentId: string, ttl: number) {
    const expiresAt = Date.now() + ttl * 1000;
    const sig = this.sign(`get:${attachmentId}:${expiresAt}`);
    const url = `${this.publicBaseUrl}/api/attachments/${attachmentId}/download?exp=${expiresAt}&sig=${sig}`;
    return { url };
  }

  async writeBytes(key: string, body: Buffer | Readable) {
    const full = this.fullPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (Buffer.isBuffer(body)) {
      await fs.writeFile(full, body);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
      }
      await fs.writeFile(full, Buffer.concat(chunks));
    }
    this.log.debug?.(`wrote ${full}`);
  }

  async readStream(key: string): Promise<Readable> {
    const full = this.fullPath(key);
    try {
      await fs.access(full);
    } catch {
      throw new NotFoundException('Attachment bytes not found on disk');
    }
    return createReadStream(full);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.fullPath(key));
    } catch {
      /* ignore */
    }
  }
}

// ─── S3 backend (lazy-loaded, only required when STORAGE_BACKEND=s3) ────
class S3Storage implements StorageBackend {
  readonly kind = 's3' as const;
  private clientP: Promise<unknown>;
  private signerP: Promise<{ getSignedUrl: (...args: unknown[]) => Promise<string> }>;
  private putCmdP: Promise<new (...args: unknown[]) => unknown>;
  private getCmdP: Promise<new (...args: unknown[]) => unknown>;
  private delCmdP: Promise<new (...args: unknown[]) => unknown>;

  constructor(
    private readonly bucket: string,
    region: string,
    endpoint: string | undefined,
    accessKeyId: string | undefined,
    secretAccessKey: string | undefined,
  ) {
    // Dynamic require so the module still boots when only LocalStorage is used.
    const sdk = require('@aws-sdk/client-s3');
    const presigner = require('@aws-sdk/s3-request-presigner');
    const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
    const client = new sdk.S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // MinIO-friendly
      credentials,
    });
    this.clientP = Promise.resolve(client);
    this.signerP = Promise.resolve(presigner);
    this.putCmdP = Promise.resolve(sdk.PutObjectCommand);
    this.getCmdP = Promise.resolve(sdk.GetObjectCommand);
    this.delCmdP = Promise.resolve(sdk.DeleteObjectCommand);
  }

  async presignPut(key: string, contentType: string, _sz: number, ttl: number) {
    const [client, presigner, PutCmd] = await Promise.all([this.clientP, this.signerP, this.putCmdP]);
    const cmd = new (PutCmd as new (...a: unknown[]) => unknown)({
      Bucket: this.bucket, Key: key, ContentType: contentType,
    });
    const url = await (presigner as { getSignedUrl: (...a: unknown[]) => Promise<string> }).getSignedUrl(client, cmd, { expiresIn: ttl });
    return { url };
  }

  async presignGet(key: string, _id: string, ttl: number) {
    const [client, presigner, GetCmd] = await Promise.all([this.clientP, this.signerP, this.getCmdP]);
    const cmd = new (GetCmd as new (...a: unknown[]) => unknown)({ Bucket: this.bucket, Key: key });
    const url = await (presigner as { getSignedUrl: (...a: unknown[]) => Promise<string> }).getSignedUrl(client, cmd, { expiresIn: ttl });
    return { url };
  }

  async delete(key: string) {
    const [client, DelCmd] = await Promise.all([this.clientP, this.delCmdP]);
    const cmd = new (DelCmd as new (...a: unknown[]) => unknown)({ Bucket: this.bucket, Key: key });
    await (client as { send: (c: unknown) => Promise<unknown> }).send(cmd);
  }
}

// ─── Service ────────────────────────────────────────────────────────────
@Injectable()
export class AttachmentStorageService implements OnModuleInit {
  private readonly log = new Logger(AttachmentStorageService.name);
  private backend!: StorageBackend;
  private localBackend?: LocalStorage; // retained for verify() / writeBytes() etc.

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  onModuleInit() {
    const which = (this.cfg.get<string>('STORAGE_BACKEND') ?? 'local').toLowerCase();
    if (which === 's3') {
      const bucket = this.cfg.get<string>('S3_BUCKET');
      const region = this.cfg.get<string>('S3_REGION') ?? 'us-east-1';
      if (!bucket) {
        this.log.warn('STORAGE_BACKEND=s3 but S3_BUCKET unset; falling back to local.');
        this.backend = this.makeLocal();
        this.localBackend = this.backend as LocalStorage;
        return;
      }
      this.backend = new S3Storage(
        bucket,
        region,
        this.cfg.get<string>('S3_ENDPOINT'),
        this.cfg.get<string>('S3_ACCESS_KEY_ID'),
        this.cfg.get<string>('S3_SECRET_ACCESS_KEY'),
      );
      this.log.log(`storage backend: s3://${bucket}`);
    } else {
      this.backend = this.makeLocal();
      this.localBackend = this.backend as LocalStorage;
      this.log.log('storage backend: local (./storage-data)');
    }
  }

  private makeLocal(): LocalStorage {
    const root = this.cfg.get<string>('LOCAL_STORAGE_DIR') ?? path.resolve(process.cwd(), 'storage-data');
    const base = this.cfg.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3000';
    const secret = this.cfg.get<string>('LOCAL_STORAGE_SECRET') ?? this.cfg.get<string>('JWT_SECRET') ?? 'dev-storage-secret';
    return new LocalStorage(root, base, secret);
  }

  /** Whether the current backend is local (used by controller to enable raw routes). */
  isLocal(): boolean {
    return this.backend.kind === 'local';
  }

  /** Verify a local presigned token (used by local-upload + download routes). */
  verifyLocalSignature(attachmentId: string, op: 'put' | 'get', exp: number, sig: string): boolean {
    if (!this.localBackend) return false;
    return this.localBackend.verify(attachmentId, op, exp, sig);
  }

  /** Write bytes locally (called from the local-upload controller route). */
  async writeLocalBytes(storageKey: string, body: Buffer | Readable) {
    if (!this.localBackend) throw new BadRequestException('local backend not active');
    await this.localBackend.writeBytes(storageKey, body);
  }

  /** Read stream locally (called from the local download controller route). */
  async readLocalStream(storageKey: string): Promise<Readable> {
    if (!this.localBackend) throw new BadRequestException('local backend not active');
    return this.localBackend.readStream!(storageKey);
  }

  // ─── Validation ────────────────────────────────────────────────────────
  private validateInput(filename: string, contentType: string, sizeBytes: number) {
    if (!filename || filename.length > 255) {
      throw new BadRequestException('invalid filename');
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
      throw new BadRequestException(`file size must be between 1 byte and ${MAX_SIZE_BYTES} bytes`);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(`content-type "${contentType}" is not allowed`);
    }
    const ext = path.extname(filename).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`file extension "${ext}" is not allowed`);
    }
  }

  /**
   * Step 1 of the upload flow. Validates input, creates a pending Attachment
   * row, and returns either a presigned PUT URL (S3) or a local upload URL.
   */
  async presignUpload(
    tenantId: string,
    uploaderId: string,
    args: {
      filename: string;
      contentType: string;
      sizeBytes: number;
      recordType?: string;
      recordId?: string;
    },
  ): Promise<PresignedUploadInfo> {
    this.validateInput(args.filename, args.contentType, args.sizeBytes);

    // Pre-create row to obtain an ID; we use it as part of the key so collisions
    // are impossible and the URL maps 1:1 to a row.
    const row = await this.prisma.attachment.create({
      data: {
        tenantId,
        uploaderId,
        filename: args.filename,
        contentType: args.contentType,
        size: args.sizeBytes,
        url: '', // filled on confirm / regenerated on demand
        targetType: args.recordType ?? '',
        targetId: args.recordId ?? '',
        storageBackend: this.backend.kind,
        sizeBytes: args.sizeBytes,
        uploadedById: uploaderId,
        status: 'pending',
        virusScanStatus: 'pending',
      },
    });

    const safeName = args.filename.replace(/[^\w.\-]+/g, '_');
    const storageKey = `${tenantId}/${row.id}/${safeName}`;
    // We just created this row inside this tenant; updateMany scopes by tenantId
    // to satisfy the tenant guard.
    await this.prisma.attachment.updateMany({
      where: { id: row.id, tenantId },
      data: { storageKey },
    });

    const ttl = 600; // 10 minutes
    const { url, fields } = await this.backend.presignPut(storageKey, args.contentType, args.sizeBytes, ttl);
    return {
      uploadUrl: url,
      attachmentId: row.id,
      storageKey,
      fields,
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  }

  /**
   * Step 3 of the upload flow. Marks the attachment confirmed.
   * Only the user who initiated the presign can confirm.
   */
  async confirmUpload(
    tenantId: string,
    attachmentId: string,
    actorId: string,
    checksum?: string,
  ) {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('attachment not found');
    if (row.uploadedById && row.uploadedById !== actorId) {
      throw new ForbiddenException('only the original uploader can confirm');
    }
    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: 'confirmed',
        uploadedAt: new Date(),
        checksum: checksum ?? row.checksum,
        // v1: no real virus scan. Mark "skipped" to make this explicit.
        virusScanStatus: 'skipped',
      },
    });
  }

  /** Short-TTL signed download URL. Tenant-scoped. */
  async presignDownload(
    tenantId: string,
    attachmentId: string,
    ttlSeconds = 600,
  ): Promise<PresignedDownloadInfo> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('attachment not found');
    if (!row.storageKey) throw new BadRequestException('attachment has no stored bytes');
    if (row.virusScanStatus === 'infected') {
      throw new ForbiddenException('attachment failed virus scan');
    }
    const { url } = await this.backend.presignGet(row.storageKey, row.id, ttlSeconds);
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /** Soft-delete the row. Blob purge is deferred to a future cron. */
  async softDelete(tenantId: string, attachmentId: string, _actorId: string) {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('attachment not found');
    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date(), status: 'deleted' },
    });
  }

  /** Lookup by id with tenant scoping (used by streaming/download routes). */
  async getRow(tenantId: string, attachmentId: string) {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, tenantId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('attachment not found');
    return row;
  }

  /** Used by local download/upload routes to look up by id WITHOUT tenant filter,
   *  because the URL is HMAC-signed; tenant scope is enforced by the signature
   *  binding to attachmentId, not by an auth header. Caller still verifies sig. */
  async getRowUnscoped(attachmentId: string) {
    // Tenant guard escape hatch: this route is signature-authenticated, not JWT.
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      // @ts-expect-error tenant guard escape hatch
      skipTenantGuard: true,
    });
    if (!row || row.deletedAt) throw new NotFoundException('attachment not found');
    return row;
  }
}
