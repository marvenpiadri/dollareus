import { Component, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';

type AuthMode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

@Component({
  selector: 'dlr-auth-panel',
  standalone: true,
  templateUrl: './auth-panel.component.html',
  styleUrl: './auth-panel.component.css'
})
export class AuthPanelComponent {
  readonly signedIn = output<void>();
  protected readonly mode = signal<AuthMode>('login');
  protected get apiBase(): string { return this.apiClient.baseUrl; }
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly lastEmail = signal('');
  protected readonly providers = signal({ google: false, facebook: false, emailFlows: false });

  constructor(private readonly apiClient: ApiClientService) {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('auth');
      if (action === 'verify-email') this.mode.set('verify');
      else if (action === 'reset-password') this.mode.set('reset');
      else if (window.location.pathname === '/signup' || params.get('mode') === 'register') this.mode.set('register');
    }
    void this.loadProviders();
  }

  private async loadProviders(): Promise<void> {
    try {
      const payload = await this.apiClient.request<{ google?: boolean; facebook?: boolean; emailFlows?: boolean }>('/api/v1/auth/providers');
      this.providers.set({ google: payload?.google === true, facebook: payload?.facebook === true, emailFlows: payload?.emailFlows === true });
    } catch { /* Email/password authentication remains available when provider discovery fails. */ }
  }

  protected setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.message.set('');
    this.error.set('');
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const mode = this.mode();
    const endpoint = mode === 'register' ? '/api/v1/auth/register' : mode === 'forgot' ? '/api/v1/auth/password/forgot' : '/api/v1/auth/login';
    const body: Record<string, string> = { email: String(values.get('email') ?? '') };
    this.lastEmail.set(body['email']);
    if (mode === 'register') body['displayName'] = String(values.get('displayName') ?? '');
    if (mode !== 'forgot') body['password'] = String(values.get('password') ?? '');
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      const payload = await this.apiClient.request<{ message?: string }>(endpoint, { method: 'POST', body: JSON.stringify(body) });
      if (mode === 'register') {
        this.message.set('Your account is ready. Opening your workspace…');
        this.signedIn.emit();
      } else if (mode === 'forgot') {
        this.message.set(payload?.message ?? 'If an account exists for that email, reset instructions will be sent.');
      } else {
        this.signedIn.emit();
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      const payload = await this.apiClient.request<{ message?: string }>('/api/v1/auth/email/verification/request', { method: 'POST', body: JSON.stringify({ email: this.lastEmail() }) });
      this.message.set(payload?.message ?? 'If the account needs verification, an email will be sent.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not request a verification email.');
    } finally { this.busy.set(false); }
  }

  protected async confirmEmail(): Promise<void> {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    await this.runAction('/api/v1/auth/email/verification/confirm', { token }, 'Your email is verified. You can now sign in.', 'The verification link is invalid or expired.');
    if (!this.error()) this.mode.set('login');
  }

  protected async resetPassword(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    await this.runAction('/api/v1/auth/password/reset', { token, password: String(values.get('password') ?? '') }, 'Your password has been reset. Please sign in with your new password.', 'The reset link is invalid or expired.');
    if (!this.error()) this.mode.set('login');
  }

  private async runAction(path: string, body: Record<string, string>, success: string, fallback: string): Promise<void> {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.apiClient.request(path, { method: 'POST', body: JSON.stringify(body) });
      this.message.set(success);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : fallback);
    } finally {
      this.busy.set(false);
    }
  }
}
