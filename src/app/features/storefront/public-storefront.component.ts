import { Component, Inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ApiClientService } from '../../core/api/api-client.service';

@Component({
  selector: 'dlr-public-storefront',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './public-storefront.component.html',
  styleUrl: './public-storefront.component.css'
})
export class PublicStorefrontComponent {
  protected readonly store = signal<any | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor(route: ActivatedRoute, private readonly api: ApiClientService, private readonly title: Title, private readonly meta: Meta, @Inject(DOCUMENT) private readonly document: Document) {
    const handle = route.snapshot.paramMap.get('storeHandle') ?? '';
    const location = route.snapshot.paramMap.get('locationSlug') ?? '';
    void this.load(handle, location);
  }

  protected initialLetter(): string { return String(this.store()?.name ?? 'S').slice(0, 1).toUpperCase(); }

  protected locationLabel(): string { return String(this.store()?.locationName || this.store()?.city || this.store()?.locationSlug || '').replace(/-/g, ' '); }

  protected storePath(suffix = ''): string {
    const store = this.store();
    return '/' + encodeURIComponent(String(store?.publicHandle ?? '')) + '/' + encodeURIComponent(String(store?.locationSlug ?? '')) + suffix;
  }

  protected experienceLabel(experience: string): string {
    return ({ menu: 'See menu', catalog: 'Browse products', commerce: 'Shop products', services: 'Explore services' } as Record<string, string>)[experience] ?? 'Explore';
  }

  protected primaryLink(): string {
    const store = this.store();
    if (!store) return '/';
    const experience = String(store.defaultExperience ?? 'catalog');
    return this.storePath(experience === 'menu' ? '/menu' : experience === 'services' ? '#contact' : '/products');
  }

  protected primaryLabel(): string {
    return this.experienceLabel(String(this.store()?.defaultExperience ?? 'catalog'));
  }

  protected availableExperiences(): string[] {
    const enabled = this.store()?.enabledExperiences ?? [];
    const normalized = enabled.filter((value: string) => ['menu', 'services'].includes(value));
    if (enabled.includes('catalog') || enabled.includes('commerce')) normalized.unshift('catalog');
    return normalized;
  }

  private updateStructuredData(store: any, handle: string, location: string): void {
    const type = store?.businessType === 'restaurant' ? 'Restaurant'
      : store?.businessType === 'cafe' ? 'CafeOrCoffeeShop'
      : store?.businessType === 'freelancer' || store?.businessType === 'services' ? 'ProfessionalService'
      : 'Store';
    const address: Record<string, unknown> = { '@type': 'PostalAddress' };
    if (store?.addressLine) address['streetAddress'] = store.addressLine;
    if (store?.city) address['addressLocality'] = store.city;
    if (store?.countryCode) address['addressCountry'] = store.countryCode;
    const hasAddress = Object.keys(address).length > 1;
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': type,
      '@id': '/' + handle + '/' + location + '#business',
      name: String(store?.name ?? ''),
      description: String(store?.seoDescription ?? store?.description ?? ''),
      ...(hasAddress ? { address } : {}),
      ...(store?.phone ? { telephone: String(store.phone) } : {}),
      ...(store?.websiteUrl ? { url: String(store.websiteUrl) } : {}),
      ...(store?.googleMapsUrl ? { hasMap: String(store.googleMapsUrl) } : {})
    };
    if (store?.defaultExperience === 'menu') data['hasMenu'] = '/' + handle + '/' + location + '/menu';
    const existing = this.document.getElementById('dollareus-store-jsonld');
    existing?.parentNode?.removeChild(existing);
    const script = this.document.createElement('script');
    script.id = 'dollareus-store-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }

  private async load(handle: string, location: string): Promise<void> {
    if (!handle || !location) {
      this.error.set('This store address is incomplete.');
      this.loading.set(false);
      return;
    }
    try {
      const store = await this.api.request('/api/v1/public/storefronts/' + encodeURIComponent(handle) + '/' + encodeURIComponent(location));
      this.store.set(store);
      this.updateStructuredData(store, handle, location);
      const name = String(store?.name ?? 'Store');
      const locationName = String(store?.locationSlug ?? location).replace(/-/g, ' ');
      const title = String(store?.seoTitle ?? (name + ' in ' + locationName + ' | Dollareus')).slice(0, 180);
      const description = String(store?.seoDescription ?? store?.description ?? ('Discover ' + name + ', opening information, products and services.')).slice(0, 320);
      this.title.setTitle(title);
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ name: 'robots', content: 'index,follow' });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'This store could not be found.');
      this.title.setTitle('Store unavailable | Dollareus');
      this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
    } finally {
      this.loading.set(false);
    }
  }
}
