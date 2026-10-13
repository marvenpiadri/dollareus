import { Component, Inject, signal } from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ApiClientService } from '../../core/api/api-client.service';

@Component({
  selector: 'dlr-public-storefront',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './public-storefront.component.html',
  styleUrl: './public-storefront.component.css'
})
export class PublicStorefrontComponent {
  protected readonly store = signal<any | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly reviewSummary = signal<{ averageRating: number; reviewCount: number; ratingDistribution: Record<number, number> }>({ averageRating: 0, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  protected readonly reviews = signal<Array<{ id: string; rating: number; reviewText: string; createdAt: string; publishedAt: string }>>([]);
  protected readonly reviewRating = signal(5);
  protected readonly reviewEmail = signal('');
  protected readonly reviewText = signal('');
  protected readonly reviewBusy = signal(false);
  protected readonly reviewMessage = signal('');
  protected readonly reviewError = signal('');
  protected readonly appointmentService = signal('');
  protected readonly appointmentDate = signal('');
  protected readonly appointmentTime = signal('');
  protected readonly appointmentNote = signal('');
  private readonly initialReviewToken: string;

  constructor(route: ActivatedRoute, private readonly api: ApiClientService, private readonly title: Title, private readonly meta: Meta, @Inject(DOCUMENT) private readonly document: Document) {
    this.initialReviewToken = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('token') ?? '') : '';
    const handle = route.snapshot.paramMap.get('storeHandle') ?? '';
    const location = route.snapshot.paramMap.get('locationSlug') ?? '';
    void this.load(handle, location);
  }

  protected heartString(rating: number): string { return '♥'.repeat(Math.max(0, Math.min(5, rating))); }

  protected roundedRating(): number { return Math.round(this.reviewSummary().averageRating); }

  protected async submitReview(event: Event): Promise<void> {
    event.preventDefault();
    const store = this.store();
    if (!store) return;
    const email = this.reviewEmail().trim().toLowerCase();
    const reviewText = this.reviewText().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.reviewError.set('Enter a valid email address.');
      return;
    }
    if (reviewText.length < 3 || reviewText.length > 5000) {
      this.reviewError.set('Write between 3 and 5,000 characters.');
      return;
    }
    this.reviewBusy.set(true);
    this.reviewError.set('');
    this.reviewMessage.set('');
    try {
      const handle = encodeURIComponent(String(store.publicHandle ?? ''));
      const location = encodeURIComponent(String(store.locationSlug ?? ''));
      const result = await this.api.request<{ status: string; verificationEmailSent: boolean; message: string }>(
        '/api/v1/public/storefronts/' + handle + '/' + location + '/reviews',
        { method: 'POST', body: JSON.stringify({ email, rating: this.reviewRating(), reviewText }) }
      );
      this.reviewMessage.set(result?.message ?? 'Check your email to verify your review.');
      this.reviewText.set('');
    } catch (error) {
      this.reviewError.set(error instanceof Error ? error.message : 'Your review could not be submitted.');
    } finally {
      this.reviewBusy.set(false);
    }
  }

  private async loadReviews(handle: string, location: string): Promise<void> {
    try {
      const result = await this.api.request<{ averageRating: number; reviewCount: number; ratingDistribution: Record<number, number>; reviews: Array<{ id: string; rating: number; reviewText: string; createdAt: string; publishedAt: string }> }>(
        '/api/v1/public/storefronts/' + encodeURIComponent(handle) + '/' + encodeURIComponent(location) + '/reviews'
      );
      this.reviewSummary.set({ averageRating: Number(result?.averageRating ?? 0), reviewCount: Number(result?.reviewCount ?? 0), ratingDistribution: result?.ratingDistribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
      this.reviews.set(result?.reviews ?? []);
    } catch { /* Reviews should never prevent the public store page from rendering. */ }
  }

  private async verifyReviewToken(token: string, handle: string, location: string): Promise<void> {
    try {
      const result = await this.api.request<{ verified: boolean; message: string }>('/api/v1/public/reviews/verify', {
        method: 'POST', body: JSON.stringify({ token })
      });
      this.reviewMessage.set(result?.message ?? 'Your review is verified and published.');
      await this.loadReviews(handle, location);
    } catch (error) {
      this.reviewError.set(error instanceof Error ? error.message : 'This review verification link is invalid or expired.');
    }
  }

  protected appointmentWhatsAppUrl(): string {
    const store = this.store();
    const rawPhone = String(store?.phone ?? '').replace(/[^0-9+]/g, '');
    let phone = rawPhone.replace(/^\+/, '').replace(/^00/, '');
    if (String(store?.countryCode ?? '').toUpperCase() === 'MA' && phone.startsWith('0')) phone = '212' + phone.slice(1);
    if (!/^\d{8,15}$/.test(phone)) return '';
    const lines = [
      'Hello ' + String(store?.name ?? 'there') + ', I would like to request an appointment.',
      this.appointmentService().trim() ? 'Service: ' + this.appointmentService().trim() : '',
      this.appointmentDate() ? 'Preferred date: ' + this.appointmentDate() : '',
      this.appointmentTime() ? 'Preferred time: ' + this.appointmentTime() : '',
      this.appointmentNote().trim() ? 'Additional details: ' + this.appointmentNote().trim() : '',
      store?.locationName || store?.city ? 'Location: ' + String(store?.locationName || store?.city) : ''
    ].filter(Boolean);
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  protected mapEmbedUrl(): string {
    const store = this.store();
    const address = [store?.addressLine, store?.city, store?.countryCode].filter((part) => typeof part === 'string' && part.trim()).join(', ');
    if (!address) return '';
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(address) + '&output=embed';
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
      ...(store?.googleMapsUrl ? { hasMap: String(store.googleMapsUrl) } : {}),
      ...(this.reviewSummary().reviewCount > 0 ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: this.reviewSummary().averageRating,
          reviewCount: this.reviewSummary().reviewCount,
          bestRating: 5,
          worstRating: 1
        }
      } : {})
    };
    if ((store?.enabledExperiences ?? []).includes('menu')) data['hasMenu'] = '/' + handle + '/' + location + '/menu';
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
      await this.loadReviews(handle, location);
      this.updateStructuredData(store, handle, location);
      if (this.initialReviewToken && new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('review') === 'verify') {
        await this.verifyReviewToken(this.initialReviewToken, handle, location);
      }
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
