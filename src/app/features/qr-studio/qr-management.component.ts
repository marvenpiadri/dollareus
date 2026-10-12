import { Component, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import { EntryPointRow } from '../../shared/models/commerce.models';

type StoreExperience = 'commerce' | 'menu' | 'catalog' | 'services';
type QrTargetPath = '/' | '/menu' | '/catalog' | '/services';
type QrFrame = 'none' | 'bottom-label' | 'top-label';

@Component({
  selector: 'dlr-qr-management',
  standalone: true,
  templateUrl: './qr-management.component.html',
  styleUrl: './qr-management.component.css'
})
export class QrManagementComponent {
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  readonly storeName = input('');
  readonly storeSlug = input('');
  readonly notifyRequested = output<string>();

  protected readonly storePublished = signal(false);
  protected readonly storeExperience = signal<StoreExperience>('commerce');
  protected readonly storeEnabledExperiences = signal<string[]>(['commerce']);
  protected readonly qrBusy = signal(false);
  protected readonly qrError = signal('');
  protected readonly qrBrandName = signal('');
  protected readonly qrTargetPath = signal<QrTargetPath>('/menu');
  protected readonly qrForeground = signal('#123456');
  protected readonly qrBackground = signal('#ffffff');
  protected readonly qrAccent = signal('#238636');
  protected readonly qrFrame = signal<QrFrame>('bottom-label');
  protected readonly qrLabel = signal('Scan to view menu');
  protected readonly qrLogoUrl = signal('');
  protected readonly entryPoints = signal<EntryPointRow[]>([]);
  protected readonly selectedQrId = signal('');
  private loadSequence = 0;

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      if (organizationId && storeId) void this.load();
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organizationId();
    const storeId = this.storeId();
    if (!organizationId || !storeId) return;
    const sequence = ++this.loadSequence;
    this.qrBusy.set(true);
    this.qrError.set('');
    try {
      const [stores, points] = await Promise.all([
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/entry-points')
      ]);
      const store = Array.isArray(stores) ? stores.find((candidate: any) => String(candidate.id) === storeId) : null;
      if (store) {
        this.storePublished.set(Boolean(store.published));
        this.storeExperience.set(store.defaultExperience === 'menu' || store.defaultExperience === 'catalog' || store.defaultExperience === 'services' ? store.defaultExperience : 'commerce');
        this.storeEnabledExperiences.set(Array.isArray(store.enabledExperiences) && store.enabledExperiences.length ? store.enabledExperiences : ['commerce']);
      }
      const saved = Array.isArray(points) ? points as EntryPointRow[] : [];
      const enriched = await Promise.all(saved.map(async point => {
        try {
          const publicPoint = await this.apiClient.request('/api/v1/public/entry-points/' + encodeURIComponent(point.id));
          const targetUrlPath = String(publicPoint?.targetUrlPath ?? ('/' + encodeURIComponent(String(store?.publicHandle ?? this.storeSlug())) + '/' + encodeURIComponent(String(store?.locationSlug ?? store?.slug ?? '')) + (point.targetPath === '/' ? '' : point.targetPath)));
          const targetUrl = typeof publicPoint?.targetUrl === 'string' ? publicPoint.targetUrl : typeof window !== 'undefined' ? window.location.origin + targetUrlPath : null;
          return { ...point, targetUrl, targetUrlPath };
        } catch {
          const handle = String(store?.publicHandle ?? this.storeSlug());
          const locationSlug = String(store?.locationSlug ?? store?.slug ?? '');
          const targetUrlPath = '/' + encodeURIComponent(handle) + '/' + encodeURIComponent(locationSlug) + (point.targetPath === '/' ? '' : point.targetPath);
          const targetUrl = typeof window !== 'undefined' ? window.location.origin + targetUrlPath : null;
          return { ...point, targetUrl, targetUrlPath };
        }
      }));
      if (sequence !== this.loadSequence) return;
      this.entryPoints.set(enriched);
      if (!enriched.some(point => point.id === this.selectedQrId())) this.selectedQrId.set('');
    } catch (error) {
      if (sequence === this.loadSequence) this.qrError.set(error instanceof Error ? error.message : 'Could not load QR entry points.');
    } finally {
      if (sequence === this.loadSequence) this.qrBusy.set(false);
    }
  }

  protected async toggleStorefrontPublishing(): Promise<void> {
    const organizationId = this.organizationId(), storeId = this.storeId();
    this.qrBusy.set(true); this.qrError.set('');
    try {
      const enabled = Array.from(new Set([...this.storeEnabledExperiences(), this.storeExperience()]));
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/storefront', {
        method: 'PATCH',
        body: JSON.stringify({ published: !this.storePublished(), defaultExperience: this.storeExperience(), enabledExperiences: enabled })
      });
      await this.load();
      this.notifyRequested.emit(this.storePublished() ? 'Storefront published. Public menu and active QR entry points can now resolve.' : 'Storefront unpublished; public access is disabled.');
    } catch (error) {
      this.qrError.set(error instanceof Error ? error.message : 'Could not update storefront publishing.');
    } finally {
      this.qrBusy.set(false);
    }
  }

  protected async createQrEntryPoint(event: Event): Promise<void> {
    event.preventDefault();
    this.qrBusy.set(true); this.qrError.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points', {
        method: 'POST',
        body: JSON.stringify({
          storeId: this.storeId(), type: 'qr', targetPath: this.qrTargetPath(),
          branding: {
            brandName: this.qrBrandName().trim() || this.storeName(),
            foregroundColor: this.qrForeground(), backgroundColor: this.qrBackground(), accentColor: this.qrAccent(),
            logoUrl: this.qrLogoUrl().trim() || null, frame: this.qrFrame(), label: this.qrLabel().trim() || null
          }
        })
      });
      await this.load();
      if (result?.id) this.selectedQrId.set(String(result.id));
      this.notifyRequested.emit('Branded QR entry point saved.');
    } catch (error) {
      this.qrError.set(error instanceof Error ? error.message : 'Could not save this QR entry point.');
    } finally {
      this.qrBusy.set(false);
    }
  }

  protected qrGeneratorUrl(point: EntryPointRow): string {
    const params = new URLSearchParams({
      content: point.targetUrl ?? '',
      dark: point.branding?.foregroundColor ?? '#123456',
      light: point.branding?.backgroundColor ?? '#ffffff',
      accent: point.branding?.accentColor ?? '#238636',
      brand: point.branding?.brandName ?? this.storeName(),
      frame: point.branding?.frame ?? 'bottom-label',
      label: point.branding?.label ?? 'Scan to view menu',
      logo: point.branding?.logoUrl ?? ''
    });
    return '/qr?' + params.toString();
  }

  protected editQrEntryPoint(point: EntryPointRow): void {
    this.selectedQrId.set(point.id);
    this.qrTargetPath.set(point.targetPath as QrTargetPath);
    this.qrBrandName.set(point.branding?.brandName ?? this.storeName());
    this.qrForeground.set(point.branding?.foregroundColor ?? '#123456');
    this.qrBackground.set(point.branding?.backgroundColor ?? '#ffffff');
    this.qrAccent.set(point.branding?.accentColor ?? '#238636');
    this.qrLogoUrl.set(point.branding?.logoUrl ?? '');
    this.qrFrame.set((point.branding?.frame ?? 'none') as QrFrame);
    this.qrLabel.set(point.branding?.label ?? '');
    this.qrError.set('');
  }

  protected async saveQrBranding(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.selectedQrId();
    if (!id) return;
    this.qrBusy.set(true); this.qrError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ branding: {
          brandName: this.qrBrandName().trim() || null,
          foregroundColor: this.qrForeground(), backgroundColor: this.qrBackground(), accentColor: this.qrAccent(),
          logoUrl: this.qrLogoUrl().trim() || null, frame: this.qrFrame(), label: this.qrLabel().trim() || null
        } })
      });
      await this.load();
      this.notifyRequested.emit('QR branding updated.');
    } catch (error) {
      this.qrError.set(error instanceof Error ? error.message : 'Could not update QR branding.');
    } finally {
      this.qrBusy.set(false);
    }
  }

  protected async toggleQrEntryPoint(point: EntryPointRow): Promise<void> {
    this.qrBusy.set(true); this.qrError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points/' + encodeURIComponent(point.id), {
        method: 'PATCH', body: JSON.stringify({ status: point.status === 'active' ? 'disabled' : 'active' })
      });
      await this.load();
      this.notifyRequested.emit(point.status === 'active' ? 'QR entry point disabled.' : 'QR entry point enabled.');
    } catch (error) {
      this.qrError.set(error instanceof Error ? error.message : 'Could not change QR entry point status.');
    } finally {
      this.qrBusy.set(false);
    }
  }
}
