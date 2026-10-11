import { Injectable } from '@angular/core';
import { ApiClientService } from '../api/api-client.service';

@Injectable({ providedIn: 'root' })
export class SessionService {
  constructor(private readonly apiClient: ApiClientService) {}

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.apiClient.request('/api/v1/auth/session');
      return true;
    } catch {
      return false;
    }
  }

  async signOut(): Promise<void> {
    await this.apiClient.request('/api/v1/auth/logout', { method: 'POST' });
  }
}
