import { Component, output, signal } from '@angular/core';

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
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly apiBase = ((globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string }).DOLLAREUS_API_URL ?? '').replace(/\/$/, '');

  constructor() {
    if (typeof window !== 'undefined') {
      const action = new URLSearchParams(window.location.search).get('auth');
      if (action === 'verify-email') this.mode.set('verify');
      if (action === 'reset-password') this.mode.set('reset');
    }
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
    if (mode === 'register') body.displayName = String(values.get('displayName') ?? '');
    if (mode !== 'forgot') body.password = String(values.get('password') ?? '');
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      const response = await fetch(this.apiBase + endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { data?: { message?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'The request could not be completed.');
      if (mode === 'register') {
        this.setMode('login');
        this.message.set('Your account was created. Check your inbox for the verification link before signing in.');
      } else if (mode === 'forgot') {
        this.message.set(payload.data?.message ?? 'If an account exists for that email, reset instructions will be sent.');
      } else {
        this.signedIn.emit();
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      this.busy.set(false);
    }
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
      const response = await fetch(this.apiBase + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? fallback);
      this.message.set(success);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : fallback);
    } finally {
      this.busy.set(false);
    }
  }
}
