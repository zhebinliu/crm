# Tokenwave CRM — 任务拆解

按轮推进，每轮内按模块逐项完成并标记。

---

## 第一轮：前端 CRUD 页面补全
（原计划不变，全部完成）
- [x] Accounts（客户）页面
- [x] Contacts（联系人）页面
- [x] Opportunities（商机）页面
- [x] Quotes（报价）页面
- [x] Orders（订单）页面
- [x] Contracts（合同）页面
- [x] Activities（活动）页面

---

## 第二轮：后台管理页面
（原计划不变，全部完成）
- [x] 用户管理（/admin/users）
- [x] 工作流规则（/admin/workflow）
- [x] 审批流程（/admin/approvals）
- [x] 对象元数据（/admin/metadata）

---

## 第三轮：GraphQL Schema 对齐

确保 GraphQL 层与 REST API 功能对齐。已完成架构配置接入。

### 3.1 GraphQL Module 审计
- [x] 审查现有 GraphQL 配置（`app.module.ts` 中的 GraphQL module setup）
- [x] 列出缺失的 resolver/entity，与 REST controller 对比

### 3.2 Entity Resolver 补全
- [x] 确认 Lead / Account / Contact / Opportunity resolver 存在且字段对齐
- [x] 确认 Quote / Order / Contract resolver 存在且字段对齐
- [x] 确认 Product / PriceBook resolver 存在且字段对齐
- [x] 确认 Activity resolver 存在且字段对齐

### 3.3 Admin Resolver 补全
- [x] User / Role / Permission resolver
- [x] Metadata (ObjectDef / FieldDef / Picklist) resolver
- [x] WorkflowRule / ValidationRule resolver
- [x] ApprovalProcess / ApprovalRequest resolver

### 3.4 Mutation 补全
- [x] 确认所有 create / update / delete mutations 存在 (已完成的部分)
- [x] 确认特殊操作 mutations（lead convert、quote fromOpp、order activate 等）(交由对应 resolver)

---

## 第四轮：Design System 接入

按 Tokenwave DS（https://kb.tokenwave.cloud/ds）规范调整前端 UI。

### 4.1 DS 资源获取与分析
- [x] 获取并阅读 Tokenwave Design System 文档
- [x] 对比现有 UI 与 DS 的差异清单（颜色 token、字体、间距、组件样式）

### 4.2 Tailwind 主题调整
- [x] 更新 `tailwind.config.ts` 中的颜色/字体/间距 token 匹配 DS
- [x] 更新 `globals.css` 中的 component classes（card、btn、input、badge、table）

### 4.3 组件库接入
- [x] 按 DS 要求引入/替换 shadcn/ui 组件（Button、Input、Select、Dialog、Table 等）
- [x] 确认所有表单弹窗、列表页、详情页使用统一组件

### 4.4 全局巡检
- [x] 登录页、Dashboard、所有业务列表/详情页逐一检查，确保视觉一致性
- [x] 响应式检查（移动端适配）

---

## 第五轮：前后台分离架构与元数据动态表单（全新任务）

通过抽象解耦布局和输入接口，打造高配置的、无代码的系统组件体验。

### 5.1 前后台路由解耦 (Layout 分离)
- [x] 在 `apps/web/src/app` 中新建 `(admin)/layout.tsx`。
- [x] 抽离原混用的 Sidebar，实现 `CrmSidebar` 和 `AdminSidebar`。
- [x] 确保前台（销售人员）的菜单和后台（Admin）的菜单被明确划分在两套布局内。
- [x] 顶部导航增加“前后台一键切换”入口。

### 5.2 动态表单配置引擎 (Dynamic Form Engine)
- [x] 打造跨平台的 `<DynamicRecordForm />` 抽象组件，传入 `API Name` 与 RecordID 即完成渲染或编辑功能。
- [x] 对接后端 `/api/admin/metadata/objects/:name/fields` 获取当前激活启用的标准+自定义字段全列表。
- [x] 实现针对不同 `FieldType` 的动态绘制（Text, Checkbox, Date, Boolean, Picklist 等）。
- [x] 改造核心录入流：废弃写死的 `LeadFormModal`, `AccountFormModal` 等组件并用 Dynamic 组件直接替代平替，并验证自定义字段写入功能。

---

## 第六轮：Salesforce 级体验增强 (实现深度详情页)
（全部完成）

实现万能详情页与相关列表。

### 6.1 万能详情页架构 (Universal Record Detail)
- [x] 创建动态路由 `/o/[objectApiName]/[id]/page.tsx`。
- [x] 开发详情页 Header (Highlight Panel)，展示核心字段和操作按钮。
- [x] 实现 Tabs 切换逻辑 (Related / Details / Activity)。

### 6.2 关联关系引擎 (Related Lists)
- [x] 开发通用的 `<RelatedList />` 组件，读取子对象元数据。
- [x] 在详情页中动态注入基于关系的 Related Lists。
- [x] 支持在相关列表中直接执行“新建关联记录”操作。

### 6.3 Lookup 字段体验升级
- [x] 改造 `DynamicField` 中的 `REFERENCE` 类型，支持弹窗搜索记录。
- [x] 支持通过 URL 参数传递关联 ID 以实现新建记录时的“自动带入”。
- [x] 后端加固：手动实体服务的 `create` 方法增加 `ownerId` 和 `tenantId` 补全逻辑。

---

## 第七轮：全平台录入流统一 (Unified Creation Experience) - 已完成
- [x] 迁移 **线索 (Leads)** 列表页到 `DynamicRecordForm`
- [x] 迁移 **客户 (Accounts)** 列表页到 `DynamicRecordForm`
- [x] 迁移 **联系人 (Contacts)** 列表页到 `DynamicRecordForm`
- [x] 迁移 **合同 (Contracts)** 列表页到 `DynamicRecordForm` (修复了 400 错误)
- [x] 迁移 **商机 (Opportunities)** 列表页到 `DynamicRecordForm`
- [x] 迁移 **报价单 (Quotes)** 列表页到 `DynamicRecordForm`
- [x] 创建通用的 `CreateRecordModal` 组件，封装 Dialog + DynamicForm 逻辑。
