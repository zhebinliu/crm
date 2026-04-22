# 词元波动 CRM

> 生产级 Salesforce 风格 CRM — Lead to Cash 全链路，可配置工作流引擎，元数据驱动对象系统

![Tech Stack](https://img.shields.io/badge/stack-NestJS%20%2B%20Next.js%2015%20%2B%20Prisma-FF8D1A?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## 功能概览

### 销售核心（Lead to Cash）
- **线索管理** — 线索录入、评分、来源追踪、一键转化为客户/联系人/商机
- **客户 & 联系人** — 多维客户档案，关联联系人树，活动时间线
- **商机管理** — 列表视图 + 看板视图（拖拽换阶段）、赢单概率、管道金额汇总
- **报价单** — 产品行项目、折扣计算、一键生成订单、审批流程集成
- **订单 & 合同** — 全周期状态机，激活/终止操作，状态步骤条

### 工作流与审批
- **可配置审批流** — 多步骤顺序/并行审批，锁定提交，提交/批准/拒绝/召回
- **工作流自动化** — 条件 DSL 规则引擎，字段更新/创建任务/发送 Webhook 等动作
- **验证规则** — 对象级数据验证，保存前拦截不合规数据
- **价格规则** — 折扣阈值超限自动触发审批提示

### 管理后台
- **元数据管理** — 自定义对象、字段，支持 Picklist，页面布局编辑器
- **用户与权限** — RBAC，多角色，JWT access/refresh token
- **邮件模板** — 分类管理，可启用/停用
- **审批流程配置** — 可视化步骤构建器
- **地区管理** — 树形销售区域，成员分配

### 前台体验
- **控制台主页** — KPI 卡片、模块导航磁贴、任务侧边栏、近期线索
- **报表与分析** — 4 Tab：销售概览 / 线索分析 / 活动报告 / 客户洞察
- **活动时间线** — SF 风格记录，内联创建，完成操作
- **批量操作** — 跨页面多选，批量字段更新，CSV 导出
- **动态筛选栏** — 全部列表页支持多字段组合筛选
- **动态对象页** — 自定义对象自动生成列表 + 详情页

---

## 技术架构

```
tokenwave-crm/
├── apps/
│   ├── api/          # NestJS 后端 (port 3001)
│   └── web/          # Next.js 15 前端 (port 3000)
├── packages/
│   ├── db/           # Prisma schema + seed
│   ├── shared/       # 权限枚举、LTC 事件
│   └── rule-engine/  # 条件 DSL 规则引擎
```

| 层 | 技术 |
|---|---|
| 框架 | NestJS 10 (TypeScript) |
| ORM | Prisma 5 + PostgreSQL |
| 队列 | Redis + BullMQ |
| 前端 | Next.js 15 App Router |
| UI | Tailwind CSS + shadcn/ui |
| 状态 | TanStack Query v5 + Zustand |
| 认证 | JWT (access + refresh) + RBAC |
| Monorepo | pnpm workspaces + Turborepo |

---

## 快速开始

### 前置依赖

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 15
- Redis 7

### 环境变量

```bash
# apps/api/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/tokenwave_crm?schema=public"
SHADOW_DATABASE_URL="postgresql://user:pass@localhost:5432/tokenwave_crm_shadow?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# apps/web/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 安装 & 启动

```bash
# 安装依赖
pnpm install

# 推送数据库 schema
cd packages/db
DATABASE_URL="..." npx prisma db push
DATABASE_URL="..." npx prisma generate

# 初始化演示数据
pnpm --filter @tokenwave/db db:seed

# 启动所有服务（并行）
cd ../../
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 演示账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin@demo.com | Admin@1234 | 管理员 |
| manager@demo.com | Admin@1234 | 销售经理 |
| rep@demo.com | Admin@1234 | 销售代表 |

Tenant slug: `demo`

---

## API 文档

后端运行后访问 GraphQL Playground：[http://localhost:3001/graphql](http://localhost:3001/graphql)

### 主要 REST 端点

| 资源 | 路径 |
|---|---|
| 认证 | `POST /api/auth/login` |
| 线索 | `CRUD /api/leads` |
| 客户 | `CRUD /api/accounts` |
| 联系人 | `CRUD /api/contacts` |
| 商机 | `CRUD /api/opportunities` |
| 报价单 | `CRUD /api/quotes` |
| 订单 | `CRUD /api/orders` |
| 合同 | `CRUD /api/contracts` |
| 活动 | `CRUD /api/activities` |
| 审批 | `POST /api/approvals/submit` |
| 动态记录 | `CRUD /api/records/:objectApiName` |
| 管理 | `* /api/admin/*` |

---

## 开发命令

```bash
# 前端类型检查
pnpm --filter @tokenwave/web typecheck

# 构建 API
cd apps/api && pnpm build

# 手动启动 API（watch 模式异常时）
cd apps/api && node dist/main.js

# Prisma Studio（可视化数据库）
cd packages/db && npx prisma studio
```

---

## 数据模型（核心）

```
Tenant → User → Role → Permission
       → Lead → Account → Contact
              → Opportunity → Quote → Order → Contract
                           → OpportunityLineItem
       → Activity (polymorphic: 关联任意对象)
       → WorkflowRule → WorkflowExecution
       → ApprovalProcess → ApprovalStep → ApprovalRequest
       → ObjectDef → FieldDef (元数据驱动)
       → EmailTemplate
       → PriceRule
       → Territory → TerritoryMember
```

---

## 设计系统

品牌色 `#FF8D1A`，Tailwind 映射：

```css
bg-brand          /* #FF8D1A */
bg-brand-deep     /* #E07A14 */
text-brand
hover:bg-brand-deep
```

---

## License

MIT © 2026 词元波动
