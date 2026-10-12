import { Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiClientService } from '../../../core/api/api-client.service';

@Component({
  selector: 'dlr-public-menu',
  standalone: true,
  templateUrl: './public-menu.component.html',
  styleUrl: './public-menu.component.css'
})
export class PublicMenuComponent {
  protected readonly publicMenuStoreSlug = signal('');
  protected readonly publicMenuStore = signal<any | null>(null);
  protected readonly publicMenus = signal<any[]>([]);
  protected readonly publicMenuLoading = signal(false);
  protected readonly publicMenuError = signal('');

  constructor(private readonly route: ActivatedRoute, private readonly apiClient: ApiClientService) {
    const routeSlug = this.route.snapshot.paramMap.get('storeSlug') ?? '';
    const hostnameLabels = typeof window !== 'undefined' ? window.location.hostname.toLowerCase().split('.') : [];
    const hostStoreSlug = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/menu' && hostnameLabels.length >= 3 ? hostnameLabels[0] : '';
    const storeSlug = routeSlug || hostStoreSlug;
    this.publicMenuStoreSlug.set(storeSlug);
    void this.loadPublicMenu(storeSlug);
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

  protected money(minor: number, currency: string): string {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }

  private async loadPublicMenu(storeSlug: string): Promise<void> {
    if (!storeSlug) {
      this.publicMenuError.set('This menu link is missing its restaurant address. Scan the full QR code or open the restaurant-specific menu link.');
      return;
    }
    this.publicMenuLoading.set(true);
    this.publicMenuError.set('');
    try {
      const encodedSlug = encodeURIComponent(storeSlug);
      const [store, menus] = await Promise.all([
        this.apiClient.request('/api/v1/public/stores/' + encodedSlug),
        this.apiClient.request('/api/v1/public/stores/' + encodedSlug + '/menus')
      ]);
      this.publicMenuStore.set(store);
      this.publicMenus.set(Array.isArray(menus) ? menus.map((menu: any) => ({ ...menu, items: (Array.isArray(menu.items) ? menu.items : []).map((item: any) => ({ ...item, imageUrl: item.imageUrl ? this.apiClient.url(String(item.imageUrl)) : null })) })) : []);
    } catch (error) {
      this.publicMenuError.set(error instanceof Error ? error.message : 'Could not load this restaurant menu.');
    } finally {
      this.publicMenuLoading.set(false);
    }
  }
}
