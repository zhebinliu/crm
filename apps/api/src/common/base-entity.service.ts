import { WorkflowTrigger } from '@prisma/client';
import { WorkflowService } from '../modules/workflow/workflow.service';
import { ValidationRuleService } from '../modules/workflow/validation-rule.service';
import { AuditService } from '../modules/workflow/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestUser } from './types/request-context';
import { OutboxService } from './outbox.service';

/** Shared by all LTC entity services for consistent workflow/audit behaviour. */
export abstract class BaseEntityService {
  constructor(
    protected readonly workflow: WorkflowService,
    protected readonly validation: ValidationRuleService,
    protected readonly audit: AuditService,
    protected readonly emitter: EventEmitter2,
    protected readonly outbox: OutboxService,
  ) {}

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
    await this.outbox.emit(tenantId, `${objectApiName}.updated`, objectApiName, record['id'] as string, record);
    await this.workflow.trigger({ tenantId, objectApiName, trigger: WorkflowTrigger.ON_UPDATE, record, previous, user });
    await this.workflow.trigger({ tenantId, objectApiName, trigger: WorkflowTrigger.ON_FIELD_CHANGE, record, previous, user });
  }
}
