import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WorkflowTrigger } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import type { RequestUser } from '../../common/types/request-context';

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly workflow: WorkflowService,
    private readonly validation: ValidationRuleService,
    private readonly audit: AuditService,
  ) {}

  private getStandardDelegate(objectApiName: string) {
    const name = objectApiName.toLowerCase();
    const map: Record<string, any> = {
      'lead': this.prisma.lead,
      'account': this.prisma.account,
      'contact': this.prisma.contact,
      'opportunity': this.prisma.opportunity,
      'product': this.prisma.product,
      'pricebook': this.prisma.priceBook,
      'quote': this.prisma.quote,
      'order': this.prisma.order,
      'contract': this.prisma.contract,
      'activity': this.prisma.activity,
    };
    return map[name] || null;
  }

  /**
   * Tries to find a specialized service for the object (e.g. ContactService).
   * This allows triggering business logic (workflows, validation) in those services.
   */
  private async getSpecializedService(objectApiName: string): Promise<any> {
    const serviceName = `${objectApiName.charAt(0).toUpperCase()}${objectApiName.slice(1).toLowerCase()}Service`;
    try {
      return this.moduleRef.get(serviceName, { strict: false });
    } catch (e) {
      return null;
    }
  }

  /**
   * Filter data to only include fields defined in metadata for this object.
   * This prevents Prisma from crashing on unknown fields sent from the frontend.
   */
  private async sanitizeData(tenantId: string, objectApiName: string, data: any) {
    const objDef = await this.prisma.objectDef.findUnique({
      where: { tenantId_apiName: { tenantId, apiName: objectApiName.toLowerCase() } },
      include: { fields: true },
    });

    if (!objDef) return { sanitized: data, customData: data.customData || {} };

    // If it's a system object, we are more permissive with fields 
    // because Prisma will validate it anyway, and metadata might be incomplete
    if (objDef.isSystem) {
      return { sanitized: data, customData: data.customData || {} };
    }

    const allowedFields = new Set([
      ...objDef.fields.map(f => f.apiName),
      'ownerId',
      'tenantId',
      'id',
      'createdAt',
      'updatedAt'
    ]);
    const sanitized: any = {};
    const customData: any = data.customData || {};

    for (const [key, val] of Object.entries(data)) {
      if (key === 'customData') continue;
      if (allowedFields.has(key)) {
        sanitized[key] = val;
      }
    }

    return { sanitized, customData };
  }

  async listRecords(tenantId: string, objectApiName: string, query: any) {
    const delegate = this.getStandardDelegate(objectApiName);
    if (delegate) {
      return delegate.findMany({ 
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' }
      });
    }

    // Custom Object
    const records = await this.prisma.customRecord.findMany({
      where: { tenantId, objectApiName: objectApiName.toLowerCase() },
      orderBy: { createdAt: 'desc' }
    });
    return records.map(r => ({ id: r.id, ...((r.data as any) || {}) }));
  }

  async getRecord(tenantId: string, objectApiName: string, id: string) {
    const delegate = this.getStandardDelegate(objectApiName);
    let record;
    if (delegate) {
      record = await delegate.findUnique({ where: { id, tenantId } });
    } else {
      const cr = await this.prisma.customRecord.findUnique({ where: { id, tenantId } });
      if (cr && cr.objectApiName.toLowerCase() === objectApiName.toLowerCase()) {
        record = { id: cr.id, ...((cr.data as any) || {}) };
      }
    }
    
    if (!record) throw new NotFoundException(`Record not found`);
    return record;
  }

  async createRecord(user: RequestUser, objectApiName: string, data: any) {
    const tenantId = user.tenantId;
    const delegate = this.getStandardDelegate(objectApiName);
    const { sanitized, customData } = await this.sanitizeData(tenantId, objectApiName, data);

    // Try specialized service first (to trigger workflows, validations, etc)
    const specialized = await this.getSpecializedService(objectApiName);
    if (specialized && typeof specialized.create === 'function') {
      const payload = { ...sanitized };
      if (Object.keys(customData).length > 0) payload.customFields = customData;
      
      // Ensure ownerId is present if not already provided (it's often filtered by sanitizeData)
      if (!payload.ownerId) {
        payload.ownerId = user.id;
      }
      
      return specialized.create(tenantId, payload, user);
    }

    if (delegate) {
      const ownerId = sanitized.ownerId || data.ownerId || user.id;
      const dbPayload: any = { 
        ...sanitized,
        tenantId,
        ownerId,
      };

      // Convert date-like strings to Date objects
      for (const key in dbPayload) {
        if (typeof dbPayload[key] === 'string' && (key.toLowerCase().endsWith('date') || key.toLowerCase().endsWith('at'))) {
          const d = new Date(dbPayload[key]);
          if (!isNaN(d.getTime())) {
            dbPayload[key] = d;
          }
        }
      }
      
      if (Object.keys(customData).length > 0) {
         dbPayload.customFields = customData;
      }
      
      // Generic Path: Trigger Valdiation
      await this.validation.validate(tenantId, objectApiName, dbPayload, undefined, user);

      const record = await delegate.create({ data: dbPayload as any });

      // Generic Path: Trigger Audit & Workflow
      await this.audit.log({ tenantId, actorId: user.id, action: 'create', recordType: objectApiName, recordId: record.id });
      await this.workflow.trigger({
        tenantId,
        objectApiName,
        trigger: WorkflowTrigger.ON_CREATE,
        record: record as any,
        user
      });

      return record;
    }

    // Custom Object fallback
    await this.validation.validate(tenantId, objectApiName, sanitized, undefined, user);
    const cr = await this.prisma.customRecord.create({
      data: {
        tenantId,
        objectApiName: objectApiName.toLowerCase(),
        ownerId: data.ownerId || user.id,
        data: { ...sanitized, ...customData },
      },
    });

    const record = { id: cr.id, ...((cr.data as any) || {}) };
    await this.audit.log({ tenantId, actorId: user.id, action: 'create', recordType: objectApiName, recordId: cr.id });
    await this.workflow.trigger({
      tenantId,
      objectApiName,
      trigger: WorkflowTrigger.ON_CREATE,
      record: record as any,
      user
    });
    return record;
  }

  async updateRecord(user: RequestUser, objectApiName: string, id: string, data: any) {
    const tenantId = user.tenantId;
    const delegate = this.getStandardDelegate(objectApiName);
    const { sanitized, customData } = await this.sanitizeData(tenantId, objectApiName, data);

    // Try specialized service first
    const specialized = await this.getSpecializedService(objectApiName);
    if (specialized && typeof specialized.update === 'function') {
      const payload = { ...sanitized };
      if (Object.keys(customData).length > 0) payload.customFields = customData;
      return specialized.update(tenantId, id, payload, user);
    }

    if (delegate) {
      const dbPayload: any = { ...sanitized };
      if (Object.keys(customData).length > 0) {
         dbPayload.customFields = customData;
      }

      const previous = await this.getRecord(tenantId, objectApiName, id);
      await this.validation.validate(tenantId, objectApiName, dbPayload, previous, user);

      const record = await delegate.update({
        where: { id, tenantId },
        data: dbPayload,
      });

      const changes = this.audit.diff(previous, record);
      await this.audit.log({ tenantId, actorId: user.id, action: 'update', recordType: objectApiName, recordId: id, changes });
      await this.workflow.trigger({
        tenantId,
        objectApiName,
        trigger: WorkflowTrigger.ON_UPDATE,
        record: record as any,
        previous,
        user
      });

      return record;
    }

    // Custom Object
    const exist = await this.prisma.customRecord.findUnique({ where: { id, tenantId } });
    if (!exist || exist.objectApiName.toLowerCase() !== objectApiName.toLowerCase()) throw new NotFoundException();

    const previous = { id: exist.id, ...(exist.data as any) };
    const mergedData = { ...(exist.data as any), ...sanitized, ...customData };
    
    await this.validation.validate(tenantId, objectApiName, mergedData, previous, user);

    const updatedCr = await this.prisma.customRecord.update({
      where: { id },
      data: { data: mergedData },
    });

    const record = { id: updatedCr.id, ...((updatedCr.data as any) || {}) };
    await this.audit.log({ tenantId, actorId: user.id, action: 'update', recordType: objectApiName, recordId: id });
    await this.workflow.trigger({
      tenantId,
      objectApiName,
      trigger: WorkflowTrigger.ON_UPDATE,
      record: record as any,
      previous,
      user,
    });
    return record;
  }

  async deleteRecord(user: RequestUser, objectApiName: string, id: string) {
    const tenantId = user.tenantId;
    const delegate = this.getStandardDelegate(objectApiName);
    
    // Try specialized service first
    const specialized = await this.getSpecializedService(objectApiName);
    if (specialized && typeof specialized.softDelete === 'function') {
      return specialized.softDelete(tenantId, id);
    }

    const previous = await this.getRecord(tenantId, objectApiName, id);

    if (delegate) {
      const record = await delegate.update({ 
        where: { id, tenantId },
        data: { deletedAt: new Date() } as any 
      });
      await this.audit.log({ tenantId, actorId: user.id, action: 'delete', recordType: objectApiName, recordId: id });
       // We don't have ON_DELETE trigger in WorkflowTrigger enum currently, 
       // but we log the audit.
      return record;
    }
    
    const res = await this.prisma.customRecord.delete({
      where: { id, tenantId, objectApiName: objectApiName.toLowerCase() },
    });
    await this.audit.log({ tenantId, actorId: user.id, action: 'delete', recordType: objectApiName, recordId: id });
    return res;
  }
}
