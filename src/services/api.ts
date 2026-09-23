import type {
  DashboardStats,
  Repository,
  Credential,
  Inventory,
  Environment,
  TaskTemplate,
  TaskExecution,
  Schedule,
  PendingRequest,
  ApiToken,
  Workflow,
  User,
  DatabaseTypeRecord,
  SystemInfo
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  } as Record<string, string>;

  const fullUrl = `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers,
    ...options
  });

  // Handle 304 Not Modified gracefully during development (no body)
  if (res.status === 304) {
    return ([] as unknown) as T;
  }

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch (err) {
      try {
        errorData = await res.text();
      } catch (_) {
        errorData = {};
      }
    }

    const message = (errorData && errorData.error) || `HTTP error! status: ${res.status}`;

    // Log detailed info to help debugging in the browser console
    try {
      console.error('[api] Request failed', {
        url: fullUrl,
        method: options?.method || 'GET',
        status: res.status,
        tokenPresent: !!token,
        responseBody: errorData
      });
    } catch (_) {}

    // If unauthorized, clear token so UI redirects to login as needed
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
    }

    throw new Error(message);
  }

  return res.json();
}

export const api = {
  // Dashboard
  getStats: () => fetchJson<DashboardStats>('/dashboard/stats'),

  // Repositories
  // Add cache-busting to avoid 304/cached responses during development
  getRepositories: () => fetchJson<Repository[]>(`/repositories?ts=${Date.now()}`, { cache: 'no-store' }),
  createRepository: (data: Partial<Repository>) =>
    fetchJson<Repository>('/repositories', { method: 'POST', body: JSON.stringify(data) }),
  syncRepository: (id: string) =>
    fetchJson<{ message: string; repo: Repository }>(`/repositories/${id}/sync`, { method: 'POST' }),
  deleteRepository: (id: string) =>
    fetchJson<{ success: boolean }>(`/repositories/${id}`, { method: 'DELETE' }),

  // Credentials
  getCredentials: () => fetchJson<Credential[]>('/credentials'),
  createCredential: (data: Partial<Credential>) =>
    fetchJson<Credential>('/credentials', { method: 'POST', body: JSON.stringify(data) }),
  updateCredential: (id: string, data: Partial<Credential>) =>
    fetchJson<Credential>(`/credentials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCredential: (id: string) =>
    fetchJson<{ success: boolean }>(`/credentials/${id}`, { method: 'DELETE' }),

  // Inventories
  getInventories: () => fetchJson<Inventory[]>('/inventories'),
  createInventory: (data: Partial<Inventory>) =>
    fetchJson<Inventory>('/inventories', { method: 'POST', body: JSON.stringify(data) }),
  updateInventory: (id: string, data: Partial<Inventory>) =>
    fetchJson<Inventory>(`/inventories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInventory: (id: string) =>
    fetchJson<{ success: boolean }>(`/inventories/${id}`, { method: 'DELETE' }),

  // Database types
  getDatabaseTypes: () => fetchJson<DatabaseTypeRecord[]>('/database-types'),
  createDatabaseType: (data: Partial<DatabaseTypeRecord>) =>
    fetchJson<DatabaseTypeRecord>('/database-types', { method: 'POST', body: JSON.stringify(data) }),
  updateDatabaseType: (id: string, data: Partial<DatabaseTypeRecord>) =>
    fetchJson<DatabaseTypeRecord>(`/database-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDatabaseType: (id: string) =>
    fetchJson<{ success: boolean }>(`/database-types/${id}`, { method: 'DELETE' }),

  // Environments
  getEnvironments: () => fetchJson<Environment[]>('/environments'),
  createEnvironment: (data: Partial<Environment>) =>
    fetchJson<Environment>('/environments', { method: 'POST', body: JSON.stringify(data) }),
  updateEnvironment: (id: string, data: Partial<Environment>) =>
    fetchJson<Environment>(`/environments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEnvironment: (id: string) =>
    fetchJson<{ success: boolean }>(`/environments/${id}`, { method: 'DELETE' }),

  // Templates
  getTemplates: () => fetchJson<TaskTemplate[]>('/templates'),
  getTemplate: (id: string) => fetchJson<TaskTemplate>(`/templates/${id}`),
  createTemplate: (data: Partial<TaskTemplate>) =>
    fetchJson<TaskTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: Partial<TaskTemplate>) =>
    fetchJson<TaskTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    fetchJson<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  runTemplate: (id: string, payload?: { extraVars?: string; limit?: string; triggeredBy?: string }) =>
    fetchJson<TaskExecution>(`/templates/${id}/run`, { method: 'POST', body: JSON.stringify(payload || {}) }),

  // Tasks & Logs
  getAllTasks: () => fetchJson<TaskExecution[]>('/tasks'),
  getTasks: (templateId?: string) =>
    fetchJson<TaskExecution[]>(`/tasks${templateId ? `?templateId=${templateId}` : ''}`),
  getTask: (id: string) => fetchJson<TaskExecution>(`/tasks/${id}`),
  cancelTask: (id: string) =>
    fetchJson<{ message: string; task: TaskExecution }>(`/tasks/${id}/cancel`, { method: 'POST' }),
  deleteTask: (id: string) =>
    fetchJson<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  // Schedules
  getSchedules: () => fetchJson<Schedule[]>('/schedules'),
  createSchedule: (data: Partial<Schedule>) =>
    fetchJson<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: Partial<Schedule>) =>
    fetchJson<Schedule>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    fetchJson<{ success: boolean }>(`/schedules/${id}`, { method: 'DELETE' }),

  // Pending Requests (Approvals)
  getPendingRequests: () => fetchJson<PendingRequest[]>('/pending-requests'),
  createPendingRequest: (data: Partial<PendingRequest>) =>
    fetchJson<PendingRequest>('/pending-requests', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  approveRequest: (id: string, reviewer?: string) =>
    fetchJson<{ message: string; task?: TaskExecution }>(`/pending-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reviewer })
    }),
  rejectRequest: (id: string, rejectionReason?: string, reviewer?: string) =>
    fetchJson<{ message: string }>(`/pending-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason, reviewer })
    }),

  // API Tokens
  getTokens: () => fetchJson<ApiToken[]>('/tokens'),
  createToken: (data: Partial<ApiToken>) =>
    fetchJson<ApiToken>('/tokens', { method: 'POST', body: JSON.stringify(data) }),
  deleteToken: (id: string) => fetchJson<{ success: boolean }>(`/tokens/${id}`, { method: 'DELETE' }),

  // Workflows (DAGs)
  getWorkflows: () => fetchJson<Workflow[]>('/workflows'),
  createWorkflow: (data: Partial<Workflow>) =>
    fetchJson<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id: string, data: Partial<Workflow>) =>
    fetchJson<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  submitWorkflowApproval: (workflowId: string, nodeId: string, decision: 'yes' | 'no') =>
    fetchJson<Workflow>(`/workflows/${workflowId}/approval/${nodeId}`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    }),
  deleteWorkflow: (id: string) =>
    fetchJson<{ success: boolean }>(`/workflows/${id}`, { method: 'DELETE' }),

  // Users
  getUsers: () => fetchJson<User[]>('/users'),
  createUser: (data: Partial<User>) =>
    fetchJson<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<User>) =>
    fetchJson<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    fetchJson<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  // System Info
  getSystemInfo: () => fetchJson<SystemInfo>('/system-info'),
};

