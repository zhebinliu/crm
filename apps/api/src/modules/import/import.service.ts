// ─── ImportService ─────────────────────────────────────────────────────────
// Bulk-import records from a CSV string. Headers are matched against
// per-object alias maps that accept BOTH the apiName and a few common
// Chinese / English aliases. Unknown columns are dropped silently. Each
// row goes through the standard service.create() so workflow rules,
// validation rules and audit log all fire normally.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadService } from '../lead/lead.service';
import { AccountService } from '../account/account.service';
import { ContactService } from '../contact/contact.service';
import { OpportunityService } from '../opportunity/opportunity.service';
import type { RequestUser } from '../../common/types/request-context';
import { parseCsv } from './csv.parser';

export interface ImportResult {
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string; values: Record<string, string> }>;
  /** Headers we recognized (apiName form). */
  recognizedHeaders: string[];
  /** Headers we ignored (no match in alias map). */
  ignoredHeaders: string[];
}

const MAX_ROWS = 5000;

// Per-object alias map. Key = lowercased header, value = canonical apiName.
// We accept both English (snake/camel) and Chinese label variants.
const LEAD_ALIASES: Record<string, string> = {
  firstname: 'firstName', '名': 'firstName',
  lastname: 'lastName', '姓': 'lastName', '姓名': 'lastName',
  company: 'company', '公司': 'company',
  title: 'title', '职位': 'title',
  email: 'email', '邮箱': 'email', '电子邮件': 'email',
  phone: 'phone', '电话': 'phone', '手机': 'phone',
  status: 'status', '状态': 'status',
  rating: 'rating', '评级': 'rating',
  source: 'source', '来源': 'source',
  industry: 'industry', '行业': 'industry',
  annualrevenue: 'annualRevenue', '年收入': 'annualRevenue',
  description: 'description', '描述': 'description', '备注': 'description',
};

const ACCOUNT_ALIASES: Record<string, string> = {
  name: 'name', '客户名称': 'name', '名称': 'name',
  type: 'type', '类型': 'type',
  industry: 'industry', '行业': 'industry',
  website: 'website', '网站': 'website',
  phone: 'phone', '电话': 'phone',
  annualrevenue: 'annualRevenue', '年收入': 'annualRevenue',
  employeecount: 'employeeCount', '员工数': 'employeeCount',
  billingstreet: 'billingStreet', '账单街道': 'billingStreet',
  billingcity: 'billingCity', '账单城市': 'billingCity', '城市': 'billingCity',
  billingstate: 'billingState', '账单省份': 'billingState',
  billingpostalcode: 'billingPostalCode', '邮编': 'billingPostalCode',
  billingcountry: 'billingCountry', '国家': 'billingCountry',
  description: 'description', '描述': 'description', '备注': 'description',
};

const CONTACT_ALIASES: Record<string, string> = {
  firstname: 'firstName', '名': 'firstName',
  lastname: 'lastName', '姓': 'lastName',
  title: 'title', '职位': 'title',
  department: 'department', '部门': 'department',
  email: 'email', '邮箱': 'email',
  phone: 'phone', '电话': 'phone',
  mobile: 'mobile', '手机': 'mobile',
  description: 'description', '描述': 'description', '备注': 'description',
};

const OPP_ALIASES: Record<string, string> = {
  name: 'name', '商机名称': 'name', '名称': 'name',
  stage: 'stage', '阶段': 'stage',
  amount: 'amount', '金额': 'amount',
  closedate: 'closeDate', '关闭日期': 'closeDate', '预计关闭': 'closeDate',
  type: 'type', '类型': 'type',
  leadsource: 'leadSource', '线索来源': 'leadSource',
  nextstep: 'nextStep', '下一步': 'nextStep',
  description: 'description', '描述': 'description',
  accountid: 'accountId', '客户id': 'accountId', '客户': 'accountId',
};

// Numeric / date / boolean coercion based on field name suffix or known list.
const NUMBER_FIELDS = new Set(['amount', 'annualRevenue', 'employeeCount', 'probability']);
const DATE_FIELDS = new Set(['closeDate', 'birthday', 'startDate', 'endDate']);

