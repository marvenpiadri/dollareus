import { DatePipe } from '@angular/common';
import { AuthPanelComponent } from '../auth/auth-panel.component';
import { RestaurantMenuManagerComponent } from '../restaurants/menus/restaurant-menu-manager.component';
import { CustomerManagementComponent } from '../customers/customer-management.component';
import { InventoryManagementComponent } from '../inventory/inventory-management.component';
import { OverviewDashboardComponent } from '../overview/overview-dashboard.component';
import { OrderManagementComponent } from '../orders/order-management.component';
import { ProductCatalogComponent } from '../products/product-catalog.component';
import { PosWorkspaceComponent } from '../pos/pos-workspace.component';
import { QrManagementComponent } from '../qr-studio/qr-management.component';
import { ApiCredentialsComponent } from '../developer-api/api-credentials.component';
import { WorkspaceShellComponent } from '../../layout/workspace-shell/workspace-shell.component';
import { Router } from '@angular/router';
import { ApiClientService } from '../../core/api/api-client.service';
import { SessionService } from '../../core/auth/session.service';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

type NavItem = 'Overview' | 'Orders' | 'POS' | 'Products' | 'Menus' | 'QR Studio' | 'Customers' | 'Inventory' | 'API & channels' | 'Integrations' | 'Settings';
import { ProductStatus, ProductRow, OrderRow, CategoryRow, MenuRow, MenuModifierGroup, MenuItemRow, InventoryRow, FulfillmentStage, ShipmentDetails } from '../../shared/models/commerce.models';


