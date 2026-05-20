import axios from 'axios';
import { useFilters } from '@/store/filters';
import { useAuthStore } from '@/store/auth';

const api = axios.create({ baseURL: 'http://localhost:3001/api', withCredentials: true });

/** Returns the global filter query params from the store — call inside components */
export function useGlobalParams() {
  const { justMyData, ownerRolePattern, ownerName } = useFilters();
  const authStore = useAuthStore();
  const currentUserId = authStore.user?.id;
  const base = currentUserId ? { currentUserId } : {};
  if (justMyData && currentUserId) return { ...base, justMyData: 'true' };
  if (ownerName) return { ...base, ownerName };
  if (ownerRolePattern) return { ...base, ownerRolePattern };
  return base;
}

export const authApi = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const activitiesApi = {
  list: (params?: Record<string, any>) => api.get('/activities', { params }),
  get: (id: string) => api.get(`/activities/${id}`),
  create: (data: any) => api.post('/activities', data),
  update: (id: string, data: any) => api.patch(`/activities/${id}`, data),
  searchRelated: (params: { oppName?: string; accountName?: string; ownerName?: string; ownerRole?: string }) => api.get('/activities/search-related', { params }),
  logEvent: (data: any) => api.post('/activities/log-event', data),
  recordTypes: () => api.get('/activities/record-types'),
};

export const dealContributionsApi = {
  list: (params?: Record<string, any>) => api.get('/deal-contributions', { params }),
  get: (id: string) => api.get(`/deal-contributions/${id}`),
  create: (data: any) => api.post('/deal-contributions', data),
  update: (id: string, data: any) => api.patch(`/deal-contributions/${id}`, data),
  upsert: (data: any) => api.post('/deal-contributions/upsert', data),
};

export const accountsApi = {
  list: (params?: Record<string, any>) => api.get('/accounts', { params }),
  get: (id: string) => api.get(`/accounts/${id}`),
  update: (id: string, data: any) => api.patch(`/accounts/${id}`, data),
};

export const usersApi = {
  list: (params?: Record<string, any>) => api.get('/users', { params }),
  me: () => api.get('/users/me'),
  get: (id: string) => api.get(`/users/${id}`),
};

export const opportunitiesApi = {
  list: (params?: Record<string, any>) => api.get('/opportunities', { params }),
  get: (id: string) => api.get(`/opportunities/${id}`),
  create: (data: any) => api.post('/opportunities', data),
  update: (id: string, data: any) => api.patch(`/opportunities/${id}`, data),
};

export const travelApprovalsApi = {
  list: (params?: Record<string, any>) => api.get('/travel-approvals', { params }),
  get: (id: string) => api.get(`/travel-approvals/${id}`),
  create: (data: any) => api.post('/travel-approvals', data),
  update: (id: string, data: any) => api.patch(`/travel-approvals/${id}`, data),
};

export const slackApi = {
  send: (channel: string, text: string) => api.post('/slack/send', { channel, text }),
};

export const metaApi = {
  picklist: (object: string, field: string) => api.get(`/meta/picklist/${object}/${field}`),
};

export const dashboardApi = {
  summary: (params?: Record<string, any>) => api.get('/dashboard', { params }),
};

export const assistantApi = {
  briefing: (
    data: {
      currentUserId: string; dateFrom: string; dateTo: string;
      accountScope?: string; calExclude?: string; roleFilter?: string;
    },
    onEvent: (event: { type: string; [k: string]: any }) => void,
  ): Promise<void> =>
    fetch('http://localhost:3001/api/assistant/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    }).then(async res => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore */ }
          }
        }
      }
    }),
  execute: (data: { currentUserId: string; activities?: any[]; dcs?: any[] }) =>
    api.post('/assistant/execute', data),
};


export const calendarApi = {
  status: () => api.get('/calendar/status'),
  connect: (returnTo?: string) => {
    const url = new URL('http://localhost:3001/api/calendar/oauth/connect');
    if (returnTo) url.searchParams.set('returnTo', returnTo);
    window.location.href = url.toString();
  },
  disconnect: () => api.delete('/calendar/disconnect'),
  events: (params?: Record<string, any>) => api.get('/calendar/events', { params }),
};

export default api;
