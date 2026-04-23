# Tokenwave CRM — 下一阶段规划

> 上一阶段（第八轮）完成了销售预测深度增强（F1 月度统计/F2 可配置类别/F3 自定义对象/F4 预测更新任务）。
> 本文档规划后续优化方向。

---

## 第九轮候选：销售预测体验收尾

优先级高——用户已能感知这些缺口。

### 9.1 F3 动态对象查询（P1）

当用户在 F3 中将 `objectApiName` 改为非 `opportunity` 时，前端仍调用 `oppsApi.list()`，数据不变。

**方案**：
- `forecasts/page.tsx` 读取 `forecastConfig.objectApiName`
- 如果不是 `"opportunity"`，改用 `genericApi.list(objectApiName, {...})` 查询
- 字段映射：用 `config.amountField / dateField / stageField / ownerField` 替换硬编码字段名

**影响文件**：
- `apps/web/src/app/(crm)/forecasts/page.tsx`（查询部分）

### 9.2 F4 提交后刷新商机数据 ✅ 已完成

`submitMutation.onSuccess` 中已追加 `qc.invalidateQueries({ queryKey: ['opps-forecast'] })`，提交后主页数字自动刷新。

### 9.3 任务状态自动更新 ✅ 已完成

`submitUpdateTask` 服务末尾检查所有 entry 的 `submittedAt`，若全部非空则自动将 `task.status` 置为 `"closed"`。

---

## 第十轮候选：仪表盘 & 报表增强

### 10.1 Dashboard 销售预测 Widget

当前 Dashboard 没有预测相关内容。

**拟新增**：
- 迷你配额进度条（当前季度：已赢单 / 已承诺 / 目标）
- 点击跳转 `/forecasts`

### 10.2 历史预测对比

**拟新增**：
- 在预测页中新增"历史对比"Tab，展示各季度最终赢单 vs 当时 commit 的偏差
- 后端新增 `GET /api/forecasts/history?userId=...` 汇总历史数据

### 10.3 导出 Excel

- 预测数据支持"导出为 Excel"，包含全团队各成员的配额、流水线、已承诺、已赢单
- 使用 `xlsx` 或 `exceljs` 库，后端生成文件流

---

## 第十一轮候选：AI 预测辅助

### 11.1 AI 赢单概率预测

- 基于商机阶段、金额、关闭日期、历史胜率，用简单线性回归或 LLM 提示输出"预测胜率"
- 显示在商机表格的"AI 胜率"列旁边，与手动胜率对比

### 11.2 智能催办提醒

- F4 任务截止前 1 天，调用邮件/企业微信 API 通知未提交的成员
- 可使用 BullMQ 定时任务（已有 Redis 依赖）

---

## 已知技术债务

| 项目 | 位置 | 说明 |
|------|------|------|
| API 端 TypeScript 严格模式下有 graphql resolver 报错 | `apps/api/tsconfig.json` | 预存在问题，不影响运行 |
| `oppsApi.list()` 分页 `take: 500` 硬限制 | `forecasts/page.tsx` | 商机超过 500 条时预测不准 |
| OppDrawer 无分页/搜索 | `OppDrawer.tsx` | 商机很多时体验差 |
| `UpdateTasksPanel` 任务全量加载 | 无分页 | 任务多时性能下降 |
