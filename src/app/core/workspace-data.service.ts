import { Injectable } from '@angular/core';
import { ApiClientService } from './api/api-client.service';
import {
  CategoryRow,
  InventoryRow,
  MenuItemRow,
  MenuModifierGroup,
  MenuRow,
  OrderRow,
  ProductRow,
  ProductStatus
} from '../shared/models/commerce.models';

interface OrganizationRecord { id: string; }
interface StoreRecord { id: string; name?: string | null; slug?: string | null; defaultCurrency?: string | null; }
interface ProductVariantRecord { id?: string; sku?: string | null; title?: string | null; amountMinor?: number | string | null; currency?: string | null; }
interface ProductRecord {
 id: string; storeId?: string; name?: string | null; slug?: string | null; description?: string | null; status?: string | null; kind?: 'physical' | 'digital' | 'service' | 'food' | null;
 categoryIds?: string[]; variants?: ProductVariantRecord[]; media?: Array<{ contentUrl?: string | null }>;
}
interface OrderRecord { id: string; orderNumber?: string | number; customerEmail?: string | null; channel?: string | null; totalMinor?: number | string | null; currency?: string | null; status?: string | null; effectivePaymentStatus?: string | null; paymentStatus?: string | null; }
interface MenuItemRecord {
 id: string; menuId?: string | null; slug?: string | null; name?: string | null; description?: string | null;
 priceAmountMinor?: number | string | null; currency?: string | null; status?: string | null; availability?: string | null;
 position?: number | string | null; categoryId?: string | null; allergens?: string[]; dietaryLabels?: string[]; metadata?: Record<string, unknown> | null; imageUrl?: string | null;
}

export interface WorkspaceSnapshot {
  stage: 'organization' | 'store' | 'ready';
  organizationId: string;
  storeId: string;
  storeCurrency: string;
  storeName: string;
  storeSlug: string;
  products: ProductRow[];
  orders: OrderRow[];
  categories: CategoryRow[];
  inventory: InventoryRow[];
  menus: MenuRow[];
  menuItems: MenuItemRow[];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceDataService {
  constructor(private readonly apiClient: ApiClientService) {}

  async load(): Promise<WorkspaceSnapshot> {
    const organizations = await this.apiClient.request<OrganizationRecord[]>('/api/v1/organizations');
    const organization = Array.isArray(organizations) ? organizations[0] : null;
    if (!organization) return this.emptySnapshot('organization');

    const organizationId = String(organization.id);
    const stores = await this.apiClient.request<StoreRecord[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stores`);
    const store = Array.isArray(stores) ? stores[0] : null;
    if (!store) {
      return { ...this.emptySnapshot('store'), organizationId };
    }

    const storeId = String(store.id);
    const storeCurrency = String(store.defaultCurrency ?? 'MAD');
    const [productRows, orderRows, inventoryRows, menuRows, categoryRows] = await Promise.all([
      this.apiClient.request<ProductRecord[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/products`),
      this.apiClient.request<OrderRecord[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/orders?storeId=${encodeURIComponent(storeId)}`),
      this.apiClient.request<InventoryRow[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/inventory`),
      this.apiClient.request<MenuRow[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stores/${encodeURIComponent(storeId)}/menus`),
      this.apiClient.request<CategoryRow[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stores/${encodeURIComponent(storeId)}/categories`)
    ]);

    const products = (Array.isArray(productRows) ? productRows : [])
      .filter((product: ProductRecord) => product.storeId === storeId)
      .map((product: ProductRecord): ProductRow => {
        const variant = Array.isArray(product.variants) ? product.variants[0] : null;
        const status: ProductStatus = product.status === 'active' ? 'Active' : product.status === 'archived' ? 'Archived' : 'Draft';
        const name = String(product.name ?? 'Untitled product');
        return {
          id: String(product.id),
          name,
          slug: String(product.slug ?? ''),
          description: typeof product.description === 'string' ? product.description : null,
          category: 'Uncategorized',
          categoryIds: Array.isArray(product.categoryIds) ? product.categoryIds.map(String) : [],
          sku: variant?.sku ? String(variant.sku) : '—',
          variantId: String(variant?.id ?? ''),
          priceMinor: Number(variant?.amountMinor ?? 0),
          currency: String(variant?.currency ?? storeCurrency),
          stock: null,
          kind: product.kind === 'physical' || product.kind === 'digital' || product.kind === 'service' || product.kind === 'food' ? product.kind : 'physical',
          variants: (Array.isArray(product.variants) ? product.variants : []).map((candidate: ProductVariantRecord) => ({
            id: String(candidate.id ?? ''),
            title: String(candidate.title ?? 'Default'),
            sku: String(candidate.sku ?? ''),
            priceMinor: Number(candidate.amountMinor ?? 0),
            currency: String(candidate.currency ?? storeCurrency),
            stock: null
          })),
          status,
          initials: name.split(/\\s+/).slice(0, 2).map((part: string) => part[0] ?? '').join('').toUpperCase(),
          tone: 'sage',
          imageUrl: Array.isArray(product.media) && product.media[0]?.contentUrl
            ? this.apiClient.url(String(product.media[0].contentUrl)) + '?width=300'
            : null
        };
      });

