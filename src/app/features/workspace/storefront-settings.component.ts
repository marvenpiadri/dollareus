import { Component, effect, input, output, signal } from '@angular/core';
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
  protected readonly creatingLocation = signal(false);
  protected readonly locationCreateError = signal('');
  readonly locationCreated = output<string>();
  readonly settingsSaved = output<void>();

  private loadVersion = 0;

  constructor(private readonly api: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      if (organizationId && storeId) void this.load(organizationId, storeId);
    });
  }

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
    const profileImageUrl = String(values.get('profileImageUrl') ?? '').trim();
    if (profileImageUrl) {
      try { if (new URL(profileImageUrl).protocol !== 'https:') throw new Error(); }
      catch { this.error.set('Use a valid HTTPS image URL for the business profile picture.'); return; }
    }
    if (values.get('published') === 'on' && !profileImageUrl && !this.settings()?.theme?.profileImageUrl) {
      this.error.set('Add a business profile picture (logo, storefront photo, or another image) before publishing.');
      return;
    }
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
          name: String(values.get('storeName') ?? '').trim(),
          businessType: String(values.get('businessType') ?? 'general'),
          status: String(values.get('storeStatus') ?? 'active'),
          currency: String(values.get('currency') ?? 'MAD').trim().toUpperCase(),
          locale: String(values.get('locale') ?? 'en'),
          timeZone: String(values.get('timeZone') ?? 'Africa/Casablanca').trim(),
          publicHandle,
          locationSlug,
          published: values.get('published') === 'on',
          defaultExperience,
          enabledExperiences,
          description: String(values.get('storeDescription') ?? '').trim() || null,
          seoTitle: String(values.get('seoTitle') ?? '').trim() || null,
          seoDescription: String(values.get('seoDescription') ?? '').trim() || null,
          wifiSsid: String(values.get('wifiSsid') ?? '').trim() || null,
          wifiPassword: String(values.get('wifiPassword') ?? '') || null,
          wifiSecurity: String(values.get('wifiSecurity') ?? 'WPA2'),
          locationName: String(values.get('locationName') ?? '').trim() || null,
          addressLine: String(values.get('addressLine') ?? '').trim() || null,
          city: String(values.get('city') ?? '').trim() || null,
          countryCode: String(values.get('countryCode') ?? '').trim().toUpperCase() || null,
          phone: String(values.get('phone') ?? '').trim() || null,
          websiteUrl: String(values.get('websiteUrl') ?? '').trim() || null,
          googleMapsUrl: String(values.get('googleMapsUrl') ?? '').trim() || null,
          theme: { ...(this.settings()?.theme ?? {}), profileImageUrl: profileImageUrl || null }
        })
      });
      this.settings.set({ ...(this.settings() ?? {}), ...result });
      this.notice.set('Store and storefront settings saved. Public access follows the selected store status and publish setting.');
      this.settingsSaved.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save storefront settings.');
    } finally { this.saving.set(false); }
  }

  protected async createLocation(event: Event): Promise<void> {
    event.preventDefault();
    const form = (event.currentTarget as HTMLElement).closest('form');
    if (!(form instanceof HTMLFormElement)) return;
    const values = new FormData(form);
    const locationSlug = String(values.get('newLocationSlug') ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(locationSlug)) {
      this.locationCreateError.set('Use lowercase letters, numbers and hyphens for the new location address.');
      return;
    }
    const current = this.settings();
    if (!current) return;
    this.creatingLocation.set(true);
    this.locationCreateError.set('');
    this.notice.set('');
    try {
      const handle = String(values.get('publicHandle') ?? current.publicHandle ?? '').trim().toLowerCase();
      if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(handle)) throw new Error('Save a valid public username before creating another location.');
      const created = await this.api.request<any>('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: String(current.name ?? 'Store'),
          description: current.description ?? null,
          slug: locationSlug,
          publicHandle: handle,
          locationSlug,
          businessType: current.businessType ?? 'general',
          status: 'active',
          currency: current.defaultCurrency ?? 'MAD',
          locale: current.locale ?? 'en',
          timeZone: current.timeZone ?? 'Africa/Casablanca',
          defaultExperience: current.defaultExperience ?? 'catalog',
          enabledExperiences: current.enabledExperiences ?? ['catalog'],
          published: false,
          theme: current.theme ?? {},
          locationName: String(values.get('newLocationName') ?? '').trim() || null,
          city: String(values.get('newCity') ?? '').trim() || null,
          addressLine: String(values.get('newAddressLine') ?? '').trim() || null,
          countryCode: String(values.get('newCountryCode') ?? '').trim().toUpperCase() || null
        })
      });
      if (!created?.id) throw new Error('The location was created but its ID could not be read.');
      this.locationCreated.emit(String(created.id));
      this.notice.set('Location created. It is now selected in your workspace and remains unpublished until you enable it.');
    } catch (error) {
      this.locationCreateError.set(error instanceof Error ? error.message : 'Could not create this location.');
    } finally { this.creatingLocation.set(false); }
  }

  private async load(organizationId: string, storeId: string): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set('');
    try {
      const stores = await this.api.request<any[]>('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores');
      if (version !== this.loadVersion) return;
      const store = (Array.isArray(stores) ? stores : []).find((item: any) => item.id === storeId);
      if (!store) throw new Error('The selected store could not be found.');
      this.settings.set(store);
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load storefront settings.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
}
