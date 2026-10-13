import { Component, effect, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
  protected readonly uploadingProfilePicture = signal(false);
  protected readonly profilePicturePreview = signal('');
  protected readonly profileUploadError = signal('');
  protected readonly mapSearching = signal(false);
  protected readonly mapError = signal('');
  protected readonly mapResults = signal<any[]>([]);
  protected readonly mapLatitude = signal<number | null>(null);
  protected readonly mapLongitude = signal<number | null>(null);
  protected readonly mapUrl = signal('');
  protected readonly weekdays = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];
  protected readonly locationCreateError = signal('');
  readonly locationCreated = output<string>();
  readonly settingsSaved = output<void>();

  private loadVersion = 0;

  constructor(private readonly api: ApiClientService, private readonly sanitizer: DomSanitizer) {
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
    const locationName = String(values.get('locationName') ?? '').trim();
    const storeName = String(values.get('storeName') ?? '').trim();
    const city = String(values.get('city') ?? '').trim();
    const locationSlug = this.slugify([locationName || storeName, city].filter(Boolean).join(' '));
    const profileImageUrl = this.profilePicturePreview() || String(this.settings()?.theme?.profileImageUrl ?? '').trim();
    const businessHours: Record<string, { open: string; close: string; closed: boolean }> = {};
    for (const day of this.weekdays) {
      const open = String(values.get('hours-' + day.key + '-open') ?? '').trim();
      const close = String(values.get('hours-' + day.key + '-close') ?? '').trim();
      const closed = values.get('hours-' + day.key + '-closed') === 'on';
      if (!closed && (open || close) && (!open || !close || open >= close)) {
        this.error.set('For ' + day.label + ', enter a valid opening time before the closing time, or mark the business closed.');
        return;
      }
      businessHours[day.key] = { open: closed ? '' : open, close: closed ? '' : close, closed };
    }
    if (profileImageUrl && !profileImageUrl.startsWith('/api/v1/public/storefronts/')) {
      try { if (new URL(profileImageUrl).protocol !== 'https:') throw new Error(); }
      catch { this.error.set('Upload a valid business profile picture.'); return; }
    }
    if (values.get('published') === 'on' && !profileImageUrl) {
      this.error.set('Add a business profile picture (logo, storefront photo, or another image) before publishing.');
      return;
    }
    if (!publicHandle) { this.error.set('Your business profile is missing its public identity.'); return; }
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
                    publicHandle,
          locationSlug,
          whatsappNumber: String(values.get('whatsappNumber') ?? '').trim() || null,
          latitude: this.mapLatitude() ?? this.settings()?.latitude ?? null,
          longitude: this.mapLongitude() ?? this.settings()?.longitude ?? null,
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
          theme: { ...(this.settings()?.theme ?? {}), profileImageUrl: profileImageUrl || null, businessHours }
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
    const newLocationName = String(values.get('newLocationName') ?? '').trim();
    const newCity = String(values.get('newCity') ?? '').trim();
    const locationSlug = this.slugify([newLocationName || this.settings()?.name || 'store', newCity].filter(Boolean).join(' '));
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
          timeZone: this.detectedTimeZone(current.timeZone),
          defaultExperience: current.defaultExperience ?? 'catalog',
          enabledExperiences: current.enabledExperiences ?? ['catalog'],
          published: false,
          theme: current.theme ?? {},
          locationName: newLocationName || null,
          city: newCity || null,
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


  protected profileImageSource(): string {
    const image = this.profilePicturePreview() || String(this.settings()?.theme?.profileImageUrl ?? '');
    return image.startsWith('/') ? this.api.url(image) : image;
  }

  protected async uploadProfilePicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { this.profileUploadError.set('Choose a PNG, JPG or WebP image.'); input.value = ''; return; }
    this.uploadingProfilePicture.set(true); this.profileUploadError.set('');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('This image could not be prepared for upload.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('This image could not be prepared for upload.')), 'image/webp', 0.82));
      const headers = new Headers({ 'Content-Type': 'image/webp' });
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('dollareus_token') : null;
      if (token) headers.set('Authorization', 'Bearer ' + token);
      const response = await fetch(this.api.url('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/profile-picture'), { method: 'POST', credentials: 'include', headers, body: blob });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not upload this picture.');
      const result = payload.data;
      this.profilePicturePreview.set(this.api.url(result.profileImageUrl));
      this.settings.update(current => current ? { ...current, theme: { ...(current.theme ?? {}), profileImageUrl: result.profileImageUrl, profileImageStorageKey: result.storageKey } } : current);
    } catch (error) { this.profileUploadError.set(error instanceof Error ? error.message : 'Could not upload this picture.'); }
    finally { this.uploadingProfilePicture.set(false); input.value = ''; }
  }

  protected async findMapLocation(event: Event): Promise<void> {
    const form = (event.currentTarget as HTMLElement).closest('form');
    if (!(form instanceof HTMLFormElement)) return;
    const values = new FormData(form);
    const query = [values.get('addressLine'), values.get('city'), values.get('countryCode')].map(value => String(value ?? '').trim()).filter(Boolean).join(', ');
    if (!query) { this.mapError.set('Add a street address or city first.'); return; }
    this.mapSearching.set(true); this.mapError.set(''); this.mapResults.set([]);
    try {
      const response = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(query), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Map search is temporarily unavailable. You can still save the address.');
      const places = await response.json();
      if (!Array.isArray(places) || !places.length) throw new Error('No matching places found. Try adding a street name or nearby landmark.');
      this.mapResults.set(places);
    } catch (error) { this.mapError.set(error instanceof Error ? error.message : 'Could not find this address on the map.'); }
    finally { this.mapSearching.set(false); }
  }

  protected chooseMapLocation(place: any): void {
    this.mapLatitude.set(Number(place.lat)); this.mapLongitude.set(Number(place.lon));
    this.mapUrl.set('https://www.openstreetmap.org/?mlat=' + encodeURIComponent(place.lat) + '&mlon=' + encodeURIComponent(place.lon) + '#map=17/' + encodeURIComponent(place.lat) + '/' + encodeURIComponent(place.lon));
    this.mapResults.set([]); this.mapError.set('');
  }

  protected mapEmbedUrl(): SafeResourceUrl {
    const lat = this.mapLatitude() ?? Number(this.settings()?.latitude);
    const lon = this.mapLongitude() ?? Number(this.settings()?.longitude);
    const valid = Number.isFinite(lat) && Number.isFinite(lon);
    const url = valid ? 'https://www.openstreetmap.org/export/embed.html?bbox=' + [lon - 0.008, lat - 0.005, lon + 0.008, lat + 0.005].join('%2C') + '&layer=mapnik&marker=' + lat + '%2C' + lon : 'about:blank';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private slugify(value: string): string { return value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'my-business'; }
  private detectedTimeZone(fallback?: string): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback || 'Africa/Casablanca'; } catch { return fallback || 'Africa/Casablanca'; } }

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
      this.mapLatitude.set(store.latitude !== null && store.latitude !== undefined ? Number(store.latitude) : null);
      this.mapLongitude.set(store.longitude !== null && store.longitude !== undefined ? Number(store.longitude) : null);
      this.mapUrl.set(store.googleMapsUrl || (store.latitude != null && store.longitude != null ? 'https://www.openstreetmap.org/?mlat=' + store.latitude + '&mlon=' + store.longitude + '#map=17/' + store.latitude + '/' + store.longitude : ''));
      this.profilePicturePreview.set('');
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load storefront settings.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
}
