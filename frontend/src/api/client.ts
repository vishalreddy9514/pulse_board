import type { AuthUser, HistoryBucket, HistorySummary, PulseEvent, PulseEventType } from '../types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const WS_URL = import.meta.env.VITE_WS_URL ?? API_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message.join(', ') : body?.message;
    throw new ApiError(message ?? `Request failed (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

export const api = {
  login(email: string, password: string) {
    return request<{ accessToken: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register(email: string, password: string) {
    return request<{ accessToken: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me(token: string) {
    return request<AuthUser>('/api/auth/me', {}, token);
  },

  historySeries(
    token: string,
    params: { from: string; to: string; bucketSeconds: number },
  ): Promise<HistoryBucket[]> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      bucketSeconds: String(params.bucketSeconds),
    });
    return request<HistoryBucket[]>(`/api/history/series?${query}`, {}, token);
  },

  historySummary(token: string, params: { from: string; to: string }): Promise<HistorySummary> {
    const query = new URLSearchParams(params);
    return request<HistorySummary>(`/api/history/summary?${query}`, {}, token);
  },

  historyEvents(
    token: string,
    params: { from: string; to: string; limit?: number; type?: PulseEventType },
  ): Promise<PulseEvent[]> {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.limit) query.set('limit', String(params.limit));
    if (params.type) query.set('type', params.type);
    return request<PulseEvent[]>(`/api/history/events?${query}`, {}, token);
  },
};
