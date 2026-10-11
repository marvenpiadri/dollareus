import { Component, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';

@Component({
  selector: 'dlr-api-credentials',
  standalone: true,
  templateUrl: './api-credentials.component.html',
  styleUrl: './api-credentials.component.css'
})
export class ApiCredentialsComponent {
  readonly organizationId = input.required<string>();
  readonly notifyRequested = output<string>();
  protected readonly apiCredentialName = signal('External integration');
  protected readonly apiCredentialScopes = signal('read');
  protected readonly apiCredentialExpiry = signal('90');
  protected readonly apiCredentialBusy = signal(false);
  protected readonly apiCredentialError = signal('');
  protected readonly apiCredentialToken = signal('');
  protected readonly apiCredentials = signal<any[]>([]);

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      if (organizationId) void this.loadApiCredentials();
    });
  }

  protected async loadApiCredentials(): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) return;
    this.apiCredentialBusy.set(true);
    this.apiCredentialError.set('');
    try {
      this.apiCredentials.set(await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/api-credentials'));
    } catch (error) {
      this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not load API credentials.');
    } finally {
      this.apiCredentialBusy.set(false);
    }
  }

  protected async createApiCredential(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const scopes = String(values.get('scopes') ?? 'read').split(',') as ('read' | 'write')[];
    const expiry = String(values.get('expiry') ?? '90');
    const expiresAt = expiry === 'never' ? undefined : new Date(Date.now() + Number(expiry) * 86400000).toISOString();
    this.apiCredentialBusy.set(true);
    this.apiCredentialError.set('');
    this.apiCredentialToken.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials', {
        method: 'POST',
        body: JSON.stringify({ name, scopes, ...(expiresAt ? { expiresAt } : {}) })
      });
      this.apiCredentialToken.set(String(result.token ?? ''));
      this.apiCredentialName.set('External integration');
      form.reset();
      await this.loadApiCredentials();
      this.notifyRequested.emit('API credential created. Copy its token before hiding it.');
    } catch (error) {
      this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not create API credential.');
    } finally {
      this.apiCredentialBusy.set(false);
    }
  }

  protected async revokeApiCredential(credential: any): Promise<void> {
    if (!credential?.id || !globalThis.confirm('Revoke "' + String(credential.name) + '"? Applications using this token will stop working.')) return;
    this.apiCredentialBusy.set(true);
    this.apiCredentialError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials/' + encodeURIComponent(credential.id), {
        method: 'DELETE',
        body: JSON.stringify({})
      });
      await this.loadApiCredentials();
      this.notifyRequested.emit('API credential revoked.');
    } catch (error) {
      this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not revoke API credential.');
    } finally {
      this.apiCredentialBusy.set(false);
    }
  }

  protected copyApiCredentialToken(): void {
    const token = this.apiCredentialToken();
    if (!token || !globalThis.navigator?.clipboard) {
      this.apiCredentialError.set('Clipboard access is unavailable. Select and copy the token manually.');
      return;
    }
    void globalThis.navigator.clipboard.writeText(token)
      .then(() => this.notifyRequested.emit('API token copied.'))
      .catch(() => this.apiCredentialError.set('Could not access the clipboard. Select and copy the token manually.'));
  }
}
