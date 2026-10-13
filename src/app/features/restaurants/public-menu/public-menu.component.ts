import { Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ApiClientService } from '../../../core/api/api-client.service';

@Component({
  selector: 'dlr-public-menu',
  standalone: true,
  templateUrl: './public-menu.component.html',
  styleUrl: './public-menu.component.css'
})
export class PublicMenuComponent {
  protected readonly publicMenuStore = signal<any | null>(null);
  protected readonly publicMenus = signal<any[]>([]);
  protected readonly publicMenuLoading = signal(false);
  protected readonly publicMenuError = signal('');
  protected readonly wifiQrDataUrl = signal('');

  constructor(private readonly route: ActivatedRoute, private readonly apiClient: ApiClientService, private readonly title: Title, private readonly meta: Meta) {
    const storeHandle = this.route.snapshot.paramMap.get('storeHandle') ?? '';
    const locationSlug = this.route.snapshot.paramMap.get('locationSlug') ?? '';
    if (!storeHandle || !locationSlug) {
      this.publicMenuError.set('This menu address is incomplete. Open the menu from the business profile or scan its location-specific QR code.');
      return;
    }
    void this.loadPublicMenu({ storeHandle, locationSlug });
  }

  protected publicMenuSections(menu: { items?: any[] }): { name: string; items: any[] }[] {
    const sections = new Map<string, any[]>();
    for (const item of menu.items ?? []) {
      const name = typeof item.categoryName === 'string' && item.categoryName.trim() ? item.categoryName.trim() : 'Other dishes';
      const items = sections.get(name) ?? [];
      items.push(item);
      sections.set(name, items);
    }
    return [...sections.entries()].map(([name, items]) => ({ name, items }));
  }

  protected whatsappMenuUrl(): string {
    const store = this.publicMenuStore();
    const rawNumber = String(store?.whatsappNumber ?? store?.phone ?? '');
    const phone = rawNumber.replace(/\D/g, '');
    if (!phone) return '';
    const storeName = String(store?.name ?? 'this business');
    const message = 'Hello ' + storeName + ', I am viewing your menu and would like to ask a question or place an order.';
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  }

  protected money(minor: number, currency: string): string {
    const locale = String(this.publicMenuStore()?.locale ?? 'en');
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }

  private async generateWifiQr(store: any): Promise<void> {
    const ssid = typeof store?.wifiSsid === 'string' ? store.wifiSsid : '';
    if (!ssid) return;
    const encoder = (globalThis as typeof globalThis & { QRCode?: { toDataURL(text: string, options?: Record<string, unknown>): Promise<string> } }).QRCode;
    if (!encoder) return;
    const escapeWifi = (value: string) => value.replace(/[\\\\;,:"]/g, character => '\\' + character);
    const security = String(store?.wifiSecurity ?? 'WPA2');
    const type = security === 'none' ? 'nopass' : security === 'WEP' ? 'WEP' : 'WPA';
    const password = typeof store?.wifiPassword === 'string' ? store.wifiPassword : '';
    const payload = 'WIFI:T:' + type + ';S:' + escapeWifi(ssid) + ';' + (type === 'nopass' ? '' : 'P:' + escapeWifi(password) + ';') + ';';
    try {
      this.wifiQrDataUrl.set(await encoder.toDataURL(payload, { width: 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#193522', light: '#ffffff' } }));
    } catch {
      this.wifiQrDataUrl.set('');
    }
  }

  private async loadPublicMenu(publicIdentity: { storeHandle: string; locationSlug: string }): Promise<void> {
    this.publicMenuLoading.set(true);
    this.publicMenuError.set('');
    try {
      const publicPath = '/api/v1/public/storefronts/' + encodeURIComponent(publicIdentity.storeHandle) + '/' + encodeURIComponent(publicIdentity.locationSlug);
      const [store, menus] = await Promise.all([
        this.apiClient.request(publicPath),
        this.apiClient.request(publicPath + '/menus')
      ]);
      this.publicMenuStore.set(store);
      const storeName = String(store?.name ?? 'Restaurant');
      const seoTitle = String(store?.seoTitle ?? (storeName + ' Menu and Prices | Dollareus')).slice(0, 180);
      const seoDescription = String(store?.seoDescription ?? store?.description ?? ('Explore the menu and prices at ' + storeName + '.')).slice(0, 320);
      this.title.setTitle(seoTitle);
      this.meta.updateTag({ name: 'description', content: seoDescription });
      this.meta.updateTag({ property: 'og:title', content: seoTitle });
      this.meta.updateTag({ property: 'og:description', content: seoDescription });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ name: 'robots', content: 'index,follow' });
      await this.generateWifiQr(store);
      this.publicMenus.set(Array.isArray(menus) ? menus.map((menu: any) => ({ ...menu, items: (Array.isArray(menu.items) ? menu.items : []).map((item: any) => ({ ...item, imageUrl: item.imageUrl ? this.apiClient.url(String(item.imageUrl)) : null })) })) : []);
    } catch (error) {
      this.publicMenuError.set(error instanceof Error ? error.message : 'Could not load this restaurant menu.');
      this.title.setTitle('Menu unavailable | Dollareus');
      this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
    } finally {
      this.publicMenuLoading.set(false);
    }
  }
}
