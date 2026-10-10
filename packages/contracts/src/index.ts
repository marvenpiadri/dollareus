/** Transport-safe shared contracts. Keep vendor SDK types out of this package. */
export type CurrencyCode = 'MAD' | 'EUR' | 'USD' | (string & {});
export type LocaleCode = 'en' | 'fr' | 'ar' | (string & {});
export type ResourceStatus = 'draft' | 'active' | 'archived';
export type BusinessType = 'retail' | 'restaurant' | 'freelancer' | 'services' | 'digital' | 'general';
export type StoreExperience = 'commerce' | 'menu' | 'catalog' | 'services';
export type ChannelType = 'dollareus' | 'mageus' | 'external';
export type EntryPointType = 'direct-link' | 'qr' | 'embed';
export interface Money { /** Integer minor units; 25000 represents MAD 250.00. */ amountMinor: number; currency: CurrencyCode; }
export interface OrganizationRef { organizationId: string; }
export interface ProductImage { id: string; /** Object-storage key, never base64 image data. */ storageKey: string; alt: string; width?: number; height?: number; position: number; }
export interface ProductVariant { id: string; sku?: string; title: string; options: Record<string, string>; price: Money; status: ResourceStatus; }
export interface ProductAvailability { status: 'available' | 'unavailable' | 'limited' | 'preorder'; /** Optional customer-facing explanation, e.g. "Available after 18:00". */ note?: string; }
export interface Product extends OrganizationRef {
  id: string;
  /** Optional until the product is assigned to a specific store. */
  storeId?: string;
  slug: string;
  name: string;
  description?: string;
  status: ResourceStatus;
  /** Describes what is offered, not which application or page renders it. */
  kind: 'physical' | 'digital' | 'service' | 'food';
  categoryIds?: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  availability?: ProductAvailability;
  /** Optional item-specific details; use namespaced keys for module-specific fields. */
  attributes?: Record<string, string | number | boolean | string[]>;
  createdAt: string;
  updatedAt: string;
}
export interface CatalogCategory extends OrganizationRef {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  position: number;
  status: ResourceStatus;
}
export interface Store extends OrganizationRef {
  id: string;
  name: string;
  description?: string;
  slug: string;
  hostedUrl?: string;
  businessType: BusinessType;
  defaultCurrency: CurrencyCode;
  locale: LocaleCode;
  timeZone: string;
  status: 'setup' | 'active' | 'paused';
}
export type StoreDomainKind = 'platform_subdomain' | 'custom';
export type StoreDomainStatus = 'pending' | 'verification_required' | 'verified' | 'active' | 'disabled' | 'failed';
export interface StoreDomain {
  id: string;
  organizationId: string;
  storeId: string;
  hostname: string;
  kind: StoreDomainKind;
  status: StoreDomainStatus;
  isPrimary: boolean;
  verifiedAt?: string;
  createdAt: string;
}
export interface StoreDomainDnsInstructions {
  hostname: string;
  status: 'pending';
  dns: Array<{ type: 'TXT' | 'CNAME'; name: string; value: string }>;
}
export interface StorefrontConfiguration {
  storeId: string;
  /** A rendering choice over the same store/catalog, not a separate store type. */
  defaultExperience: StoreExperience;
  enabledExperiences: StoreExperience[];
  published: boolean;
  updatedAt: string;
}
export interface ConnectedChannel {
  id: string;
  storeId: string;
  type: ChannelType;
  /** External identity only; never use this to create a second catalog. */
  externalAccountId?: string;
  status: 'pending' | 'connected' | 'revoked';
  scopes: string[];
  connectedAt?: string;
}
export interface PublicEntryPoint {
  id: string;
  storeId: string;
  type: EntryPointType;
  /** Stable path within the canonical public store, e.g. /menu or /products. */
  targetPath: string;
  status: 'active' | 'disabled';
  createdAt: string;
}
export interface PublicImage { id: string; alt: string; width?: number; height?: number; position: number; /** Safe, delivery-ready URL when available; never expose private storage keys. */ url?: string; }
export interface PublicCatalogItem extends Omit<Product, 'images' | 'organizationId' | 'storeId' | 'createdAt'> {
  images: PublicImage[];
}
export interface PublicStorefront {
  store: Pick<Store, 'id' | 'name' | 'slug' | 'businessType' | 'defaultCurrency' | 'locale' | 'timeZone'>;
  experience: StoreExperience;
  description?: string;
  logo?: PublicImage;
  coverImage?: PublicImage;
  categories: CatalogCategory[];
  items: PublicCatalogItem[];
  canonicalUrl: string;
  updatedAt: string;
}
export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'processing' | 'ready' | 'fulfilled' | 'cancelled' | 'refunded';
export interface OrderLine { productId: string; variantId?: string; nameSnapshot: string; quantity: number; unitPrice: Money; lineTotal: Money; }
export interface Order extends OrganizationRef { id: string; storeId: string; number: string; status: OrderStatus; channel: 'online' | 'pos' | 'mageus' | 'qr' | 'api'; currency: CurrencyCode; subtotal: Money; taxTotal: Money; discountTotal: Money; grandTotal: Money; lines: OrderLine[]; createdAt: string; }

export type MenuAvailability = 'available' | 'unavailable' | 'limited';
export interface RestaurantMenu extends OrganizationRef {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  description?: string;
  servicePeriods: string[];
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
}
export interface RestaurantMenuItem extends OrganizationRef {
  id: string;
  storeId: string;
  menuId: string;
  slug: string;
  name: string;
  description?: string;
  price: Money;
  status: ResourceStatus;
  categoryId?: string;
  allergens: string[];
  dietaryLabels: string[];
  availability: MenuAvailability;
  position: number;
  createdAt: string;
  updatedAt: string;
}
export type PosTerminalType = 'retail' | 'restaurant' | 'service' | 'general';
export interface PosSession extends OrganizationRef {
  id: string;
  storeId: string;
  label: string;
  terminalType: PosTerminalType;
  locationId?: string;
  status: 'open' | 'closed';
  openedBy: string;
  openedAt: string;
  closedBy?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export type PosFulfillment = 'counter' | 'takeaway' | 'dine_in' | 'delivery' | 'service';
export type PosOrderLine =
  | { sourceType: 'product'; itemId: string; variantId: string; nameSnapshot: string; quantity: number; unitPrice: Money; lineTotal: Money }
  | { sourceType: 'menuItem'; itemId: string; menuId: string; nameSnapshot: string; quantity: number; unitPrice: Money; lineTotal: Money };
export interface PosOrderStatusTransition { from: string; to: string; changedBy: string; changedAt: string; }
export interface PosOrder extends OrganizationRef {
  id: string;
  storeId: string;
  sessionId: string;
  number: string;
  status: 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  channel: 'pos' | 'qr';
  fulfillment: PosFulfillment;
  tableLabel?: string;
  customerNote?: string;
  currency: CurrencyCode;
  subtotal: Money;
  taxTotal: Money;
  discountTotal: Money;
  grandTotal: Money;
  lines: PosOrderLine[];
  statusHistory?: PosOrderStatusTransition[];
  statusUpdatedBy?: string;
  statusUpdatedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageResult<T> { items: T[]; nextCursor?: string; }
export interface ApiError { code: string; message: string; requestId?: string; details?: unknown; }
export interface ApiResponse<T> { data: T; requestId: string; }
