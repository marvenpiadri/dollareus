import { Component, input, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';

@Component({
  selector: 'dlr-storefront-settings',
  standalone: true,
  templateUrl: './storefront-settings.component.html',
  styleUrl: './storefront-settings.component.css'
})
export class StorefrontSettingsComponent {
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  protected readonly settings = signal<any | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  constructor(private readonly api: ApiClientService) {}

  ngOnInit(): void { void this.load(); }

  protected enabled(experience: string): boolean {
    return (this.settings()?.enabledExperiences ?? []).includes(experience);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const enabledExperiences = values.getAll('experiences').map(String);
    const defaultExperience = String(values.get('defaultExperience') ?? 'catalog');
    if (!enabledExperiences.includes(defaultExperience)) {
      this.error.set('The default experience must also be enabled.');
      return;
    }
    const publicHandle = String(values.get('publicHandle') ?? '').trim().toLowerCase();
    const locationSlug = String(values.get('locationSlug') ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(publicHandle)) {
      this.error.set('Use 2–60 lowercase letters and numbers, separated only by hyphens or underscores.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(locationSlug)) {
      this.error.set('Use lowercase letters, numbers and hyphens for the location address.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await this.api.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/storefront', {
        method: 'PATCH',
        body: JSON.stringify({
          publicHandle,
          locationSlug,
          published: values.get('published') === 'on',
          defaultExperience,
          enabledExperiences,
          seoTitle: String(values.get('seoTitle') ?? '').trim() || null,
          seoDescription: String(values.get('seoDescription') ?? '').trim() || null,
          wifiSsid: String(values.get('wifiSsid') ?? '').trim() || null,
          wifiPassword: String(values.get('wifiPassword') ?? '') || null,
          wifiSecurity: String(values.get('wifiSecurity') ?? 'WPA2')
        })
      });
      this.settings.set({ ...this.settings(), ...result });
      this.notice.set('Storefront settings saved. Your public page uses the updated address and metadata.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save storefront settings.');
    } finally { this.saving.set(false); }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const stores = await this.api.request<any[]>('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores');
      const store = (Array.isArray(stores) ? stores : []).find((item: any) => item.id === this.storeId());
      if (!store) throw new Error('The selected store could not be found.');
      this.settings.set(store);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load storefront settings.');
    } finally { this.loading.set(false); }
  }
}