@Component({
  selector: 'dlr-workspace',
  standalone: true,
  imports: [DatePipe, AuthPanelComponent, RestaurantMenuManagerComponent, CustomerManagementComponent, InventoryManagementComponent, OverviewDashboardComponent, OrderManagementComponent, ProductCatalogComponent, PosWorkspaceComponent, QrManagementComponent, ApiCredentialsComponent, WorkspaceShellComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css'
})
export class WorkspaceComponent {
  protected readonly authReady = signal(false);
  protected readonly authenticated = signal(false);
  protected readonly workspaceLoading = signal(true);
  protected readonly workspaceError = signal('');
  protected readonly onboardingError = signal('');
  protected readonly onboardingBusy = signal(false);
  protected readonly storeCurrency = signal('MAD');
  protected readonly onboardingStage = signal<'organization' | 'store' | 'ready'>('organization');
  protected readonly organizationId = signal('');
  protected readonly storeId = signal('');
  protected readonly storeName = signal('');
  protected readonly storeSlug = signal('');

  constructor(private readonly router: Router, private readonly apiClient: ApiClientService, private readonly sessionService: SessionService) { void this.checkSession(); }

  private async checkSession(): Promise<void> {
    try {
      const authenticated = await this.sessionService.isAuthenticated();
      this.authenticated.set(authenticated);
      if (authenticated) await this.loadWorkspace();
    } finally {
      this.authReady.set(true);
    }
  }

  protected onSignedIn(): void {
    void this.router.navigateByUrl('/app');
    this.authenticated.set(true);
    this.authReady.set(true);
    this.workspaceLoading.set(true);
    void this.loadWorkspace();
  }

  protected async signOut(): Promise<void> {
    try {
      await this.sessionService.signOut();
    } finally {
      this.authenticated.set(false);
      void this.router.navigateByUrl('/login');
      this.products.set([]);
      this.organizationId.set('');
      this.storeId.set('');
      this.storeName.set('');
      this.storeSlug.set('');
      this.onboardingStage.set('organization');
    }
  }
  private async loadWorkspace(): Promise<void> {
    this.workspaceLoading.set(true);
    this.workspaceError.set('');
    this.onboardingError.set('');
    try {
      const organizations = await this.apiClient.request('/api/v1/organizations');
      const organization = Array.isArray(organizations) ? organizations[0] : null;
      if (!organization) {
        this.organizationId.set('');
        this.onboardingStage.set('organization');
        this.products.set([]);
        return;
      }
      this.organizationId.set(organization.id);
      const stores = await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(organization.id)}/stores`);
      const store = Array.isArray(stores) ? stores[0] : null;
      if (!store) {
        this.onboardingStage.set('store');
        this.products.set([]);
        return;
      }
      this.storeId.set(store.id);
      this.storeCurrency.set(String(store.defaultCurrency ?? 'MAD'));
      this.storeName.set(store.name);
      this.storeSlug.set(store.slug);
      this.onboardingStage.set('ready');
      const rows = await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(organization.id)}/products`);
      const products = Array.isArray(rows) ? rows : [];
      this.products.set(products.filter((p: any) => p.storeId === store.id).map((p: any): ProductRow => {
        const variant = Array.isArray(p.variants) ? p.variants[0] : null;
        const status: ProductStatus = p.status === 'active' ? 'Active' : p.status === 'archived' ? 'Archived' : 'Draft';
        const name = String(p.name ?? 'Untitled product');
        return {
          id: String(p.id), name, slug: String(p.slug ?? ''), description: typeof p.description === 'string' ? p.description : null, category: 'Uncategorized', categoryIds: Array.isArray(p.categoryIds) ? p.categoryIds.map(String) : [], sku: variant?.sku ? String(variant.sku) : '—', variantId: String(variant?.id ?? ''),
          priceMinor: Number(variant?.amountMinor ?? 0), currency: String(variant?.currency ?? store.defaultCurrency ?? 'MAD'),
          stock: null, status, initials: name.split(/\s+/).slice(0, 2).map((part: string) => part[0] ?? '').join('').toUpperCase(),
          tone: 'sage', imageUrl: Array.isArray(p.media) && p.media[0]?.contentUrl ? this.apiClient.url(String(p.media[0].contentUrl)) + '?width=300' : null
        };
      }));
      const [orderRows, inventoryRows, menuRows, categoryRows] = await Promise.all([
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/orders'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/inventory'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/menus'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/categories')
      ]);
      this.orders.set((Array.isArray(orderRows) ? orderRows : []).map((order: any): OrderRow => ({
        id: '#' + String(order.orderNumber), resourceId: String(order.id), customer: String(order.customerEmail ?? 'Guest checkout'),
        channel: String(order.channel ?? 'Mageus'), totalMinor: Number(order.totalMinor ?? 0), currency: String(order.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(order.status ?? 'pending') as OrderRow['status'], paymentStatus: String(order.effectivePaymentStatus ?? order.paymentStatus ?? 'unpaid')
      })));
      this.categories.set(Array.isArray(categoryRows) ? categoryRows as CategoryRow[] : []);
      this.inventory.set(Array.isArray(inventoryRows) ? inventoryRows as InventoryRow[] : []);
      const loadedMenus = Array.isArray(menuRows) ? menuRows as MenuRow[] : [];
      this.menus.set(loadedMenus);
      const itemGroups = await Promise.all(loadedMenus.map((menu) => this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/menus/' + encodeURIComponent(menu.id) + '/items')));
      this.menuItems.set(itemGroups.flatMap((group, index) => (Array.isArray(group) ? group : []).map((item: any): MenuItemRow => ({
        id: String(item.id), menuId: String(item.menuId ?? loadedMenus[index].id), slug: String(item.slug ?? ''), name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null, priceAmountMinor: Number(item.priceAmountMinor ?? 0), currency: String(item.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(item.status ?? 'draft') as MenuItemRow['status'], availability: String(item.availability ?? 'available') as MenuItemRow['availability'], position: Number(item.position ?? 0),
        categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
        allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
        dietaryLabels: Array.isArray(item.dietaryLabels) ? item.dietaryLabels.map(String) : [],
        modifierGroups: Array.isArray(item.metadata?.modifierGroups) ? item.metadata.modifierGroups as MenuModifierGroup[] : []
      }))));
      this.products.update((rows) => rows.map((product) => {
        const levels = this.inventory().filter((item) => item.variantId === product.variantId && item.quantityOnHand !== null);
        return { ...product, stock: levels.length ? levels.reduce((sum, item) => sum + Number(item.quantityOnHand ?? 0), 0) : null };
      }));
    } catch (error) {
      this.workspaceError.set(error instanceof Error ? error.message : 'An unexpected error occurred while loading your workspace.');
    } finally {
      this.workspaceLoading.set(false);
    }
  }

  protected retryWorkspace(): void { void this.loadWorkspace(); }

  protected async createOrganization(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    this.onboardingBusy.set(true); this.onboardingError.set('');
    try {
      const organization = await this.apiClient.request('/api/v1/organizations', { method: 'POST', body: JSON.stringify({ name: String(values.get('name') ?? '').trim(), slug: String(values.get('slug') ?? '').trim() }) });
      this.organizationId.set(organization.id);
      this.onboardingStage.set('store');
    } catch (error) {
      this.onboardingError.set(error instanceof Error ? error.message : 'Could not create your workspace.');
    } finally { this.onboardingBusy.set(false); }
  }

  protected async createStore(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    this.onboardingBusy.set(true); this.onboardingError.set('');
    try {
      const store = await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/stores`, { method: 'POST', body: JSON.stringify({
        name: String(values.get('name') ?? '').trim(), slug: String(values.get('slug') ?? '').trim(), description: null,
        businessType: 'general', status: 'active', currency: 'MAD', locale: 'en', timeZone: 'Africa/Casablanca',
        defaultExperience: 'commerce', enabledExperiences: ['commerce'], published: false, theme: {}
      }) });
      this.storeId.set(store.id); this.storeCurrency.set('MAD'); this.storeName.set(store.name); this.storeSlug.set(store.slug);
      this.onboardingStage.set('ready');
      await this.loadWorkspace();
    } catch (error) {
      this.onboardingError.set(error instanceof Error ? error.message : 'Could not create your store.');
    } finally { this.onboardingBusy.set(false); }
  }

  protected readonly activeNav = signal<NavItem>('Overview');
  protected readonly search = signal('');
  protected readonly toast = signal('');
  protected readonly primaryNav: {label: NavItem; symbol: string}[] = [
    {label:'Overview',symbol:'▦'},{label:'Orders',symbol:'▤'},{label:'POS',symbol:'▣'},{label:'Products',symbol:'◇'},{label:'Menus',symbol:'☷'},{label:'QR Studio',symbol:'▦'},{label:'Customers',symbol:'♙'},{label:'Inventory',symbol:'▱'}
  ];
  protected readonly channelNav: {label: NavItem; symbol: string}[] = [{label:'API & channels',symbol:'⌘'},{label:'Integrations',symbol:'⌘'}];
  protected readonly filters: ('All' | ProductStatus)[] = ['All','Active','Draft','Archived'];
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly openProductEditorRequest = signal(0);
  protected readonly orders = signal<OrderRow[]>([]);
  protected readonly categories = signal<CategoryRow[]>([]);
  protected readonly menus = signal<MenuRow[]>([]);
  protected readonly menuItems = signal<MenuItemRow[]>([]);
  protected readonly inventory = signal<InventoryRow[]>([]);
  protected readonly orderActionBusyId = signal('');
  protected readonly orderActionError = signal('');
  protected readonly selectedPaymentOrder = signal<OrderRow | null>(null);
  protected readonly paymentDetails = signal<any | null>(null);
  protected readonly paymentDetailsBusy = signal(false);
  protected readonly paymentSaveBusy = signal(false);
  protected readonly paymentMethod = signal('cash');
  protected readonly paymentAmount = signal('');
  protected readonly paymentReference = signal('');
  protected readonly paymentNote = signal('');
  protected readonly paymentRecordStatus = signal('succeeded');
  protected readonly selectedRefundOrder = signal<OrderRow | null>(null);
  protected readonly refundDetails = signal<{ refunds: any[]; payments: any[]; totalMinor: number; currency: string } | null>(null);
  protected readonly refundBusy = signal(false);
  protected readonly refundSaveBusy = signal(false);
  protected readonly refundPaymentId = signal('');
  protected readonly refundAmount = signal('');
  protected readonly refundReason = signal('');
  protected readonly selectedShipmentOrder = signal<OrderRow | null>(null);
  protected readonly shipmentDetails = signal<{ orderId: string; fulfillments: ShipmentDetails[] } | null>(null);
  protected readonly shipmentBusy = signal(false);
  protected readonly shipmentSaveBusy = signal(false);
  protected readonly shipmentStage = signal<FulfillmentStage>('preparing');
  protected readonly shipmentCarrier = signal('');
  protected readonly shipmentTrackingNumber = signal('');
  protected readonly shipmentTrackingUrl = signal('');
  protected readonly shipmentEstimatedDate = signal('');
  protected readonly shipmentNotes = signal('');

  protected activeCount(): number { return this.products().filter(p => p.status === 'Active').length; }
  protected lowStockCount(): number { return this.inventory().filter((item) => item.quantityOnHand !== null && item.reorderPoint !== null && item.quantityOnHand <= item.reorderPoint).length; }
  protected money(minor: number, currency: string): string { return new Intl.NumberFormat('en', {style:'currency',currency,maximumFractionDigits:2}).format(minor / 100); }
  protected categoryName(categoryId?: string | null): string { return this.categories().find(category => category.id === categoryId)?.name ?? '—'; }
  protected statusClass(status: string): string { const value = status.toLowerCase(); return value === 'confirmed' || value === 'processing' ? 'processing' : value === 'completed' || value === 'paid' ? 'paid' : value === 'cancelled' || value === 'refunded' ? 'draft' : 'pending'; }
  protected orderStatusLabel(status: string): string { return status ? status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ') : 'Unknown'; }

  protected async openPaymentTracker(order: OrderRow): Promise<void> {
    this.selectedPaymentOrder.set(order);
    this.paymentDetails.set(null);
    this.orderActionError.set('');
    this.paymentDetailsBusy.set(true);
    this.paymentAmount.set('');
    this.paymentReference.set('');
    this.paymentNote.set('');
    try {
      const details = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments');
      this.paymentDetails.set(details);
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not load payment history.');
    } finally {
      this.paymentDetailsBusy.set(false);
    }
  }

  protected async recordManualPayment(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.selectedPaymentOrder();
    const amount = Number(this.paymentAmount());
    if (!order || !Number.isFinite(amount) || amount <= 0) {
      this.orderActionError.set('Enter a valid payment amount.');
      return;
    }
    this.paymentSaveBusy.set(true);
    this.orderActionError.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments', {
        method: 'POST',
        body: JSON.stringify({
          method: this.paymentMethod(),
          status: this.paymentRecordStatus(),
          amountMinor: Math.round(amount * 100),
          reference: this.paymentReference().trim() || null,
          note: this.paymentNote().trim() || null
        })
      });
      this.orders.update(rows => rows.map(row => row.resourceId === order.resourceId ? { ...row, paymentStatus: String(result.paymentStatus ?? row.paymentStatus) } : row));
      this.paymentAmount.set('');
      this.paymentReference.set('');
      this.paymentNote.set('');
      await this.refreshPaymentDetails(order);
      this.notify(this.paymentRecordStatus() === 'pending' ? 'Expected payment recorded.' : 'Offline payment recorded and audited.');
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not record the payment.');
    } finally {
      this.paymentSaveBusy.set(false);
    }
  }

  protected async finalizeManualPayment(paymentId: string, status: 'succeeded' | 'cancelled'): Promise<void> {
    const order = this.selectedPaymentOrder();
    if (!order) return;
    this.paymentSaveBusy.set(true);
    this.orderActionError.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments/' + encodeURIComponent(paymentId), {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      this.orders.update(rows => rows.map(row => row.resourceId === order.resourceId ? { ...row, paymentStatus: String(result.paymentStatus ?? row.paymentStatus) } : row));
      await this.refreshPaymentDetails(order);
      this.notify(status === 'succeeded' ? 'Payment manually confirmed as received.' : 'Pending payment record cancelled.');
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not update the payment record.');
    } finally {
      this.paymentSaveBusy.set(false);
    }
  }

  private async refreshPaymentDetails(order: OrderRow): Promise<void> {
    const details = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments');
    this.paymentDetails.set(details);
  }


  protected async openRefundTracker(order: OrderRow): Promise<void> {
    this.selectedRefundOrder.set(order);
    this.refundDetails.set(null);
    this.refundPaymentId.set('');
    this.refundAmount.set('');
    this.refundReason.set('');
    this.orderActionError.set('');
    this.refundBusy.set(true);
    try {
      await this.refreshRefundDetails(order);
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not load refund history.');
    } finally {
      this.refundBusy.set(false);
    }
  }

  protected async recordRefund(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.selectedRefundOrder();
    const paymentId = this.refundPaymentId();
    const amount = Number(this.refundAmount());
    if (!order || !paymentId || !Number.isFinite(amount) || amount <= 0) {
      this.orderActionError.set('Choose a successful payment and enter a valid refund amount.');
      return;
    }
    this.refundSaveBusy.set(true);
    this.orderActionError.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/refunds', {
        method: 'POST',
        body: JSON.stringify({
          paymentId,
          amountMinor: Math.round(amount * 100),
          reason: this.refundReason().trim() || null,
          idempotencyKey: 'merchant-refund-' + crypto.randomUUID()
        })
      });
      this.orders.update(rows => rows.map(row => row.resourceId === order.resourceId ? {
        ...row,
        paymentStatus: String(result.paymentStatus ?? row.paymentStatus),
        status: result.paymentStatus === 'refunded' ? 'refunded' : row.status
      } : row));
      this.refundAmount.set('');
      this.refundReason.set('');
      await this.refreshRefundDetails(order);
      this.notify('Manual refund recorded and audited. No payment-provider transfer was initiated.');
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not record this refund.');
    } finally {
      this.refundSaveBusy.set(false);
    }
  }

  private async refreshRefundDetails(order: OrderRow): Promise<void> {
    const base = '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId);
    const [refunds, payments] = await Promise.all([
      this.apiClient.request(base + '/refunds'),
      this.apiClient.request(base + '/payments')
    ]);
    this.refundDetails.set({
      refunds: Array.isArray(refunds) ? refunds : [],
      payments: Array.isArray(payments.payments) ? payments.payments : [],
      totalMinor: Number(payments.totalMinor ?? order.totalMinor),
      currency: String(payments.currency ?? order.currency)
    });
  }

  protected async openShipmentTracker(order: OrderRow): Promise<void> {
    this.selectedShipmentOrder.set(order);
    this.shipmentDetails.set(null);
    this.orderActionError.set('');
    this.shipmentBusy.set(true);
    this.shipmentStage.set('preparing');
    this.shipmentCarrier.set('');
    this.shipmentTrackingNumber.set('');
    this.shipmentTrackingUrl.set('');
    this.shipmentEstimatedDate.set('');
    this.shipmentNotes.set('');
    try {
      const details = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/fulfillments');
      this.shipmentDetails.set(details);
      const latest = Array.isArray(details.fulfillments) ? details.fulfillments[0] as ShipmentDetails | undefined : undefined;
      if (latest) {
        this.shipmentStage.set(['cancelled', 'returned'].includes(latest.stage) ? 'preparing' : latest.stage);
        this.shipmentCarrier.set(latest.carrier ?? '');
        this.shipmentTrackingNumber.set(latest.trackingNumber ?? '');
        this.shipmentTrackingUrl.set(latest.trackingUrl ?? '');
        this.shipmentEstimatedDate.set(latest.estimatedDeliveryDate ?? '');
        this.shipmentNotes.set(latest.notes ?? '');
      }
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not load shipment details.');
    } finally {
      this.shipmentBusy.set(false);
    }
  }

  protected async saveShipment(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.selectedShipmentOrder();
    if (!order) return;
    const trackingUrl = this.shipmentTrackingUrl().trim();
    if (trackingUrl) {
      try {
        const url = new URL(trackingUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
      } catch {
        this.orderActionError.set('Enter a valid tracking link beginning with https:// or http://.');
        return;
      }
    }
    const latest = this.shipmentDetails()?.fulfillments?.[0];
    const terminal = latest && ['cancelled', 'returned'].includes(latest.stage);
    const restartAfterDelivery = latest?.stage === 'delivered' && this.shipmentStage() === 'preparing';
    const createNew = !latest || terminal || restartAfterDelivery;
    const payload = {
      stage: this.shipmentStage(),
      carrier: this.shipmentCarrier().trim() || null,
      trackingNumber: this.shipmentTrackingNumber().trim() || null,
      trackingUrl: trackingUrl || null,
      estimatedDeliveryDate: this.shipmentEstimatedDate() || null,
      notes: this.shipmentNotes().trim() || null
    };
    this.shipmentSaveBusy.set(true);
    this.orderActionError.set('');
    try {
      const base = '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/fulfillments';
      await this.apiClient.request(createNew ? base : base + '/' + encodeURIComponent(latest!.id), {
        method: createNew ? 'POST' : 'PATCH',
        body: JSON.stringify(payload)
      });
      const details = await this.apiClient.request(base);
      this.shipmentDetails.set(details);
      const current = Array.isArray(details.fulfillments) ? details.fulfillments[0] as ShipmentDetails | undefined : undefined;
      if (current) {
        this.shipmentStage.set(current.stage);
        this.shipmentCarrier.set(current.carrier ?? '');
        this.shipmentTrackingNumber.set(current.trackingNumber ?? '');
        this.shipmentTrackingUrl.set(current.trackingUrl ?? '');
        this.shipmentEstimatedDate.set(current.estimatedDeliveryDate ?? '');
        this.shipmentNotes.set(current.notes ?? '');
      }
      this.notify('Shipment details saved and audited.');
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'Could not save shipment details.');
    } finally {
      this.shipmentSaveBusy.set(false);
    }
  }

  protected async updateOrderStatus(order: OrderRow, status: string): Promise<void> {
    if (status === order.status || !order.resourceId) return;
    this.orderActionBusyId.set(order.resourceId); this.orderActionError.set('');
    try {
      const updated = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId), { method: 'PATCH', body: JSON.stringify({ status }) });
      this.orders.update((rows) => rows.map((row) => row.resourceId === order.resourceId ? { ...row, status: String(updated.status ?? status) as OrderRow['status'] } : row));
      this.notify('Order status updated and audited.');
    } catch (error) { this.orderActionError.set(error instanceof Error ? error.message : 'Could not update order status.'); }
    finally { this.orderActionBusyId.set(''); }
  }
  protected pageDescription(): string { return this.activeNav() === 'Products' ? 'Manage your catalog, prices and product availability.' : this.activeNav() === 'QR Studio' ? 'Create and manage branded QR entry points for menus and storefronts.' : this.activeNav() === 'Menus' ? 'Build restaurant menus, publish items, and control availability.' : this.activeNav() === 'Orders' ? 'Review orders and their saved item snapshots.' : this.activeNav() === 'POS' ? 'Open a register and create in-person sales.' : this.activeNav() === 'Customers' ? 'Keep customer contact details and notes together.' : this.activeNav() === 'Inventory' ? 'Track stock by location and reorder threshold.' : 'Configure your business workspace and connected channels.'; }
  protected selectNav(item: NavItem): void {
    this.activeNav.set(item);
    if (item === 'API & channels') return;
    if (item === 'Integrations') { this.notify('Integration connectors are being added after API access.'); return; }
    if (!['Overview','Products','Menus','QR Studio','Orders','POS','Customers','Inventory'].includes(item)) this.notify(item + ' is planned for a future milestone.');
  }
  protected refreshWorkspace(): void { void this.loadWorkspace(); }
  protected addProduct(): void { this.selectNav('Products'); this.openProductEditorRequest.update(value => value + 1); }

  protected openQrStudio(): void { if (typeof window !== 'undefined') window.location.assign('/qr'); }
  protected notify(message: string): void { this.toast.set(message); globalThis.setTimeout(() => { if (this.toast() === message) this.toast.set(''); }, 3000); }
}
