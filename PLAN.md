# Tokenwave CRM 现代化重塑 — 阶段 6：Salesforce 级体验增强

目前的 UI 已经完成了“现代高级感”的重塑，接下来的目标是缩小与 Salesforce 在**数据深度关联**和**详情展示**上的差距。目前的系统侧重于“列表 + 弹窗”，我们需要将其升级为“全功能详情中心”。

## 用户评审需求

> [!IMPORTANT]
> **核心架构变动**：
> - 我们将引入 `/o/[objectApiName]/[id]` 动态路由作为记录的“详情中心”。
> - 取消点击列表行直接打开“编辑弹窗”的旧逻辑，改为跳转至详情页。
> - 在详情页中实现 **Tabs (相关/详情/活动)** 布局。

## 拟定变更

### 1. 核心详情页 (Record Detail Center)

#### [NEW] [record-detail-page](file:///Users/zhebinliu/Documents/tokenwave-crm/apps/web/src/app/(crm)/o/[objectApiName]/[id]/page.tsx)
- 实现三段式布局：
  - **顶部 Highlight Panel**：展示记录标题（如：账户名）、核心字段（如：所有者、星级）以及操作按钮（编辑、删除、共享）。
  - **左/中侧主体 Tabs**：
    - `Related` (相关项)：点击展示所有的 Related Lists。
    - `Details` (详情)：展示当前的 `DynamicRecordForm`。
  - **右侧侧边栏**：展示 `Activity` (活动) 或 `Feed`。

### 2. 相关列表组件 (Universal Related List)

#### [NEW] [related-list.tsx](file:///Users/zhebinliu/Documents/tokenwave-crm/apps/web/src/components/dynamic/related-list.tsx)
- 开发一个通用的关联表组件：
  - 属性输入：`childObjectApiName`, `parentFieldApiName`, `parentId`。
  - 功能：自动拉取子对象数据，并在详情页以精简表格形式展示。
  - 支持“新建关联记录”快捷入口。

### 3. Lookup 字段 UI 增强

#### [MODIFY] [dynamic-field.tsx](file:///Users/zhebinliu/Documents/tokenwave-crm/apps/web/src/components/dynamic/dynamic-field.tsx)
- 针对 `REFERENCE` 类型：
  - 引入 **Pop-over Search** 或 **Selection Dialog**。
  - 让用户能够通过搜索名称来选取关联记录。

### 4. 路由逻辑调整

#### [MODIFY] [o/[objectApiName]/page.tsx](file:///Users/zhebinliu/Documents/tokenwave-crm/apps/web/src/app/(crm)/o/[objectApiName]/page.tsx)
- 将表格行的点击事件改为 `router.push('/o/' + objectApiName + '/' + record.id)`。

---

## 开放性问题

1. **活动流 (Activities)**：是否需要在详情页右侧实现简单的活动记录（任务、便签）？
2. **字段布局**：目前的 `DynamicRecordForm` 是单列/双列平铺，是否需要支持在元数据中定义“字段分组”？

## 验证计划

### 自动化测试
- 访问 `/o/account/[existing-id]` 确保页面渲染不报错。

### 手动验证
- 在账户详情页的“相关”页签中，是否能看到关联的联系人列表。
- 点击“联系人相关列表”中的“新建”按钮，弹出表单且 `AccountId` 已被预填充。
