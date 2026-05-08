import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ── Streaming Copilot event union (mirrors apps/api/src/modules/ai/ai-chat.service.ts) ──

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'turn_break' }
  | { type: 'tool_call_start'; name: string; input: unknown }
  | { type: 'tool_call_end'; name: string; durationMs: number; isError?: boolean }
  | {
      type: 'done';
      assistant: { role: 'user' | 'assistant'; text: string; toolEvents?: Array<{ name: string; input: unknown; result: string; isError?: boolean; durationMs: number }> };
      history: Array<{ role: 'user' | 'assistant'; text: string }>;
      meta: {
        modelName: string;
        source: 'live' | 'stub';
        totalLatencyMs: number;
        iterations: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
      };
    }
  | { type: 'error'; message: string };

export const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tw_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = typeof window !== 'undefined' ? localStorage.getItem('tw_refresh_token') : null;
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/api/auth/refresh`, { refreshToken: refresh });
          localStorage.setItem('tw_access_token', data.accessToken);
          localStorage.setItem('tw_refresh_token', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.removeItem('tw_access_token');
          localStorage.removeItem('tw_refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

// ── Typed resource helpers ─────────────────────────────────────────────────

export const authApi = {
  login: (tenantSlug: string, email: string, password: string) =>
    api.post('/auth/login', { tenantSlug, email, password }).then((r) => r.data),
  me: () => api.post('/auth/me').then((r) => r.data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

export const leadsApi = {
  list: (p?: Record<string, unknown>) => api.get('/leads', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/leads/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/leads', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/leads/${id}`, d).then((r) => r.data),
  convert: (id: string, d: unknown) => api.post(`/leads/${id}/convert`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/leads/${id}`).then((r) => r.data),
};

export const accountsApi = {
  list: (p?: Record<string, unknown>) => api.get('/accounts', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/accounts/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/accounts', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/accounts/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/accounts/${id}`).then((r) => r.data),
};

