/** Transport-safe shared contracts. Keep vendor SDK types out of this package. */
export type CurrencyCode = 'MAD' | 'EUR' | 'USD' | (string & {});
export type LocaleCode = 'en' | 'fr' | 'ar' | (string & {});
export type ResourceStatus = 'draft' | 'active' | 'archived';
export interface Money { /** Integer minor units; 25000 represents MAD 250.00. */ amountMinor: number; currency: CurrencyCode; }
export interface OrganizationRef { organizationId: string; }
export interface ProductImage { id: string; /** Object-storage key, never base64 image data. */ storageKey: string; alt: string; width?: number; height?: number; position: number; }
export interface ProductVariant { id: string; sku?: string; title: string; options: Record<string, string>; price: Money; status: ResourceStatus; }
export interface Product extends OrganizationRef { id: string; slug: string; name: string; description?: string; status: ResourceStatus; kind: 'physical' | 'digital' | 'service' | 'food'; images: ProductImage[]; variants: ProductVariant[]; createdAt: string; updatedAt: string; }
export interface Store extends OrganizationRef { id: string; name: string; slug: string; businessType: 'retail' | 'restaurant' | 'freelancer' | 'services' | 'digital' | 'general'; defaultCurrency: CurrencyCode; locale: LocaleCode; timeZone: string; status: 'setup' | 'active' | 'paused'; }
export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'processing' | 'ready' | 'fulfilled' | 'cancelled' | 'refunded';
export interface OrderLine { productId: string; variantId?: string; nameSnapshot: string; quantity: number; unitPrice: Money; lineTotal: Money; }
export interface Order extends OrganizationRef { id: string; storeId: string; number: string; status: OrderStatus; channel: 'online' | 'pos' | 'mageus' | 'qr' | 'api'; currency: CurrencyCode; subtotal: Money; taxTotal: Money; discountTotal: Money; grandTotal: Money; lines: OrderLine[]; createdAt: string; }
export interface PageResult<T> { items: T[]; nextCursor?: string; }
export interface ApiError { code: string; message: string; requestId?: string; details?: unknown; }
export interface ApiResponse<T> { data: T; requestId: string; }
