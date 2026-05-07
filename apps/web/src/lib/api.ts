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
  deleteField: (fieldId: string) => api.delete(`/admin/metadata/fields/${fieldId}`).then((r) => r.data),
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

export const genericApi = {
  list: (objName: string, p?: Record<string, unknown>) => api.get(`/records/${objName}`, { params: p }).then(r => r.data),
  get: (objName: string, id: string) => api.get(`/records/${objName}/${id}`).then(r => r.data),
  create: (objName: string, data: unknown) => api.post(`/records/${objName}`, data).then(r => r.data),
  update: (objName: string, id: string, data: unknown) => api.put(`/records/${objName}/${id}`, data).then(r => r.data),
  remove: (objName: string, id: string) => api.delete(`/records/${objName}/${id}`).then(r => r.data),
};
