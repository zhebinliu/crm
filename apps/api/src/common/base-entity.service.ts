import { WorkflowTrigger } from '@prisma/client';
import { Optional } from '@nestjs/common';
import { WorkflowService } from '../modules/workflow/workflow.service';
import { ValidationRuleService } from '../modules/workflow/validation-rule.service';
import { AuditService } from '../modules/workflow/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestUser } from './types/request-context';
import { OutboxService } from './outbox.service';
import { RecycleBinService } from '../modules/recycle-bin/recycle-bin.service';
import type { EmbeddingService } from '../modules/embeddings/embedding.service';
import { FieldHistoryService } from './field-history.service';

/** Shared by all LTC entity services for consistent workflow/audit behaviour. */
export abstract class BaseEntityService {
  /**
   * RecycleBinService is optional so existing services (and unit tests) that
   * extend BaseEntityService without RecycleBinModule continue to compile.
   * Subclasses that need recycle-bin support should either inject it themselves
   * or call `afterSoftDelete` after their soft-delete write.
   */
  protected readonly recycleBin?: RecycleBinService;

  /**
   * FieldHistoryService is optional for the same reason — extending services
   * compiled before Wave 18b wired FieldHistoryModule into AppModule should
   * keep working. When present, every afterUpdate writes a row per changed
   * field into `field_history`.
   */
  protected readonly fieldHistory?: FieldHistoryService;

  /**
   * Optional semantic-search hook. Subclasses that want their records
   * indexed for RAG retrieval set this in their constructor and override
   * {@link buildEmbeddingContent} to project the record into a string.
   */
  protected embeddings?: EmbeddingService;

  constructor(
    protected readonly workflow: WorkflowService,
    protected readonly validation: ValidationRuleService,
    protected readonly audit: AuditService,
    protected readonly emitter: EventEmitter2,
    protected readonly outbox: OutboxService,
    @Optional() recycleBin?: RecycleBinService,
    @Optional() fieldHistory?: FieldHistoryService,
  ) {
    this.recycleBin = recycleBin;
    this.fieldHistory = fieldHistory;
  }

  /**
   * Subclasses override to provide the text to embed for a given record.
   * Returning null/empty disables embedding for that record. Default: no
   * embedding.
   */
  protected buildEmbeddingContent(
    _objectApiName: string,
    _record: Record<string, unknown>,
  ): string | null {
    return null;
  }

  /**
   * Fire-and-forget embedding upsert. Always swallows errors so that
   * record writes are never blocked by the AI subsystem.
   */
  private scheduleEmbeddingUpsert(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
  ) {
    if (!this.embeddings) return;
    const content = this.buildEmbeddingContent(objectApiName, record);
    if (!content) return;
    const recordId = record['id'] as string | undefined;
    if (!recordId) return;
    // Run async; don't await, don't block.
    void this.embeddings
      .upsertRecordEmbedding(tenantId, objectApiName, recordId, content)
      .catch(() => {
        /* already logged inside the service */
      });
  }

  protected async beforeSave(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
    previous?: Record<string, unknown>,
    user?: RequestUser,
  ) {
    await this.validation.validate(tenantId, objectApiName, record, previous, user);
  }

  protected async afterCreate(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
    user?: RequestUser,
  ) {
    await this.audit.log({ tenantId, actorId: user?.id, action: 'create', recordType: objectApiName, recordId: record['id'] as string });
    await this.outbox.emit(tenantId, `${objectApiName}.created`, objectApiName, record['id'] as string, record);
    await this.workflow.trigger({ tenantId, objectApiName, trigger: WorkflowTrigger.ON_CREATE, record, user });
    this.scheduleEmbeddingUpsert(tenantId, objectApiName, record);
  }

  protected async afterUpdate(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
    previous: Record<string, unknown>,
    user?: RequestUser,
  ) {
    const changes = this.audit.diff(previous, record);
    await this.audit.log({ tenantId, actorId: user?.id, action: 'update', recordType: objectApiName, recordId: record['id'] as string, changes });
    if (this.fieldHistory && Object.keys(changes).length > 0) {
      await this.fieldHistory.record(tenantId, objectApiName, record['id'] as string, changes, user?.id);
    }
    await this.outbox.emit(tenantId, `${objectApiName}.updated`, objectApiName, record['id'] as string, record);
    await this.workflow.trigger({ tenantId, objectApiName, trigger: WorkflowTrigger.ON_UPDATE, record, previous, user });
    await this.workflow.trigger({ tenantId, objectApiName, trigger: WorkflowTrigger.ON_FIELD_CHANGE, record, previous, user });
    this.scheduleEmbeddingUpsert(tenantId, objectApiName, record);
  }

  /**
   * Hookable: subclass services should call this after a successful soft-delete
   * (i.e. after `prisma.X.update({ deletedAt: now() })`). Writes a
   * RecycleBinEntry so the record shows up in the SF-style Recycle Bin and
   * gets purged after 30 days.
   *
   * No-op when RecycleBinService isn't injected (keeps unit tests green).
   */
  protected async afterSoftDelete(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
    user?: RequestUser,
  ) {
    const recordId = record['id'] as string;
    await this.audit.log({ tenantId, actorId: user?.id, action: 'delete', recordType: objectApiName, recordId });
    await this.outbox.emit(tenantId, `${objectApiName}.deleted`, objectApiName, recordId, record);
    if (this.recycleBin) {
      await this.recycleBin.record(tenantId, objectApiName, recordId, snapshotOf(record), user?.id);
    }
  }
}

/**
 * Build a small snapshot suitable for showing in the recycle bin UI.
 * We avoid storing the full record (PII surface, size); we keep the most
 * commonly displayed columns plus a couple of identifiers.
 */
function snapshotOf(record: Record<string, unknown>): Record<string, unknown> {
  const KEEP = [
    'name', 'firstName', 'lastName', 'company', 'email', 'phone',
    'subject', 'caseNumber', 'stage', 'amount', 'closeDate',
    'orderNumber', 'quoteNumber', 'contractNumber', 'status', 'type',
    'ownerId', 'createdAt',
  ];
  const out: Record<string, unknown> = {};
  for (const k of KEEP) {
    if (record[k] !== undefined && record[k] !== null) out[k] = record[k];
  }
  return out;
}
