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

---

## 第八轮：销售预测深度增强 - 已完成

### 8.1 F1 — 月度统计 + 商机下钻
- [x] 页头新增「季度 / 月度」时间维度切换
- [x] 月度模式：按 3 个月分行展示 pipeline / best_case / commit / closed 金额
- [x] 合计行：显示全季度汇总，与 4 个分类卡片数值一致
- [x] 所有金额格子可点击，弹出 `OppDrawer` 展示构成商机
- [x] 4 个预测类别卡片也支持点击触发 OppDrawer
- [x] `OppDrawer`：右下角固定浮层，含商机列表 + 外链跳转

### 8.2 F2 — 可配置预测类别映射
- [x] 新增 `ForecastConfig` Prisma 模型（categories JSON + DB 持久化）
- [x] 新增 `GET/PUT /api/forecasts/config` 端点
- [x] 前端从 DB 动态加载 stageCategories，不再硬编码
- [x] `buildTotals` 函数按 waterfall 逻辑累计（pipeline ⊇ best_case ⊇ commit ⊇ closed）
- [x] `ForecastConfigModal` 弹窗：8 个阶段 × 5 个类别按钮，可视化切换并保存

### 8.3 F3 — 自定义统计对象配置
- [x] `ForecastConfig` 模型同时存储 objectApiName / amountField / dateField / stageField / ownerField
- [x] `ForecastConfigModal`「数据对象配置」Tab：5 个输入框可编辑并保存
- [x] 后端 upsertConfig 支持增量更新各字段

### 8.4 F4 — 预测更新任务卡片
- [x] 新增 `ForecastUpdateTask` + `ForecastUpdateEntry` Prisma 模型
- [x] 新增 `POST /api/forecasts/update-tasks`：创建任务并快照目标商机
- [x] 新增 `GET /api/forecasts/update-tasks`：经理看全部，销售只看分配给自己的
- [x] 新增 `GET /api/forecasts/update-tasks/:id`：含商机条目
- [x] 新增 `POST /api/forecasts/update-tasks/:id/submit`：提交后事务更新实际商机 amount / closeDate
- [x] `UpdateTasksPanel` 组件：任务列表 + 可展开卡片
- [x] `CreateTaskModal`：经理填写任务名/期间/截止/日期范围/目标成员
- [x] `OppRow` 组件：每行显示上期快照 vs 本期输入 + ✅ noChange 按钮
- [x] 提交成功后 TanStack Query 缓存失效刷新

### 8.5 其他优化
- [x] 去除 TanStack Query DevTools 徽标
- [x] 去除 Next.js dev indicator
- [x] 经理为团队成员设置季度配额（不再自助设置）
- [x] 全页面 TypeScript 零报错
- [x] Next.js 生产构建通过
- [x] 端到端 API 测试全部通过（见 `docs/测试报告-销售预测增强.md`）