@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadService,
    private readonly accounts: AccountService,
    private readonly contacts: ContactService,
    private readonly opps: OpportunityService,
  ) {}

  async importCsv(
    tenantId: string,
    objectApiName: string,
    csv: string,
    user: RequestUser,
  ): Promise<ImportResult> {
    const aliases = this.aliasesFor(objectApiName);
    if (!aliases) throw new NotFoundException(`Import not supported for ${objectApiName}`);

    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return { total: 0, created: 0, failed: 0, errors: [], recognizedHeaders: [], ignoredHeaders: [] };
    }
    const headers = (rows[0] ?? []).map((h) => h.trim());
    const dataRows = rows.slice(1, MAX_ROWS + 1);

    // Map header index → canonical apiName (or null = ignored)
    const headerMap = headers.map((h) => aliases[h.toLowerCase()] ?? null);
    const recognizedHeaders = Array.from(new Set(headerMap.filter((x): x is string => !!x)));
    const ignoredHeaders = headers.filter((_, i) => headerMap[i] == null);

    // For Account-by-name resolution in opp imports, we need a cheap cache
    const accountNameCache = new Map<string, string>();

    const result: ImportResult = {
      total: dataRows.length,
      created: 0,
      failed: 0,
      errors: [],
      recognizedHeaders,
      ignoredHeaders,
    };

    for (let r = 0; r < dataRows.length; r += 1) {
      const cells = dataRows[r] ?? [];
      const rowValues: Record<string, string> = {};
      const payload: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i += 1) {
        const apiName = headerMap[i];
        const raw = (cells[i] ?? '').trim();
        if (apiName) rowValues[apiName] = raw;
        if (!apiName || raw === '') continue;

        if (NUMBER_FIELDS.has(apiName)) {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            result.errors.push({ row: r + 2, message: `${apiName} 不是数字: "${raw}"`, values: rowValues });
            continue;
          }
          payload[apiName] = n;
        } else if (DATE_FIELDS.has(apiName)) {
          const d = new Date(raw);
          if (isNaN(d.getTime())) {
            result.errors.push({ row: r + 2, message: `${apiName} 不是合法日期: "${raw}"`, values: rowValues });
            continue;
          }
          payload[apiName] = d.toISOString();
        } else {
          payload[apiName] = raw;
        }
      }

      try {
        switch (objectApiName) {
          case 'Lead': {
            // Lead requires lastName + company
            if (!payload.lastName || !payload.company) {
              throw new Error('缺少必填字段 lastName / company');
            }
            await this.leads.create(tenantId, payload, user);
            break;
          }
          case 'Account': {
            if (!payload.name) throw new Error('缺少必填字段 name');
            await this.accounts.create(tenantId, payload, user);
            break;
          }
          case 'Contact': {
            if (!payload.lastName) throw new Error('缺少必填字段 lastName');
            await this.contacts.create(tenantId, payload, user);
            break;
          }
          case 'Opportunity': {
            if (!payload.name) throw new Error('缺少必填字段 name');
            // accountId column may contain a name instead of an ID — try to resolve
            if (payload.accountId && typeof payload.accountId === 'string' && !payload.accountId.startsWith('c')) {
              // Likely a name, try to look it up.
              const accId = await this.resolveAccountByName(tenantId, payload.accountId, accountNameCache);
              if (!accId) {
                throw new Error(`找不到客户：${payload.accountId}`);
              }
              payload.accountId = accId;
            }
            if (!payload.accountId) throw new Error('缺少必填字段 accountId（可填写客户名称或 ID）');
            if (!payload.closeDate) throw new Error('缺少必填字段 closeDate');
            await this.opps.create(tenantId, payload, user);
            break;
          }
        }
        result.created += 1;
      } catch (e) {
        result.failed += 1;
        result.errors.push({
          row: r + 2,
          message: (e as Error).message ?? String(e),
          values: rowValues,
        });
      }
    }

    this.log.log(
      `import ${objectApiName} by ${user.id}: ${result.created} ok / ${result.failed} fail / ${result.total} total`,
    );
    return result;
  }

  private aliasesFor(objectApiName: string): Record<string, string> | null {
    switch (objectApiName) {
      case 'Lead':        return LEAD_ALIASES;
      case 'Account':     return ACCOUNT_ALIASES;
      case 'Contact':     return CONTACT_ALIASES;
      case 'Opportunity': return OPP_ALIASES;
      default:            return null;
    }
  }

  private async resolveAccountByName(
    tenantId: string,
    name: string,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const cached = cache.get(name);
    if (cached) return cached;
    const acc = await this.prisma.account.findFirst({
      where: { tenantId, name, deletedAt: null },
      select: { id: true },
    });
    if (acc) {
      cache.set(name, acc.id);
      return acc.id;
    }
    return null;
  }
}
