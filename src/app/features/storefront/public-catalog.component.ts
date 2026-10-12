import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ApiClientService } from '../../core/api/api-client.service';

@Component({
  selector: 'dlr-public-catalog',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './public-catalog.component.html',
  styleUrl: './public-catalog.component.css'
})
export class PublicCatalogComponent {
  protected readonly store = signal<any | null>(null);
  protected readonly products = signal<any[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selectedProductSlug = signal('');
  protected readonly selectedCategorySlug = signal('');

  constructor(route: ActivatedRoute, private readonly api: ApiClientService, private readonly title: Title, private readonly meta: Meta) {
    const handle = route.snapshot.paramMap.get('storeHandle') ?? '';
    const location = route.snapshot.paramMap.get('locationSlug') ?? '';
    this.selectedProductSlug.set(route.snapshot.paramMap.get('productSlug') ?? '');
    this.selectedCategorySlug.set(route.snapshot.paramMap.get('categorySlug') ?? '');
    void this.load(handle, location);
  }

  protected initialLetter(product: any): string { return String(product?.name ?? 'P').slice(0, 1).toUpperCase(); }

  protected locationLabel(): string { return String(this.store()?.locationSlug ?? '').replace(/-/g, ' '); }

  protected storePath(suffix = ''): string {
    const store = this.store();
    return '/' + encodeURIComponent(String(store?.publicHandle ?? '')) + '/' + encodeURIComponent(String(store?.locationSlug ?? '')) + suffix;
  }

  protected categories(): { id: string; name: string; products: any[] }[] {
    const groups = new Map<string, { id: string; name: string; products: any[] }>();
    for (const product of this.products()) {
      const categories = Array.isArray(product.categories) && product.categories.length ? product.categories : [{ id: 'uncategorized', name: 'Other products' }];
      for (const category of categories) {
        const key = String(category.id);
        const group = groups.get(key) ?? { id: key, name: String(category.name), slug: String(category.slug ?? 'other-products'), products: [] };
        group.products.push(product);
        groups.set(key, group);
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  protected visibleCategories(): { id: string; name: string; slug: string; products: any[] }[] {
    const categories = this.categories();
    const slug = this.selectedCategorySlug();
    return slug ? categories.filter(category => category.slug === slug) : categories;
  }

  protected selectedProduct(): any | null {
    const slug = this.selectedProductSlug();
    return slug ? this.products().find(product => product.slug === slug) ?? null : null;
  }

  protected categoryTitle(): string {
    return this.categories().find(category => category.slug === this.selectedCategorySlug())?.name ?? 'Category';
  }

  protected money(minor: number, currency: string): string {
    try { return new Intl.NumberFormat(String(this.store()?.locale ?? 'en'), { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(minor) / 100); }
    catch { return (Number(minor) / 100).toFixed(2) + ' ' + currency; }
  }

  protected startingPrice(product: any): { amount: number; currency: string } | null {
    const variant = (product.variants ?? []).find((item: any) => Number.isFinite(Number(item.amountMinor)));
    return variant ? { amount: Number(variant.amountMinor), currency: String(variant.currency ?? this.store()?.defaultCurrency ?? 'MAD') } : null;
  }

  private async load(handle: string, location: string): Promise<void> {
    if (!handle || !location) {
      this.error.set('This store address is incomplete.');
      this.loading.set(false);
      return;
    }
    const base = '/api/v1/public/storefronts/' + encodeURIComponent(handle) + '/' + encodeURIComponent(location);
    try {
      const [store, products] = await Promise.all([
        this.api.request(base),
        this.api.request<any[]>(base + '/catalog')
      ]);
      this.store.set(store);
      this.products.set(Array.isArray(products) ? products.map((product: any) => ({ ...product, imageUrl: Array.isArray(product.media) && product.media[0]?.contentUrl ? this.api.url(String(product.media[0].contentUrl)) : null, imageAlt: Array.isArray(product.media) && product.media[0]?.altText ? String(product.media[0].altText) : String(product.name ?? 'Product') })) : []);
      const name = String(store?.name ?? 'Store');
      const title = String(store?.seoTitle ?? ('Products from ' + name + ' | Dollareus')).slice(0, 180);
      const productSlug = this.selectedProductSlug();
      const product = productSlug ? (Array.isArray(products) ? products.find((item: any) => item.slug === productSlug) : null) : null;
      const categorySlug = this.selectedCategorySlug();
      const category = categorySlug ? (Array.isArray(products) ? products.flatMap((item: any) => item.categories ?? []).find((item: any) => item.slug === categorySlug) : null) : null;
      const pageTitle = product ? String(product.name) + ' | ' + name : category ? String(category.name) + ' | ' + name : title;
      this.title.setTitle(pageTitle);
      this.meta.updateTag({ name: 'description', content: String(product?.description ?? (category ? 'Browse ' + category.name + ' from ' + name + '.' : store?.seoDescription ?? ('Browse products and prices from ' + name + '.'))).slice(0, 320) });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ name: 'robots', content: 'index,follow' });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The product catalog could not be loaded.');
      this.title.setTitle('Catalog unavailable | Dollareus');
      this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
    } finally { this.loading.set(false); }
  }
}
