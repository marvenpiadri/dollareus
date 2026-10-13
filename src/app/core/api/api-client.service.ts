import { Injectable } from '@angular/core';

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly runtime = globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string; process?: { env?: Record<string, string | undefined> } };
  readonly baseUrl = (this.runtime.DOLLAREUS_API_URL ?? this.runtime.process?.env?.['DOLLAREUS_API_URL'] ?? '').replace(/\/$/, '');

  url(path: string): string {
    return this.baseUrl + path;
  }

  async request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('dollareus_token') : null;
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const hasBody = init.body !== undefined && init.body !== null;
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (hasBody && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(this.url(path), {
      ...init,
      credentials: init.credentials ?? 'include',
      headers
    });
    const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
    if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status}).`);
    if ((path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/register')) && typeof localStorage !== 'undefined') {
      const data = payload.data as { token?: string };
      if (data?.token) {
        localStorage.setItem('dollareus_token', data.token);
      }
    }
    if (path.startsWith('/api/v1/auth/logout') && typeof localStorage !== 'undefined') {
      localStorage.removeItem('dollareus_token');
    }
    return payload.data as T;
  }
}