    const orders = (Array.isArray(orderRows) ? orderRows : []).map((order: OrderRecord): OrderRow => ({
      id: '#' + String(order.orderNumber),
      resourceId: String(order.id),
      customer: String(order.customerEmail ?? 'Guest checkout'),
      channel: String(order.channel ?? 'Mageus'),
      totalMinor: Number(order.totalMinor ?? 0),
      currency: String(order.currency ?? storeCurrency),
      status: String(order.status ?? 'pending') as OrderRow['status'],
      paymentStatus: String(order.effectivePaymentStatus ?? order.paymentStatus ?? 'unpaid')
    }));
    const inventory = Array.isArray(inventoryRows) ? inventoryRows as InventoryRow[] : [];
    const categories = Array.isArray(categoryRows) ? categoryRows as CategoryRow[] : [];
    const menus = Array.isArray(menuRows) ? menuRows as MenuRow[] : [];
    const itemGroups = await Promise.all(menus.map(menu =>
      this.apiClient.request<MenuItemRecord[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/menus/${encodeURIComponent(menu.id)}/items`)
    ));
    const menuItems = itemGroups.flatMap((group, index) =>
      (Array.isArray(group) ? group : []).map((item: MenuItemRecord): MenuItemRow => ({
        id: String(item.id),
        menuId: String(item.menuId ?? menus[index].id),
        slug: String(item.slug ?? ''),
        name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null,
        priceAmountMinor: Number(item.priceAmountMinor ?? 0),
        currency: String(item.currency ?? storeCurrency),
        status: String(item.status ?? 'draft') as MenuItemRow['status'],
        availability: String(item.availability ?? 'available') as MenuItemRow['availability'],
        position: Number(item.position ?? 0),
        categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
        allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
        dietaryLabels: Array.isArray(item.dietaryLabels) ? item.dietaryLabels.map(String) : [],
        modifierGroups: Array.isArray(item.metadata?.['modifierGroups']) ? item.metadata?.['modifierGroups'] as MenuModifierGroup[] : [],
        metadata: item.metadata ?? {},
        imageUrl: item.imageUrl ? this.apiClient.url(String(item.imageUrl)) : null
      }))
    );

    const productsWithStock = products.map(product => {
      const stockForVariant = (variantId: string): number | null => {
        const levels = inventory.filter(item => item.variantId === variantId && item.quantityOnHand !== null);
        return levels.length ? levels.reduce((sum, item) => sum + Number(item.quantityOnHand ?? 0), 0) : null;
      };
      const variants = (product.variants ?? []).map(variant => ({ ...variant, stock: stockForVariant(variant.id) }));
      const firstVariantStock = stockForVariant(product.variantId);
      return {
        ...product,
        stock: firstVariantStock,
        variants: variants.length ? variants : [{
          id: product.variantId, title: 'Default', sku: product.sku,
          priceMinor: product.priceMinor, currency: product.currency, stock: firstVariantStock
        }]
      };
    });

    return {
      stage: 'ready',
      organizationId,
      storeId,
      storeCurrency,
      storeName: String(store.name ?? ''),
      storeSlug: String(store.slug ?? ''),
      products: productsWithStock,
      orders,
      categories,
      inventory,
      menus,
      menuItems
    };
  }

  private emptySnapshot(stage: 'organization' | 'store'): WorkspaceSnapshot {
    return {
      stage,
      organizationId: '',
      storeId: '',
      storeCurrency: 'MAD',
      storeName: '',
      storeSlug: '',
      products: [],
      orders: [],
      categories: [],
      inventory: [],
      menus: [],
      menuItems: []
    };
  }
}
