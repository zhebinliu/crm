import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  createField: (objectApiName: string, d: unknown) => api.post(`/admin/metadata/objects/${objectApiName}/fields`, d).then((r) => r.data),
  deleteField: (fieldId: string) => api.delete(`/admin/metadata/fields/${fieldId}`).then((r) => r.data),
  listPicklists: () => api.get('/admin/metadata/picklists').then((r) => r.data),
  saveLayout: (name: string, layout: unknown) => api.post(`/admin/metadata/objects/${name}/layout`, layout).then((r) => r.data),
  getLayout: (name: string) => api.get(`/admin/metadata/objects/${name}/layout`).then((r) => r.data),
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

export const genericApi = {
  list: (objName: string, p?: Record<string, unknown>) => api.get(`/records/${objName}`, { params: p }).then(r => r.data),
  get: (objName: string, id: string) => api.get(`/records/${objName}/${id}`).then(r => r.data),
  create: (objName: string, data: unknown) => api.post(`/records/${objName}`, data).then(r => r.data),
  update: (objName: string, id: string, data: unknown) => api.put(`/records/${objName}/${id}`, data).then(r => r.data),
  remove: (objName: string, id: string) => api.delete(`/records/${objName}/${id}`).then(r => r.data),
};