export const contactsApi = {
  list: (p?: Record<string, unknown>) => api.get('/contacts', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/contacts/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/contacts', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/contacts/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/contacts/${id}`).then((r) => r.data),
};

export const oppsApi = {
  list: (p?: Record<string, unknown>) => api.get('/opportunities', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/opportunities/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/opportunities', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/opportunities/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/opportunities/${id}`).then((r) => r.data),
  addLineItem: (id: string, d: unknown) => api.post(`/opportunities/${id}/line-items`, d).then((r) => r.data),
};

export const quotesApi = {
  list: (p?: Record<string, unknown>) => api.get('/quotes', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/quotes/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/quotes', d).then((r) => r.data),
  fromOpp: (oppId: string) => api.post(`/quotes/from-opportunity/${oppId}`).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/quotes/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/quotes/${id}`).then((r) => r.data),
  addLineItem: (id: string, d: unknown) => api.post(`/quotes/${id}/line-items`, d).then((r) => r.data),
  // ─── CPQ / Wave 19e/20e ───
  addBundle: (id: string, d: { bundleId: string; quantity?: number; priceBookId?: string; customizations?: Array<{ childProductId: string; quantity?: number; include?: boolean }> }) =>
    api.post(`/quotes/${id}/add-bundle`, d).then((r) => r.data),
  reprice: (id: string) => api.post(`/quotes/${id}/reprice`).then((r) => r.data),
  convertToOrder: (id: string, d?: { skipApproval?: boolean }) =>
    api.post(`/quotes/${id}/convert-to-order`, d ?? {}).then((r) => r.data),
};

// ─── CPQ admin: ProductBundle + PriceLine + (optional) PriceTier ───
export const cpqApi = {
  // bundles
  listBundles: () => api.get('/admin/product-bundles').then((r) => r.data),
  getBundle: (id: string) => api.get(`/admin/product-bundles/${id}`).then((r) => r.data),
  createBundle: (d: { productId: string; type?: string; fixedPrice?: boolean }) =>
    api.post('/admin/product-bundles', d).then((r) => r.data),
  updateBundle: (id: string, d: { type?: string; fixedPrice?: boolean }) =>
    api.patch(`/admin/product-bundles/${id}`, d).then((r) => r.data),
  deleteBundle: (id: string) => api.delete(`/admin/product-bundles/${id}`).then((r) => r.data),
  addBundleItem: (id: string, d: { childProductId: string; required?: boolean; defaultQuantity?: number; minQuantity?: number; maxQuantity?: number; displayOrder?: number }) =>
    api.post(`/admin/product-bundles/${id}/items`, d).then((r) => r.data),
  updateBundleItem: (id: string, itemId: string, d: { required?: boolean; defaultQuantity?: number; minQuantity?: number; maxQuantity?: number; displayOrder?: number }) =>
    api.patch(`/admin/product-bundles/${id}/items/${itemId}`, d).then((r) => r.data),
  removeBundleItem: (id: string, itemId: string) =>
    api.delete(`/admin/product-bundles/${id}/items/${itemId}`).then((r) => r.data),
  // pricing
  priceLine: (d: { productId: string; quantity: number; priceBookId?: string; currencyCode?: string }) =>
    api.post('/cpq/price-line', d).then((r) => r.data),
  // price tiers — endpoints not yet shipped on backend; calls will gracefully
  // surface a "管理员请求暂未可用" state if the route 404s.
  listTiers: (productId?: string) =>
    api.get('/admin/price-tiers', { params: productId ? { productId } : undefined }).then((r) => r.data),
  createTier: (d: { productId: string; minQuantity: number; unitPrice?: number; discountPercent?: number; priceBookId?: string }) =>
    api.post('/admin/price-tiers', d).then((r) => r.data),
  updateTier: (id: string, d: { minQuantity?: number; unitPrice?: number | null; discountPercent?: number | null; isActive?: boolean }) =>
    api.patch(`/admin/price-tiers/${id}`, d).then((r) => r.data),
  deleteTier: (id: string) => api.delete(`/admin/price-tiers/${id}`).then((r) => r.data),
};

export const ordersApi = {
  list: (p?: Record<string, unknown>) => api.get('/orders', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/orders/${id}`).then((r) => r.data),
  fromQuote: (quoteId: string) => api.post(`/orders/from-quote/${quoteId}`).then((r) => r.data),
  activate: (id: string) => api.post(`/orders/${id}/activate`).then((r) => r.data),
};

export const contractsApi = {
  list: (p?: Record<string, unknown>) => api.get('/contracts', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/contracts/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/contracts', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/contracts/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/contracts/${id}`).then((r) => r.data),
  activate: (id: string) => api.post(`/contracts/${id}/activate`).then((r) => r.data),
  terminate: (id: string) => api.post(`/contracts/${id}/terminate`).then((r) => r.data),
};

export const activitiesApi = {
  list: (p?: Record<string, unknown>) => api.get('/activities', { params: p }).then((r) => r.data),
  create: (d: unknown) => api.post('/activities', d).then((r) => r.data),
  complete: (id: string) => api.post(`/activities/${id}/complete`).then((r) => r.data),
};

export const productsApi = {
  list: (p?: Record<string, unknown>) => api.get('/products', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/products/${id}`).then((r) => r.data),
};

export const workflowApi = {
  listRules: (p?: Record<string, unknown>) => api.get('/admin/workflow-rules', { params: p }).then((r) => r.data),
  getRule: (id: string) => api.get(`/admin/workflow-rules/${id}`).then((r) => r.data),
  createRule: (d: unknown) => api.post('/admin/workflow-rules', d).then((r) => r.data),
  updateRule: (id: string, d: unknown) => api.put(`/admin/workflow-rules/${id}`, d).then((r) => r.data),
  deleteRule: (id: string) => api.delete(`/admin/workflow-rules/${id}`).then((r) => r.data),
  listValidation: (p?: Record<string, unknown>) => api.get('/admin/validation-rules', { params: p }).then((r) => r.data),
  createValidation: (d: unknown) => api.post('/admin/validation-rules', d).then((r) => r.data),
  updateValidation: (id: string, d: unknown) => api.put(`/admin/validation-rules/${id}`, d).then((r) => r.data),
  deleteValidation: (id: string) => api.delete(`/admin/validation-rules/${id}`).then((r) => r.data),
  executions: (p?: Record<string, unknown>) => api.get('/admin/workflow-rules/executions', { params: p }).then((r) => r.data),
  auditLog: (p?: Record<string, unknown>) => api.get('/admin/workflow-rules/audit-log', { params: p }).then((r) => r.data),
};

export const approvalApi = {
  listRequests: (p?: Record<string, unknown>) => api.get('/approvals/requests', { params: p }).then((r) => r.data),
  listProcesses: (p?: Record<string, unknown>) => api.get('/approvals/processes', { params: p }).then((r) => r.data),
  getProcess: (id: string) => api.get(`/approvals/processes/${id}`).then((r) => r.data),
  submit: (d: unknown) => api.post('/approvals/submit', d).then((r) => r.data),
  approve: (id: string, d?: unknown) => api.post(`/approvals/requests/${id}/approve`, d ?? {}).then((r) => r.data),
  reject: (id: string, d?: unknown) => api.post(`/approvals/requests/${id}/reject`, d ?? {}).then((r) => r.data),
  recall: (id: string, d?: unknown) => api.post(`/approvals/requests/${id}/recall`, d ?? {}).then((r) => r.data),
  createProcess: (d: unknown) => api.post('/approvals/processes', d).then((r) => r.data),
  updateProcess: (id: string, d: unknown) => api.put(`/approvals/processes/${id}`, d).then((r) => r.data),
  deleteProcess: (id: string) => api.delete(`/approvals/processes/${id}`).then((r) => r.data),
};

export const adminApi = {
  listUsers: (p?: Record<string, unknown>) => api.get('/admin/users', { params: p }).then((r) => r.data),
  getUser: (id: string) => api.get(`/admin/users/${id}`).then((r) => r.data),
  createUser: (d: unknown) => api.post('/admin/users', d).then((r) => r.data),
  updateUser: (id: string, d: unknown) => api.put(`/admin/users/${id}`, d).then((r) => r.data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`).then((r) => r.data),
  listRoles: () => api.get('/admin/roles').then((r) => r.data),
  listObjects: () => api.get('/admin/metadata/objects').then((r) => r.data),
  getObject: (name: string) => api.get(`/admin/metadata/objects/${name}`).then((r) => r.data),
  createObject: (d: { apiName: string; label: string; labelPlural: string; iconName?: string }) =>
    api.post('/admin/metadata/objects', d).then((r) => r.data),
  createField: (objectApiName: string, d: unknown) => api.post(`/admin/metadata/objects/${objectApiName}/fields`, d).then((r) => r.data),
  updateField: (fieldId: string, d: Record<string, unknown>) =>
    api.put(`/admin/metadata/fields/${fieldId}`, d).then((r) => r.data),
  deleteField: (fieldId: string) => api.delete(`/admin/metadata/fields/${fieldId}`).then((r) => r.data),
  upsertPicklistValues: (
    picklistId: string,
    values: Array<{ value: string; label: string; color?: string; displayOrder?: number; isActive?: boolean; isDefault?: boolean }>,
  ) => api.put(`/admin/metadata/picklists/${picklistId}/values`, { values }).then((r) => r.data),
  listPicklists: () => api.get('/admin/metadata/picklists').then((r) => r.data),
  getPicklist: (apiName: string) => api.get(`/admin/metadata/picklists/${apiName}`).then((r) => r.data),
  saveLayout: (name: string, layout: unknown) => api.post(`/admin/metadata/objects/${name}/layout`, layout).then((r) => r.data),
  getLayout: (name: string) => api.get(`/admin/metadata/objects/${name}/layout`).then((r) => r.data),
  resolveRecords: (objectApiName: string, ids: string[]) =>
    api.post('/admin/metadata/resolve', { objectApiName, ids }).then((r) => r.data),
  auditLog: (params?: Record<string, unknown>) =>
    api.get('/admin/audit-log', { params }).then((r) => r.data),
  auditLogFacets: () =>
    api.get('/admin/audit-log/facets').then((r) => r.data),
};

// ── Record Types + Page Layouts (Wave 19b / 20b) ──────────────────────────

export interface RecordTypeRow {
  id: string;
  apiName: string;
  label: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  layoutId?: string | null;
  layout?: { id: string; apiName: string; label: string } | null;
  picklistOverrides?: Record<string, string>;
}

export interface PageLayoutRow {
  id: string;
  apiName: string;
  label: string;
  isActive: boolean;
  sections: unknown[];
}

export interface ResolvedLayout {
  source: 'record-type' | 'default' | 'auto';
  layout: {
    id: string | null;
    apiName: string;
    label: string;
    sections: unknown[];
  };
}

export const recordTypeApi = {
  list: (objectApiName: string): Promise<RecordTypeRow[]> =>
    api
      .get(`/admin/metadata/objects/${objectApiName}/record-types`)
      .then((r) => r.data?.data ?? r.data),
  get: (objectApiName: string, id: string): Promise<RecordTypeRow> =>
    api
      .get(`/admin/metadata/objects/${objectApiName}/record-types/${id}`)
      .then((r) => r.data?.data ?? r.data),
  create: (objectApiName: string, d: Record<string, unknown>) =>
    api
      .post(`/admin/metadata/objects/${objectApiName}/record-types`, d)
      .then((r) => r.data?.data ?? r.data),
  update: (objectApiName: string, id: string, d: Record<string, unknown>) =>
    api
      .patch(`/admin/metadata/objects/${objectApiName}/record-types/${id}`, d)
      .then((r) => r.data?.data ?? r.data),
  remove: (objectApiName: string, id: string) =>
    api
      .delete(`/admin/metadata/objects/${objectApiName}/record-types/${id}`)
      .then((r) => r.data?.data ?? r.data),
};

export const pageLayoutApi = {
  list: (objectApiName: string): Promise<PageLayoutRow[]> =>
    api
      .get(`/admin/metadata/objects/${objectApiName}/page-layouts`)
      .then((r) => r.data?.data ?? r.data),
  get: (objectApiName: string, id: string): Promise<PageLayoutRow> =>
    api
      .get(`/admin/metadata/objects/${objectApiName}/page-layouts/${id}`)
      .then((r) => r.data?.data ?? r.data),
  create: (objectApiName: string, d: Record<string, unknown>) =>
    api
      .post(`/admin/metadata/objects/${objectApiName}/page-layouts`, d)
      .then((r) => r.data?.data ?? r.data),
  update: (objectApiName: string, id: string, d: Record<string, unknown>) =>
    api
      .patch(`/admin/metadata/objects/${objectApiName}/page-layouts/${id}`, d)
      .then((r) => r.data?.data ?? r.data),
  remove: (objectApiName: string, id: string) =>
    api
      .delete(`/admin/metadata/objects/${objectApiName}/page-layouts/${id}`)
      .then((r) => r.data?.data ?? r.data),
  resolve: (objectApiName: string, recordTypeId?: string): Promise<ResolvedLayout> =>
    api
      .get(`/admin/metadata/objects/${objectApiName}/page-layouts/resolve`, {
        params: recordTypeId ? { recordTypeId } : {},
      })
      .then((r) => r.data?.data ?? r.data),
};

export const forecastApi = {
  // Targets
  getTarget: (period: string, userId?: string) =>
    api.get('/forecasts/targets', { params: { period, userId } }).then((r) => r.data),
  upsertTarget: (period: string, quota: number, userId?: string) =>
    api.put('/forecasts/targets', { period, quota, userId }).then((r) => r.data),
  teamTargets: (period: string) =>
    api.get('/forecasts/targets/team', { params: { period } }).then((r) => r.data),
  // Config (F2 + F3)
  getConfig: () =>
    api.get('/forecasts/config').then((r) => r.data),
  upsertConfig: (d: Record<string, unknown>) =>
    api.put('/forecasts/config', d).then((r) => r.data),
  // Update tasks (F4)
  createTask: (d: unknown) =>
    api.post('/forecasts/update-tasks', d).then((r) => r.data),
  listTasks: () =>
    api.get('/forecasts/update-tasks').then((r) => r.data),
  getTask: (id: string) =>
    api.get(`/forecasts/update-tasks/${id}`).then((r) => r.data),
  submitTask: (id: string, entries: unknown[]) =>
    api.post(`/forecasts/update-tasks/${id}/submit`, { entries }).then((r) => r.data),
};

export const emailTemplatesApi = {
  list: (p?: Record<string, unknown>) => api.get('/admin/email-templates', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/admin/email-templates/${id}`).then((r) => r.data),
  create: (d: unknown) => api.post('/admin/email-templates', d).then((r) => r.data),
  update: (id: string, d: unknown) => api.put(`/admin/email-templates/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/email-templates/${id}`).then((r) => r.data),
};

export const importApi = {
  importCsv: (objectApiName: string, csv: string) =>
    api.post(`/admin/import/${objectApiName}`, { csv }, { timeout: 120_000 }).then((r) => r.data),
};

export const listViewsApi = {
  list: (objectApiName: string) =>
    api.get('/list-views', { params: { objectApiName } }).then((r) => r.data),
  create: (data: {
    objectApiName: string;
    name: string;
    filters?: Record<string, unknown>;
    sortBy?: string | null;
    sortDir?: 'asc' | 'desc' | null;
    isShared?: boolean;
    isDefault?: boolean;
  }) => api.post('/list-views', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/list-views/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/list-views/${id}`).then((r) => r.data),
};

export const notificationsApi = {
  list: (unreadOnly?: boolean, take?: number) =>
    api.get('/notifications', { params: { unreadOnly: unreadOnly ? 'true' : undefined, take } }).then((r) => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/mark-all-read').then((r) => r.data),
};

export const aiApi = {
  oppWinProbability: (oppId: string) =>
    api.get(`/ai/opportunities/${oppId}/win-probability`).then((r) => r.data),
  refreshOppWinProbability: (oppId: string) =>
    api.post(`/ai/opportunities/${oppId}/win-probability/refresh`).then((r) => r.data),
  oppActivitySummary: (oppId: string) =>
    api.get(`/ai/opportunities/${oppId}/activity-summary`).then((r) => r.data),
  refreshOppActivitySummary: (oppId: string) =>
    api.post(`/ai/opportunities/${oppId}/activity-summary/refresh`).then((r) => r.data),
  leadScore: (leadId: string) =>
    api.get(`/ai/leads/${leadId}/score`).then((r) => r.data),
  refreshLeadScore: (leadId: string) =>
    api.post(`/ai/leads/${leadId}/score/refresh`).then((r) => r.data),
  accountBriefing: (accountId: string) =>
    api.get(`/ai/accounts/${accountId}/briefing`).then((r) => r.data),
  refreshAccountBriefing: (accountId: string) =>
    api.post(`/ai/accounts/${accountId}/briefing/refresh`).then((r) => r.data),
  draftLeadOutreach: (
    leadId: string,
    args: { channel: 'email' | 'wechat' | 'phone'; tone?: 'professional' | 'friendly' | 'concise' },
  ) =>
    api.post(`/ai/leads/${leadId}/draft-outreach`, args).then((r) => r.data),
  pipelineRisk: (params?: { ownerId?: string; stage?: string; limit?: number }) =>
    api.get('/ai/pipeline-risk', { params }).then((r) => r.data),
  oppBandsByIds: (ids: string[]) =>
    api.post('/ai/opportunities/bands', { ids }).then((r) => r.data),
  dashboardSummary: (mineOnly?: boolean) =>
    api.get('/ai/dashboard-summary', { params: mineOnly ? { mineOnly: 'true' } : {} }).then((r) => r.data),
  telemetry: (days?: number) =>
    api.get('/ai/admin/telemetry', { params: days ? { days } : {} }).then((r) => r.data),
  triggerAnomalyScan: () =>
    api.post('/ai/admin/anomaly-scan').then((r) => r.data),
  chat: (body: { message: string; history?: Array<{ role: 'user' | 'assistant'; text: string }> }) =>
    api.post('/ai/chat', body, { timeout: 120_000 }).then((r) => r.data),
  /**
   * Stream variant. Returns a cancel function. `onEvent` is called for each
   * server-sent event. The stream ends with a 'done' or 'error' event.
   */
  chatStream(
    body: { message: string; history?: Array<{ role: 'user' | 'assistant'; text: string }> },
    onEvent: (event: ChatStreamEvent) => void,
  ): () => void {
    const ac = new AbortController();
    (async () => {
      try {
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('tw_access_token')
          : null;
        const resp = await fetch(`${BASE}/api/ai/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        if (!resp.ok || !resp.body) {
          const msg = await resp.text().catch(() => `HTTP ${resp.status}`);
          onEvent({ type: 'error', message: msg });
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE messages are separated by blank lines.
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            try {
              const parsed = JSON.parse(json);
              onEvent(parsed as ChatStreamEvent);
            } catch {
              // ignore malformed line
            }
          }
        }
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return;
        onEvent({ type: 'error', message: (e as Error).message ?? String(e) });
      }
    })();
    return () => ac.abort();
  },
};

// ── Person / Customer 360 (Wave 18h) ───────────────────────────────────────

export const personApi = {
  list: (p?: { search?: string; skip?: number; take?: number }) =>
    api.get('/persons', { params: p }).then((r) => r.data),
  get: (id: string) => api.get(`/persons/${id}`).then((r) => r.data),
  timeline: (id: string, take?: number) =>
    api.get(`/persons/${id}/timeline`, { params: take ? { take } : {} }).then((r) => r.data),
  merge: (winnerId: string, loserId: string) =>
    api.post('/persons/merge', { winnerId, loserId }).then((r) => r.data),
  listDedupeCandidates: (status?: string, take?: number) =>
    api.get('/persons/dedupe/candidates', { params: { status, take } }).then((r) => r.data),
  resolveDedupeCandidate: (id: string, decision: 'confirm_merge' | 'reject', note?: string) =>
    api.post(`/persons/dedupe/candidates/${id}/resolve`, { decision, note }).then((r) => r.data),
};

// ── Recycle Bin (Wave 16b) ─────────────────────────────────────────────────

export const recycleBinApi = {
  list: (p?: { recordType?: string; search?: string; skip?: number; take?: number }) =>
    api.get('/recycle-bin', { params: p }).then((r) => r.data),
  restore: (id: string) => api.post(`/recycle-bin/${id}/restore`).then((r) => r.data),
  purge: (id: string) => api.delete(`/recycle-bin/${id}`).then((r) => r.data),
};

// ── GDPR data subject portal (Wave 16d) ────────────────────────────────────

export const gdprApi = {
  exportData: (personId: string) =>
    api.post(`/persons/${personId}/export`).then((r) => r.data),
  // The controller requires { confirm: true, reason } in the body. The query
  // string `?reason=` is also accepted but the body fields are mandatory.
  erase: (personId: string, reason: string) =>
    api
      .delete(`/persons/${personId}`, {
        params: { reason },
        data: { confirm: true, reason },
      })
      .then((r) => r.data),
};

// ── Webhook DLQ admin ──────────────────────────────────────────────────────

export const webhookDlqApi = {
  list: (resolved: boolean, take?: number) =>
    api
      .get('/admin/webhook-dlq', { params: { resolved: String(resolved), take } })
      .then((r) => r.data),
  replay: (id: string) =>
    api.post(`/admin/webhook-dlq/${id}/replay`).then((r) => r.data),
  resolve: (id: string, note?: string) =>
    api.post(`/admin/webhook-dlq/${id}/resolve`, { note }).then((r) => r.data),
};

<<<<<<< HEAD
// ── Reports + Dashboards (Wave 19a / 20a) ─────────────────────────────────

export type ReportFormat = 'tabular' | 'summary' | 'matrix';
export type ReportAggregateType = 'sum' | 'avg' | 'min' | 'max' | 'count';
export type ReportFilterOp =
  | 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith' | 'isNull' | 'isNotNull';

export interface ReportFilter {
  field: string;
  op: ReportFilterOp;
  value?: unknown;
}
export interface ReportAggregate {
  type: ReportAggregateType;
  field?: string;
  alias?: string;
}
export interface ReportSort { field: string; direction?: 'asc' | 'desc' }
export interface ReportConfig {
  columns: string[];
  filters?: ReportFilter[];
  groupBy?: string[];
  aggregates?: ReportAggregate[];
  sortBy?: ReportSort[];
  limit?: number;
}
export interface RunReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
  grouped?: Array<{ key: Record<string, unknown>; aggregates: Record<string, number>; count: number }>;
  totals?: Record<string, number>;
}

export interface ReportType {
  id: string;
  apiName: string;
  label: string;
  baseObject: string;
  joins?: Array<{ object: string; foreignKey: string; alias: string }>;
  availableColumns?: string[];
  isStandard?: boolean;
}

export interface ReportDef {
  id: string;
  tenantId: string;
  reportTypeId: string;
  name: string;
  description?: string | null;
  format: ReportFormat;
  config: ReportConfig;
  ownerId: string;
  isPublic: boolean;
  folderName?: string | null;
  createdAt: string;
  updatedAt: string;
  reportType?: ReportType;
}

export type Visualization = 'table' | 'bar' | 'line' | 'pie' | 'metric' | 'donut';

export interface DashboardComponent {
  id: string;
  dashboardId: string;
  reportId: string;
  visualization: Visualization;
  title: string;
  options?: Record<string, unknown>;
  position?: { x?: number; y?: number; w?: number; h?: number };
  createdAt: string;
  report?: ReportDef;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  isPublic: boolean;
  layout?: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
  components?: DashboardComponent[];
  createdAt: string;
  updatedAt: string;
}

export const reportApi = {
  listTypes: () => api.get<ReportType[]>('/report-types').then((r) => r.data),
  list: () => api.get<ReportDef[]>('/reports').then((r) => r.data),
  get: (id: string) => api.get<ReportDef>(`/reports/${id}`).then((r) => r.data),
  create: (d: {
    reportTypeId: string;
    name: string;
    description?: string;
    format?: ReportFormat;
    config: ReportConfig;
    isPublic?: boolean;
    folderName?: string;
  }) => api.post<ReportDef>('/reports', d).then((r) => r.data),
  update: (id: string, d: Partial<{
    name: string;
    description: string | null;
    format: ReportFormat;
    config: ReportConfig;
    isPublic: boolean;
    folderName: string | null;
  }>) => api.put<ReportDef>(`/reports/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/reports/${id}`).then((r) => r.data),
  run: (id: string, runtimeFilters?: ReportFilter[]) =>
    api.post<RunReportResult>(`/reports/${id}/run`, { runtimeFilters }).then((r) => r.data),
  runAdHoc: (baseObject: string, config: ReportConfig) =>
    api.post<RunReportResult>('/reports/run-adhoc', { baseObject, config }).then((r) => r.data),
};

export const dashboardApi = {
  list: () => api.get<Dashboard[]>('/dashboards').then((r) => r.data),
  get: (id: string) => api.get<Dashboard>(`/dashboards/${id}`).then((r) => r.data),
  create: (d: {
    name: string;
    description?: string;
    layout?: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
    isPublic?: boolean;
  }) => api.post<Dashboard>('/dashboards', d).then((r) => r.data),
  update: (id: string, d: Partial<{
    name: string;
    description: string | null;
    layout: Array<{ componentId: string; x: number; y: number; w: number; h: number }>;
    isPublic: boolean;
  }>) => api.put<Dashboard>(`/dashboards/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/dashboards/${id}`).then((r) => r.data),
  run: (id: string) =>
    api
      .get<{ dashboardId: string; components: Record<string, RunReportResult | { error: string }> }>(
        `/dashboards/${id}/run`,
      )
      .then((r) => r.data),
  addComponent: (
    id: string,
    d: {
      reportId: string;
      visualization?: Visualization;
      title: string;
      options?: Record<string, unknown>;
      position?: { x: number; y: number; w: number; h: number };
    },
  ) => api.post<DashboardComponent>(`/dashboards/${id}/components`, d).then((r) => r.data),
  removeComponent: (id: string, componentId: string) =>
    api.delete(`/dashboards/${id}/components/${componentId}`).then((r) => r.data),
};

// ── Sharing: OWD / Public Groups / Queues (Wave 19c / 20c) ─────────────────

export type InternalSharing = 'private' | 'public_read' | 'public_read_write';

export interface ResolvedOwd {
  objectApiName: string;
  internalSharing: InternalSharing;
  externalSharing: string | null;
  grantHierarchy: boolean;
  isDefault?: boolean;
}

export const owdApi = {
  list: (): Promise<ResolvedOwd[]> => api.get('/admin/owd').then((r) => r.data),
  get: (objectApiName: string): Promise<ResolvedOwd> =>
    api.get(`/admin/owd/${objectApiName}`).then((r) => r.data),
  set: (
    objectApiName: string,
    dto: { internalSharing: InternalSharing; externalSharing?: string | null; grantHierarchy: boolean },
  ) => api.put(`/admin/owd/${objectApiName}`, dto).then((r) => r.data),
};

export interface PublicGroupSummary {
  id: string;
  apiName: string;
  label: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { members: number };
}

export interface PublicGroupMember {
  id: string;
  groupId: string;
  userId: string | null;
  roleId: string | null;
  createdAt: string;
}

export interface PublicGroupDetail extends PublicGroupSummary {
  members: PublicGroupMember[];
}

export const publicGroupsApi = {
  list: (): Promise<PublicGroupSummary[]> =>
    api.get('/admin/public-groups').then((r) => r.data),
  get: (id: string): Promise<PublicGroupDetail> =>
    api.get(`/admin/public-groups/${id}`).then((r) => r.data),
  create: (d: { apiName: string; label: string; description?: string | null; isActive?: boolean }) =>
    api.post('/admin/public-groups', d).then((r) => r.data),
  update: (id: string, d: { label?: string; description?: string | null; isActive?: boolean }) =>
    api.patch(`/admin/public-groups/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/public-groups/${id}`).then((r) => r.data),
  addMember: (id: string, d: { userId?: string | null; roleId?: string | null }) =>
    api.post(`/admin/public-groups/${id}/members`, d).then((r) => r.data),
  removeMember: (id: string, memberId: string) =>
    api.delete(`/admin/public-groups/${id}/members/${memberId}`).then((r) => r.data),
};

export interface QueueSummary {
  id: string;
  apiName: string;
  label: string;
  supportedObjects: string[];
  groupId: string | null;
  group?: { id: string; apiName: string; label: string } | null;
  createdAt: string;
}

export interface QueueItem {
  recordType: string;
  id: string;
  label: string;
}

export const queuesApi = {
  list: (): Promise<QueueSummary[]> => api.get('/admin/queues').then((r) => r.data),
  get: (id: string): Promise<QueueSummary> => api.get(`/admin/queues/${id}`).then((r) => r.data),
  create: (d: { apiName: string; label: string; supportedObjects: string[]; groupId?: string | null }) =>
    api.post('/admin/queues', d).then((r) => r.data),
  update: (
    id: string,
    d: { label?: string; supportedObjects?: string[]; groupId?: string | null },
  ) => api.patch(`/admin/queues/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/queues/${id}`).then((r) => r.data),
  items: (id: string): Promise<QueueItem[]> => api.get(`/queues/${id}/items`).then((r) => r.data),
  claim: (id: string, recordType: 'lead' | 'case', recordId: string) =>
    api.post(`/queues/${id}/claim`, { recordType, recordId }).then((r) => r.data),
};

// ── Territory Management (Wave 19f / 20f) ─────────────────────────────────

export const territoryApi = {
  list: () => api.get('/admin/territories').then((r) => r.data),
  get: (id: string) => api.get(`/admin/territories/${id}`).then((r) => r.data),
  create: (d: {
    apiName: string;
    label: string;
    description?: string;
    parentId?: string | null;
    type?: string;
    isActive?: boolean;
  }) => api.post('/admin/territories', d).then((r) => r.data),
  update: (
    id: string,
    d: {
      label?: string;
      description?: string | null;
      parentId?: string | null;
      type?: string;
      isActive?: boolean;
    },
  ) => api.patch(`/admin/territories/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/territories/${id}`).then((r) => r.data),

  assignUser: (id: string, body: { userId: string; roleInTerritory?: string; isPrimary?: boolean }) =>
    api.post(`/admin/territories/${id}/users`, body).then((r) => r.data),
  unassignUser: (id: string, userId: string) =>
    api.delete(`/admin/territories/${id}/users/${userId}`).then((r) => r.data),

  assignAccount: (id: string, accountId: string, body: { isPrimary?: boolean } = {}) =>
    api.post(`/admin/territories/${id}/accounts/${accountId}`, body).then((r) => r.data),
  unassignAccount: (id: string, accountId: string) =>
    api.delete(`/admin/territories/${id}/accounts/${accountId}`).then((r) => r.data),

  listRules: (id: string) => api.get(`/admin/territories/${id}/rules`).then((r) => r.data),
  createRule: (
    id: string,
    d: {
      name: string;
      description?: string | null;
      conditions: unknown;
      matchType?: 'all' | 'any';
      priority?: number;
      isActive?: boolean;
    },
  ) => api.post(`/admin/territories/${id}/rules`, d).then((r) => r.data),
  updateRule: (
    id: string,
    ruleId: string,
    d: {
      name?: string;
      description?: string | null;
      conditions?: unknown;
      matchType?: 'all' | 'any';
      priority?: number;
      isActive?: boolean;
    },
  ) => api.patch(`/admin/territories/${id}/rules/${ruleId}`, d).then((r) => r.data),
  deleteRule: (id: string, ruleId: string) =>
    api.delete(`/admin/territories/${id}/rules/${ruleId}`).then((r) => r.data),

  runAllRules: () => api.post('/admin/territories/run-rules').then((r) => r.data),
};

export const genericApi = {
  list: (objName: string, p?: Record<string, unknown>) => api.get(`/records/${objName}`, { params: p }).then(r => r.data),
  get: (objName: string, id: string) => api.get(`/records/${objName}/${id}`).then(r => r.data),
  create: (objName: string, data: unknown) => api.post(`/records/${objName}`, data).then(r => r.data),
  update: (objName: string, id: string, data: unknown) => api.put(`/records/${objName}/${id}`, data).then(r => r.data),
  remove: (objName: string, id: string) => api.delete(`/records/${objName}/${id}`).then(r => r.data),
};

// ── Wave 19d / 20d: Profiles + Permission Sets + me/permissions ──
export interface CrudFlags { read?: boolean; write?: boolean; create?: boolean; delete?: boolean }
export interface FieldFlags { read?: boolean; write?: boolean }

export interface ProfileDto {
  id: string;
  tenantId: string;
  apiName: string;
  label: string;
  description?: string | null;
  isSystem: boolean;
  objectCrud: Record<string, CrudFlags>;
  fieldPerms: Record<string, FieldFlags>;
  systemPerms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionSetDto {
  id: string;
  tenantId: string;
  apiName: string;
  label: string;
  description?: string | null;
  isActive: boolean;
  objectCrud: Record<string, CrudFlags>;
  fieldPerms: Record<string, FieldFlags>;
  systemPerms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedPermissionsDto {
  objectCrud: Record<string, CrudFlags>;
  fieldPerms: Record<string, FieldFlags>;
  systemPerms: string[];
  flat: string[];
  legacyFallback: boolean;
}

export const profilesApi = {
  list: () => api.get<ProfileDto[]>('/admin/profiles').then((r) => r.data),
  get: (id: string) => api.get<ProfileDto>(`/admin/profiles/${id}`).then((r) => r.data),
  create: (d: { apiName: string; label: string; description?: string }) =>
    api.post<ProfileDto>('/admin/profiles', d).then((r) => r.data),
  update: (id: string, d: Partial<ProfileDto>) =>
    api.patch<ProfileDto>(`/admin/profiles/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/profiles/${id}`).then((r) => r.data),
  assignUser: (id: string, userId: string) =>
    api.post(`/admin/profiles/${id}/assign-user`, { userId }).then((r) => r.data),
};

export const permissionSetsApi = {
  list: () => api.get<PermissionSetDto[]>('/admin/permission-sets').then((r) => r.data),
  get: (id: string) => api.get<PermissionSetDto>(`/admin/permission-sets/${id}`).then((r) => r.data),
  create: (d: { apiName: string; label: string; description?: string }) =>
    api.post<PermissionSetDto>('/admin/permission-sets', d).then((r) => r.data),
  update: (id: string, d: Partial<PermissionSetDto>) =>
    api.patch<PermissionSetDto>(`/admin/permission-sets/${id}`, d).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/permission-sets/${id}`).then((r) => r.data),
  assignUser: (id: string, userId: string, expiresAt?: string | null) =>
    api.post(`/admin/permission-sets/${id}/assign-user`, { userId, expiresAt: expiresAt ?? undefined }).then((r) => r.data),
  revokeUser: (id: string, userId: string) =>
    api.delete(`/admin/permission-sets/${id}/assign-user/${userId}`).then((r) => r.data),
};

export const mePermissionsApi = {
  resolved: () => api.get<ResolvedPermissionsDto>('/me/permissions').then((r) => r.data),
};
