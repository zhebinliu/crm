"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const shared_1 = require("@tokenwave/shared");
const prisma = new client_1.PrismaClient();
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
    const permDefs = [
        // Standard CRUD + special actions per object
        ...(['lead', 'account', 'contact', 'opportunity', 'product', 'pricebook', 'quote', 'order', 'contract', 'activity', 'note', 'attachment', 'report'].flatMap(obj => [
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
        'lead.*', 'lead.convert', 'account.*', 'contact.*', 'opportunity.*',
        'product.read', 'pricebook.read', 'quote.*', 'order.*',
        'contract.read', 'contract.write', 'activity.*',
        'approval.approve', 'workflow.read', 'metadata.read', 'user.read',
    ]);
    const repRole = await upsertRole(tenant.id, 'Sales Rep', 'sales_rep', [
        'lead.read', 'lead.write', 'lead.convert',
        'account.read', 'account.write',
        'contact.read', 'contact.write',
        'opportunity.read', 'opportunity.write',
        'product.read', 'pricebook.read',
        'quote.read', 'quote.write',
        'order.read',
        'activity.*',
    ]);
    await upsertRole(tenant.id, 'Approver', 'approver', [
        'approval.approve', 'opportunity.read', 'quote.read', 'order.read', 'contract.read',
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
    // ── Standard Objects & Basic Fields ────────────────────────────────────────
    for (const name of shared_1.STANDARD_OBJECTS) {
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
        // Seed ONE basic Name field so the UI isn't empty
        let fieldApiName = 'name';
        let fieldLabel = '名称';
        if (name === 'lead' || name === 'contact') {
            fieldApiName = 'lastName';
            fieldLabel = '姓名 (LastName)';
        }
        await prisma.fieldDef.upsert({
            where: { objectId_apiName: { objectId: obj.id, apiName: fieldApiName } },
            update: {},
            create: {
                tenantId: tenant.id,
                objectId: obj.id,
                apiName: fieldApiName,
                label: fieldLabel,
                type: 'STRING',
                isStandard: true,
                required: true,
                displayOrder: 1,
            },
        });
    }
    console.log(`✓ Standard objects and basic fields: ${shared_1.STANDARD_OBJECTS.length}`);
    // ── Picklists ──────────────────────────────────────────────────────────────
    await upsertPicklist(tenant.id, 'lead_status', 'Lead Status', shared_1.LEAD_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
    await upsertPicklist(tenant.id, 'opportunity_stage', 'Opportunity Stage', shared_1.OPPORTUNITY_STAGE.map((v, i) => ({ value: v, label: stageLabel(v), displayOrder: i })));
    await upsertPicklist(tenant.id, 'quote_status', 'Quote Status', shared_1.QUOTE_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
    await upsertPicklist(tenant.id, 'order_status', 'Order Status', shared_1.ORDER_STATUS.map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
    await upsertPicklist(tenant.id, 'lead_source', 'Lead Source', ['web', 'phone', 'email', 'referral', 'campaign', 'advertisement', 'partner', 'trade_show', 'other'].map((v, i) => ({ value: v, label: statusLabel(v), displayOrder: i })));
    await upsertPicklist(tenant.id, 'industry', 'Industry', ['technology', 'finance', 'manufacturing', 'retail', 'healthcare', 'education', 'government', 'energy', 'media', 'other'].map((v, i) => ({ value: v, label: capitalize(v), displayOrder: i })));
    console.log('✓ Picklists: 6');
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
    ];
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
            trigger: client_1.WorkflowTrigger.ON_CREATE,
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
            trigger: client_1.WorkflowTrigger.ON_FIELD_CHANGE,
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
                ] },
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
                        approverSource: client_1.ApproverSource.ROLE,
                        approverConfig: { roleCode: 'sales_manager' },
                        mode: client_1.ApprovalStepMode.SEQUENTIAL,
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
async function upsertRole(tenantId, name, code, permCodes) {
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
async function upsertPicklist(tenantId, apiName, label, values) {
    const pl = await prisma.picklist.upsert({
        where: { tenantId_apiName: { tenantId, apiName } },
        update: {},
        create: { tenantId, apiName, label, values: { create: values } },
    });
    return pl;
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
const OBJECT_LABELS = {
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
function objectLabel(name) {
    return OBJECT_LABELS[name]?.singular ?? capitalize(name);
}
function objectLabelPlural(name) {
    return OBJECT_LABELS[name]?.plural ?? capitalize(name);
}
function statusLabel(s) {
    const map = {
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
function stageLabel(s) { return statusLabel(s); }
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map