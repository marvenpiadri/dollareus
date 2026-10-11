import { Injectable } from '@angular/core';

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly baseUrl = ((globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string }).DOLLAREUS_API_URL ?? '').replace(/\/$/, '');

  url(path: string): string {
    return this.baseUrl + path;
  }

  async request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
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
    return payload.data as T;
  }
}
