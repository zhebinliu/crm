import { PrismaClient, FieldType, WorkflowTrigger, ApproverSource, ApprovalStepMode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { STANDARD_OBJECTS, LEAD_STATUS, OPPORTUNITY_STAGE, QUOTE_STATUS, ORDER_STATUS, CONTRACT_STATUS } from '@tokenwave/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Tokenwave CRM...');

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { slug: 'demo', name: 'Demo Company', plan: 'enterprise' },
  });
  console.log(`✓ Tenant: ${tenant.slug}`);

  // ── Permissions ────────────────────────────────────────────────────────────
  const permDefs: Array<{ code: string; object: string; action: string; description?: string }> = [
    // Standard CRUD + special actions per object
    ...(['lead','account','contact','opportunity','product','pricebook','quote','order','contract','activity','note','attachment','report'].flatMap(obj => [
      { code: `${obj}.read`, object: obj, action: 'read' },
      { code: `${obj}.write`, object: obj, action: 'write' },
      { code: `${obj}.delete`, object: obj, action: 'delete' },
    ])),
    { code: 'lead.convert', object: 'lead', action: 'convert' },
    { code: 'approval.approve', object: 'approval', action: 'approve' },
    { code: 'workflow.read', object: 'workflow', action: 'read' },
    { code: 'metadata.read', object: 'metadata', action: 'read' },
    { code: 'user.read', object: 'user', action: 'read' },
    { code: 'admin.*', object: 'admin', action: '*', description: 'Super admin' },
  ];

  for (const p of permDefs) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }
  console.log(`✓ Permissions: ${permDefs.length}`);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const adminRole = await upsertRole(tenant.id, 'Admin', 'admin', ['admin.*']);
  const managerRole = await upsertRole(tenant.id, 'Sales Manager', 'sales_manager', [
    'lead.*','lead.convert','account.*','contact.*','opportunity.*',
    'product.read','pricebook.read','quote.*','order.*',
    'contract.read','contract.write','activity.*',
    'approval.approve','workflow.read','metadata.read','user.read',
  ]);
  const repRole = await upsertRole(tenant.id, 'Sales Rep', 'sales_rep', [
    'lead.read','lead.write','lead.convert',
    'account.read','account.write',
    'contact.read','contact.write',
    'opportunity.read','opportunity.write',
    'product.read','pricebook.read',
    'quote.read','quote.write',
    'order.read',
    'activity.*',
  ]);
  await upsertRole(tenant.id, 'Approver', 'approver', [
    'approval.approve','opportunity.read','quote.read','order.read','contract.read',
  ]);
  console.log('✓ Roles: 4');

  // ── Users ──────────────────────────────────────────────────────────────────
  const pw = await bcrypt.hash('Admin@1234', 12);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      passwordHash: pw,
      displayName: 'System Admin',
      title: 'CRM Administrator',
      roles: { create: { roleId: adminRole.id } },
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'manager@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'manager@demo.com',
      passwordHash: pw,
      displayName: 'Sales Manager',
      title: 'Sales Manager',
      managerId: adminUser.id,
      roles: { create: { roleId: managerRole.id } },
    },
  });

  const repUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'rep@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'rep@demo.com',
      passwordHash: pw,
      displayName: 'Sales Rep',
      title: 'Account Executive',
      managerId: managerUser.id,
      roles: { create: { roleId: repRole.id } },
    },
  });
  console.log('✓ Users: admin@demo.com / manager@demo.com / rep@demo.com (pw: Admin@1234)');

  // ── Standard Objects & Fields ────────────────────────────────────────
  const OBJECT_FIELDS: Record<string, Array<{ apiName: string; label: string; type: string; required?: boolean; picklistId?: string }>> = {
    lead: [
      { apiName: 'lastName', label: '姓名 (LastName)', type: 'STRING', required: true },
      { apiName: 'firstName', label: '名 (FirstName)', type: 'STRING' },
      { apiName: 'company', label: '公司', type: 'STRING', required: true },
      { apiName: 'title', label: '职位', type: 'STRING' },
      { apiName: 'email', label: '邮箱', type: 'STRING' },
      { apiName: 'phone', label: '电话', type: 'STRING' },
      { apiName: 'mobile', label: '手机', type: 'STRING' },
      { apiName: 'status', label: '状态', type: 'STRING' },
      { apiName: 'source', label: '来源', type: 'STRING' },
      { apiName: 'rating', label: '评级', type: 'STRING' },
      { apiName: 'industry', label: '行业', type: 'STRING' },
      { apiName: 'annualRevenue', label: '年收入', type: 'CURRENCY' },
      { apiName: 'employeeCount', label: '员工数量', type: 'NUMBER' },
      { apiName: 'score', label: '线索评分', type: 'NUMBER' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    contact: [
      { apiName: 'lastName', label: '姓 (LastName)', type: 'STRING', required: true },
      { apiName: 'firstName', label: '名 (FirstName)', type: 'STRING' },
      { apiName: 'accountId', label: '客户', type: 'REFERENCE', referenceTo: 'account' },
      { apiName: 'title', label: '职位', type: 'STRING' },
      { apiName: 'department', label: '部门', type: 'STRING' },
      { apiName: 'email', label: '邮箱', type: 'STRING' },
      { apiName: 'phone', label: '电话', type: 'STRING' },
      { apiName: 'mobile', label: '手机', type: 'STRING' },
      { apiName: 'birthday', label: '生日', type: 'DATE' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
      { apiName: 'reportsToId', label: '汇报给', type: 'REFERENCE', referenceTo: 'contact' },
    ],
    account: [
      { apiName: 'name', label: '客户名称', type: 'STRING', required: true },
      { apiName: 'type', label: '客户类型', type: 'STRING' },
      { apiName: 'industry', label: '行业', type: 'STRING' },
      { apiName: 'annualRevenue', label: '年收入', type: 'CURRENCY' },
      { apiName: 'employeeCount', label: '员工数量', type: 'NUMBER' },
      { apiName: 'website', label: '网站', type: 'STRING' },
      { apiName: 'phone', label: '电话', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    opportunity: [
      { apiName: 'name', label: '商机名称', type: 'STRING', required: true },
      { apiName: 'accountId', label: '客户', type: 'REFERENCE', referenceTo: 'account', required: true },
      { apiName: 'primaryContactId', label: '主要联系人', type: 'REFERENCE', referenceTo: 'contact' },
      { apiName: 'stage', label: '阶段', type: 'STRING', required: true },
      { apiName: 'amount', label: '金额', type: 'CURRENCY' },
      { apiName: 'currencyCode', label: '货币', type: 'STRING' },
      { apiName: 'probability', label: '概率 (%)', type: 'NUMBER' },
      { apiName: 'forecastCategory', label: '预测类别', type: 'STRING' },
      { apiName: 'closeDate', label: '关闭日期', type: 'DATE', required: true },
      { apiName: 'type', label: '商机类型', type: 'STRING' },
      { apiName: 'leadSource', label: '线索来源', type: 'STRING' },
      { apiName: 'nextStep', label: '下一步', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    quote: [
      { apiName: 'name', label: '报价单名称', type: 'STRING', required: true },
      { apiName: 'quoteNumber', label: '报价单号', type: 'STRING', required: true },
      { apiName: 'accountId', label: '客户', type: 'REFERENCE', referenceTo: 'account', required: true },
      { apiName: 'opportunityId', label: '商机', type: 'REFERENCE', referenceTo: 'opportunity' },
      { apiName: 'status', label: '状态', type: 'STRING', required: true },
      { apiName: 'currencyCode', label: '货币', type: 'STRING' },
      { apiName: 'expiresAt', label: '过期日期', type: 'DATE' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    order: [
      { apiName: 'name', label: '订单名称', type: 'STRING', required: true },
      { apiName: 'orderNumber', label: '订单编号', type: 'STRING', required: true },
      { apiName: 'accountId', label: '客户', type: 'REFERENCE', referenceTo: 'account', required: true },
      { apiName: 'opportunityId', label: '商机', type: 'REFERENCE', referenceTo: 'opportunity' },
      { apiName: 'quoteId', label: '报价单', type: 'REFERENCE', referenceTo: 'quote' },
      { apiName: 'contractId', label: '合同', type: 'REFERENCE', referenceTo: 'contract' },
      { apiName: 'status', label: '状态', type: 'STRING', required: true },
      { apiName: 'type', label: '订单类型', type: 'STRING' },
      { apiName: 'effectiveDate', label: '生效日期', type: 'DATE', required: true },
      { apiName: 'endDate', label: '结束日期', type: 'DATE' },
      { apiName: 'poNumber', label: '采购单号', type: 'STRING' },
      { apiName: 'currencyCode', label: '货币', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    contract: [
      { apiName: 'name', label: '合同名称', type: 'STRING', required: true },
      { apiName: 'contractNumber', label: '合同编号', type: 'STRING', required: true },
      { apiName: 'accountId', label: '客户', type: 'REFERENCE', referenceTo: 'account', required: true },
      { apiName: 'status', label: '状态', type: 'STRING', required: true },
      { apiName: 'startDate', label: '开始日期', type: 'DATE', required: true },
      { apiName: 'endDate', label: '结束日期', type: 'DATE' },
      { apiName: 'term', label: '合同期限(月)', type: 'NUMBER' },
      { apiName: 'contractValue', label: '合同金额', type: 'CURRENCY' },
      { apiName: 'currencyCode', label: '货币', type: 'STRING' },
      { apiName: 'billingFrequency', label: '账单周期', type: 'STRING' },
      { apiName: 'paymentTerms', label: '付款条款', type: 'STRING' },
      { apiName: 'signedAt', label: '签署日期', type: 'DATE' },
      { apiName: 'signedBy', label: '签署人', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
    product: [
      { apiName: 'name', label: '产品名称', type: 'STRING', required: true },
      { apiName: 'code', label: '产品代码', type: 'STRING', required: true },
      { apiName: 'family', label: '产品系列', type: 'STRING' },
      { apiName: 'unit', label: '单位', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'isActive', label: '是否有效', type: 'BOOLEAN' },
    ],
    pricebook: [
      { apiName: 'name', label: '价格手册名称', type: 'STRING', required: true },
      { apiName: 'isStandard', label: '标准价格手册', type: 'BOOLEAN' },
      { apiName: 'isActive', label: '是否有效', type: 'BOOLEAN' },
    ],
    activity: [
      { apiName: 'subject', label: '主题', type: 'STRING', required: true },
      { apiName: 'type', label: '类型', type: 'STRING', required: true },
      { apiName: 'status', label: '状态', type: 'STRING' },
      { apiName: 'priority', label: '优先级', type: 'STRING' },
      { apiName: 'dueDate', label: '截止日期', type: 'DATE' },
      { apiName: 'startAt', label: '开始时间', type: 'DATETIME' },
      { apiName: 'endAt', label: '结束时间', type: 'DATETIME' },
      { apiName: 'location', label: '地点', type: 'STRING' },
      { apiName: 'description', label: '描述', type: 'STRING' },
      { apiName: 'ownerId', label: '负责人', type: 'REFERENCE', referenceTo: 'user' },
    ],
  };

  for (const name of STANDARD_OBJECTS) {
    const obj = await prisma.objectDef.upsert({
      where: { tenantId_apiName: { tenantId: tenant.id, apiName: name } },
      update: {},
      create: {
        tenantId: tenant.id,
        apiName: name,
        label: objectLabel(name),
        labelPlural: objectLabelPlural(name),
        isSystem: true,
        isCustom: false,
      },
    });

    // Seed fields for this object
    const fields = OBJECT_FIELDS[name] || [];
    let order = 1;
    for (const field of fields) {
      await prisma.fieldDef.upsert({
        where: { objectId_apiName: { objectId: obj.id, apiName: field.apiName } },
        update: {},
        create: {
          tenantId: tenant.id,
          objectId: obj.id,
          apiName: field.apiName,
          label: field.label,
          type: field.type as any,
          required: field.required || false,
          isStandard: true,
          displayOrder: order++,
        },
      });
    }
    if (fields.length > 0) {
      console.log(`  - ${name}: ${fields.length} fields`);
    }
  }
  console.log(`✓ Standard objects and fields seeded`);

  // ── Picklists ──────────────────────────────────────────────────────────────
  await upsertPicklist(tenant.id, 'lead_status', 'Lead Status', LEAD_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'opportunity_stage', 'Opportunity Stage', OPPORTUNITY_STAGE.map((v, i) => ({ value: v, label: stageLabel(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'quote_status', 'Quote Status', QUOTE_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'order_status', 'Order Status', ORDER_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'lead_source', 'Lead Source', ['web','phone','email','referral','campaign','advertisement','partner','trade_show','other'].map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'industry', 'Industry', ['technology','finance','manufacturing','retail','healthcare','education','government','energy','media','other'].map((v, i) => ({ value: v, label: capitalize(v), displayOrder: i })));
  await upsertPicklist(tenant.id, 'lead_rating', 'Lead Rating', ['hot','warm','cold'].map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
  console.log('✓ Picklists: 7');

  // ── Price Book ─────────────────────────────────────────────────────────────
  const stdPriceBook = await prisma.priceBook.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Standard Price Book' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Standard Price Book', isStandard: true, isActive: true },
  });

  // ── Products ───────────────────────────────────────────────────────────────
  const products = [
    { code: 'CRM-BASE', name: 'CRM 基础版', family: 'Software', unit: '年/席位' },
    { code: 'CRM-PRO', name: 'CRM 专业版', family: 'Software', unit: '年/席位' },
    { code: 'CRM-ENT', name: 'CRM 企业版', family: 'Software', unit: '年/席位' },
    { code: 'IMPL-STD', name: '标准实施服务', family: 'Service', unit: '项' },
    { code: 'TRAIN-1D', name: '一日培训', family: 'Training', unit: '天' },
  ] as const;
  const prices = [8800, 18800, 38800, 15000, 3500];

  for (let i = 0; i < products.length; i++) {
    const p = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: products[i].code } },
      update: {},
      create: { tenantId: tenant.id, ...products[i], isActive: true },
    });
    await prisma.priceBookEntry.upsert({
      where: { priceBookId_productId_currencyCode: { priceBookId: stdPriceBook.id, productId: p.id, currencyCode: 'CNY' } },
      update: {},
      create: { priceBookId: stdPriceBook.id, productId: p.id, unitPrice: prices[i], currencyCode: 'CNY' },
    });
  }
  console.log('✓ Products: 5 + Standard Price Book');

  // ── Sample Account + Lead + Opportunity ───────────────────────────────────
  const account = await prisma.account.upsert({
    where: { id: 'demo-account-1' },
    update: {},
    create: {
      id: 'demo-account-1',
      tenantId: tenant.id,
      ownerId: repUser.id,
      name: '北京科技有限公司',
      type: 'customer',
      industry: 'technology',
      annualRevenue: 50000000,
      employeeCount: 200,
      createdById: adminUser.id,
    },
  });

  await prisma.lead.upsert({
    where: { id: 'demo-lead-1' },
    update: {},
    create: {
      id: 'demo-lead-1',
      tenantId: tenant.id,
      ownerId: repUser.id,
      lastName: '张',
      firstName: '伟',
      company: '上海新能源集团',
      email: 'zhang.wei@sh-energy.com',
      phone: '+86-21-88887777',
      status: 'working',
      rating: 'hot',
      source: 'referral',
      industry: 'energy',
      annualRevenue: 200000000,
      score: 85,
      createdById: repUser.id,
    },
  });

  const opp = await prisma.opportunity.upsert({
    where: { id: 'demo-opp-1' },
    update: {},
    create: {
      id: 'demo-opp-1',
      tenantId: tenant.id,
      ownerId: repUser.id,
      accountId: account.id,
      name: '北京科技 CRM 企业版采购',
      stage: 'proposal',
      amount: 388000,
      currencyCode: 'CNY',
      probability: 65,
      forecastCategory: 'best_case',
      closeDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 28),
      createdById: repUser.id,
    },
  });
  console.log('✓ Sample data: 1 account, 1 lead, 1 opportunity');

  // ── Workflow Rules ─────────────────────────────────────────────────────────
  // Rule 1: When opportunity amount ≥ 100000, set probability to at least 40
  await prisma.workflowRule.upsert({
    where: { id: 'wf-opp-large-deal' },
    update: {},
    create: {
      id: 'wf-opp-large-deal',
      tenantId: tenant.id,
      name: '大单自动标记',
      description: '当商机金额 ≥ 10万，自动创建跟进任务',
      objectApiName: 'opportunity',
      trigger: WorkflowTrigger.ON_CREATE,
      conditions: { all: [{ field: 'amount', op: 'gte', value: 100000 }] },
      actions: [
        {
          type: 'create_task',
          params: {
            subject: '大单商机跟进 - {{record.name}}',
            dueOffsetDays: 1,
            priority: 'high',
            ownerId: '$user.id',
          },
        },
      ],
      isActive: true,
      runSync: false,
      priority: 10,
      createdById: adminUser.id,
    },
  });

  // Rule 2: When opportunity stage changes to closed_won, update forecastCategory
  await prisma.workflowRule.upsert({
    where: { id: 'wf-opp-won' },
    update: {},
    create: {
      id: 'wf-opp-won',
      tenantId: tenant.id,
      name: '商机赢单通知',
      description: '商机变为 Closed Won 时通知销售经理',
      objectApiName: 'opportunity',
      trigger: WorkflowTrigger.ON_FIELD_CHANGE,
      watchFields: ['stage'],
      conditions: { all: [{ field: 'stage', op: 'changed_to', value: 'closed_won' }] },
      actions: [
        {
          type: 'send_notification',
          params: {
            toUserId: '$user.managerId',
            subject: '🎉 商机赢单',
            body: '销售代表已赢得商机，请及时跟进合同签署。',
          },
        },
      ],
      isActive: true,
      runSync: false,
      priority: 20,
      createdById: adminUser.id,
    },
  });

  // Rule 3: Validation - opportunity amount must be > 0
  await prisma.validationRule.upsert({
    where: { id: 'vr-opp-amount' },
    update: {},
    create: {
      id: 'vr-opp-amount',
      tenantId: tenant.id,
      name: '商机金额必须大于0',
      objectApiName: 'opportunity',
      conditions: { any: [{ field: 'amount', op: 'lte', value: 0 }] },
      errorMessage: '商机金额必须大于 0',
      errorField: 'amount',
      isActive: true,
    },
  });

  // Rule 4: Validation - lead email must be present if status = qualified
  await prisma.validationRule.upsert({
    where: { id: 'vr-lead-email' },
    update: {},
    create: {
      id: 'vr-lead-email',
      tenantId: tenant.id,
      name: '线索合格时邮箱必填',
      objectApiName: 'lead',
      conditions: { all: [
        { field: 'status', op: 'eq', value: 'qualified' },
        { field: 'email', op: 'is_blank' },
      ]},
      errorMessage: '线索状态为"已合格"时，邮箱地址为必填项',
      errorField: 'email',
      isActive: true,
    },
  });
  console.log('✓ Workflow rules: 2, Validation rules: 2');

  // ── Approval Process for Quote ─────────────────────────────────────────────
  await prisma.approvalProcess.upsert({
    where: { id: 'ap-quote-approval' },
    update: {},
    create: {
      id: 'ap-quote-approval',
      tenantId: tenant.id,
      name: '报价单审批',
      description: '金额超过 5 万的报价需要销售经理审批',
      objectApiName: 'quote',
      entryCriteria: { all: [{ field: 'grandTotal', op: 'gte', value: 50000 }] },
      finalApproveActions: [{ type: 'field_update', params: { fields: { status: 'approved' } } }],
      finalRejectActions: [{ type: 'field_update', params: { fields: { status: 'rejected' } } }],
      lockOnSubmit: true,
      isActive: true,
      steps: {
        create: [
          {
            order: 1,
            name: '销售经理审批',
            approverSource: ApproverSource.ROLE,
            approverConfig: { roleCode: 'sales_manager' },
            mode: ApprovalStepMode.SEQUENTIAL,
            rejectBehavior: 'final_reject',
          },
        ],
      },
    },
  });
  console.log('✓ Approval process: 报价单审批');

  console.log('\n✅ Seed complete!');
  console.log('   Login: admin@demo.com / Admin@1234 (tenant: demo)');
  console.log('   API: http://localhost:3001/api/docs');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function upsertRole(tenantId: string, name: string, code: string, permCodes: string[]) {
  const role = await prisma.role.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: {},
    create: { tenantId, name, code, isSystem: true },
  });
  const perms = await prisma.permission.findMany({ where: { code: { in: permCodes } } });
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }
  return role;
}

async function upsertPicklist(tenantId: string, apiName: string, label: string, values: { value: string; label: string; displayOrder: number }[]) {
  const pl = await prisma.picklist.upsert({
    where: { tenantId_apiName: { tenantId, apiName } },
    update: {},
    create: { tenantId, apiName, label, values: { create: values } },
  });
  return pl;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

const OBJECT_LABELS: Record<string, { singular: string; plural: string }> = {
  lead: { singular: '线索', plural: '线索' },
  account: { singular: '客户', plural: '客户' },
  contact: { singular: '联系人', plural: '联系人' },
  opportunity: { singular: '商机', plural: '商机' },
  product: { singular: '产品', plural: '产品' },
  pricebook: { singular: '价格手册', plural: '价格手册' },
  quote: { singular: '报价单', plural: '报价单' },
  order: { singular: '订单', plural: '订单' },
  contract: { singular: '合同', plural: '合同' },
  activity: { singular: '活动', plural: '活动' },
  note: { singular: '备注', plural: '备注' },
  attachment: { singular: '附件', plural: '附件' },
  report: { singular: '报表', plural: '报表' },
};

function objectLabel(name: string): string {
  return OBJECT_LABELS[name]?.singular ?? capitalize(name);
}

function objectLabelPlural(name: string): string {
  return OBJECT_LABELS[name]?.plural ?? capitalize(name);
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    new: '新建', working: '跟进中', nurturing: '培育中', qualified: '已合格', unqualified: '不合格',
    prospecting: '潜在客户', qualification: '资质认定', needs_analysis: '需求分析',
    value_proposition: '价值呈现', proposal: '提案/报价', negotiation: '谈判协商',
    closed_won: '赢单', closed_lost: '丢单',
    draft: '草稿', in_review: '审核中', approved: '已批准', presented: '已呈递',
    accepted: '已接受', rejected: '已拒绝', expired: '已过期',
    activated: '已激活', shipped: '已发货', delivered: '已完成', cancelled: '已取消',
  };
  return map[s] ?? capitalize(s);
}

function stageLabel(s: string) { return statusLabel(s); }

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
