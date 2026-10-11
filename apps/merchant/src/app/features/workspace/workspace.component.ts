import { DatePipe } from '@angular/common';
import { AuthPanelComponent } from '../auth/auth-panel.component';
import { RestaurantMenuManagerComponent } from '../restaurants/menus/restaurant-menu-manager.component';
import { CustomerManagementComponent } from '../customers/customer-management.component';
import { InventoryManagementComponent } from '../inventory/inventory-management.component';
import { OverviewDashboardComponent } from '../overview/overview-dashboard.component';
import { Router } from '@angular/router';
import { ApiClientService } from '../../core/api/api-client.service';
import { SessionService } from '../../core/auth/session.service';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type NavItem = 'Overview' | 'Orders' | 'POS' | 'Products' | 'Menus' | 'QR Studio' | 'Customers' | 'Inventory' | 'API & channels' | 'Integrations' | 'Settings';
import { ProductStatus, ProductRow, OrderRow, CustomerRow, CategoryRow, MenuRow, PosCartLine, MenuModifierOption, MenuModifierGroup, MenuItemRow, EntryPointRow, InventoryRow, FulfillmentStage, ShipmentDetails } from '../../shared/models/commerce.models';


@Component({
  selector: 'dlr-workspace',
  standalone: true,
  imports: [DatePipe, AuthPanelComponent, RestaurantMenuManagerComponent, CustomerManagementComponent, InventoryManagementComponent, OverviewDashboardComponent],
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
  protected readonly productEditorOpen = signal(false);
  protected readonly editingProduct = signal<ProductRow | null>(null);
  protected readonly productSaveBusy = signal(false);
  protected readonly productSaveError = signal('');
  protected readonly imageUploadBusy = signal(false);
  protected readonly imageUploadError = signal('');
  protected readonly imageUploadNote = signal('');
  protected readonly imageAltText = signal('');
  protected readonly imageMaxWidth = signal(1200);
  protected readonly imageMaxHeight = signal(1200);
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
      this.storePublished.set(Boolean(store.published));
      this.storeExperience.set(store.defaultExperience === 'menu' || store.defaultExperience === 'catalog' || store.defaultExperience === 'services' ? store.defaultExperience : 'commerce');
      this.storeEnabledExperiences.set(Array.isArray(store.enabledExperiences) && store.enabledExperiences.length ? store.enabledExperiences : ['commerce']);
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
      const [orderRows, customerRows, inventoryRows, sessionRows, posOrderRows, menuRows, entryPointRows, categoryRows] = await Promise.all([
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/orders'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/customers'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/inventory'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/pos/sessions'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/pos/orders'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/menus'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/entry-points'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/categories')
      ]);
      this.orders.set((Array.isArray(orderRows) ? orderRows : []).map((order: any): OrderRow => ({
        id: '#' + String(order.orderNumber), resourceId: String(order.id), customer: String(order.customerEmail ?? 'Guest checkout'),
        channel: String(order.channel ?? 'Mageus'), totalMinor: Number(order.totalMinor ?? 0), currency: String(order.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(order.status ?? 'pending') as OrderRow['status'], paymentStatus: String(order.effectivePaymentStatus ?? order.paymentStatus ?? 'unpaid')
      })));
      this.categories.set(Array.isArray(categoryRows) ? categoryRows as CategoryRow[] : []);
      this.customers.set((Array.isArray(customerRows) ? customerRows : []).map((customer: any): CustomerRow => ({
        id: String(customer.id), displayName: String(customer.displayName ?? [customer.firstName, customer.lastName].filter(Boolean).join(' ')),
        email: typeof customer.email === 'string' ? customer.email : null, phone: typeof customer.phone === 'string' ? customer.phone : null
      })));
      this.inventory.set(Array.isArray(inventoryRows) ? inventoryRows as InventoryRow[] : []);
      const loadedMenus = Array.isArray(menuRows) ? menuRows as MenuRow[] : [];
      this.menus.set(loadedMenus);
      const itemGroups = await Promise.all(loadedMenus.map((menu) => this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/menus/' + encodeURIComponent(menu.id) + '/items')));
      const savedEntryPoints = Array.isArray(entryPointRows) ? entryPointRows as EntryPointRow[] : [];
      this.entryPoints.set(await Promise.all(savedEntryPoints.map(async (point) => {
        try {
          const publicPoint = await this.apiClient.request('/api/v1/public/entry-points/' + encodeURIComponent(point.id));
          return { ...point, targetUrl: typeof publicPoint?.targetUrl === 'string' ? publicPoint.targetUrl : null, targetUrlPath: String(publicPoint?.targetUrlPath ?? '') };
        } catch { return { ...point, targetUrl: null, targetUrlPath: '/' + this.storeSlug() + point.targetPath }; }
      })));
      if (!this.entryPoints().some(point => point.id === this.selectedQrId())) this.selectedQrId.set('');
      this.menuItems.set(itemGroups.flatMap((group, index) => (Array.isArray(group) ? group : []).map((item: any): MenuItemRow => ({
        id: String(item.id), menuId: String(item.menuId ?? loadedMenus[index].id), slug: String(item.slug ?? ''), name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null, priceAmountMinor: Number(item.priceAmountMinor ?? 0), currency: String(item.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(item.status ?? 'draft') as MenuItemRow['status'], availability: String(item.availability ?? 'available') as MenuItemRow['availability'], position: Number(item.position ?? 0),
        categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
        allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
        dietaryLabels: Array.isArray(item.dietaryLabels) ? item.dietaryLabels.map(String) : [],
        modifierGroups: Array.isArray(item.metadata?.modifierGroups) ? item.metadata.modifierGroups as MenuModifierGroup[] : []
      }))));
      const sessions = Array.isArray(sessionRows) ? sessionRows : [];
      this.posSessions.set(sessions);
      this.posOrders.set(Array.isArray(posOrderRows) ? posOrderRows : []);
      const openSession = sessions.find((session: any) => session.status === 'open');
      this.selectedPosSessionId.set(openSession ? String(openSession.id) : '');
      if (!this.posVariantId() || !this.products().some((product) => product.variantId === this.posVariantId() && product.status === 'Active')) {
        this.posVariantId.set(this.products().find((product) => product.status === 'Active' && product.variantId)?.variantId ?? '');
      }
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
  protected readonly productFilter = signal<'All' | ProductStatus>('All');
  protected readonly toast = signal('');
  protected readonly primaryNav: {label: NavItem; symbol: string}[] = [
    {label:'Overview',symbol:'▦'},{label:'Orders',symbol:'▤'},{label:'POS',symbol:'▣'},{label:'Products',symbol:'◇'},{label:'Menus',symbol:'☷'},{label:'QR Studio',symbol:'▦'},{label:'Customers',symbol:'♙'},{label:'Inventory',symbol:'▱'}
  ];
  protected readonly channelNav: {label: NavItem; symbol: string}[] = [{label:'API & channels',symbol:'⌘'},{label:'Integrations',symbol:'⌘'}];
  protected readonly filters: ('All' | ProductStatus)[] = ['All','Active','Draft','Archived'];
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly orders = signal<OrderRow[]>([]);
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly categories = signal<CategoryRow[]>([]);
  protected readonly menus = signal<MenuRow[]>([]);
  protected readonly menuItems = signal<MenuItemRow[]>([]);
  protected readonly entryPoints = signal<EntryPointRow[]>([]);
  protected readonly selectedQrId = signal('');
  protected readonly qrBusy = signal(false);
  protected readonly qrError = signal('');
  protected readonly qrBrandName = signal('');
  protected readonly qrForeground = signal('#123456');
  protected readonly qrBackground = signal('#ffffff');
  protected readonly qrAccent = signal('#238636');
  protected readonly qrLogoUrl = signal('');
  protected readonly qrFrame = signal<'none' | 'bottom-label' | 'top-label'>('bottom-label');
  protected readonly qrLabel = signal('Scan to view menu');
  protected readonly qrTargetPath = signal<'/' | '/menu' | '/catalog' | '/services'>('/menu');
  protected readonly storePublished = signal(false);
  protected readonly storeExperience = signal<'commerce' | 'menu' | 'catalog' | 'services'>('commerce');
  protected readonly storeEnabledExperiences = signal<string[]>(['commerce']);
  protected readonly inventory = signal<InventoryRow[]>([]);
  protected readonly posSessions = signal<any[]>([]);
  protected readonly posOrders = signal<any[]>([]);
  protected readonly selectedPosSessionId = signal('');
  protected readonly posSessionLabel = signal('Main register');
  protected readonly posTerminalType = signal('retail');
  protected readonly posVariantId = signal('');
  protected readonly posSourceType = signal<'product' | 'menu_item'>('product');
  protected readonly posModifiers = signal<Record<string, string[]>>({});
  protected readonly posCart = signal<PosCartLine[]>([]);
  protected readonly posQuantity = signal('1');
  protected readonly posFulfillment = signal('counter');
  protected readonly posCustomerNote = signal('');
  protected readonly posBusy = signal(false);
  protected readonly posSaveBusy = signal(false);
  protected readonly posError = signal('');
  protected readonly posCartError = signal('');
  protected readonly customerFormOpen = signal(false);
  protected readonly customerSaveBusy = signal(false);
  protected readonly customerSaveError = signal('');
  protected readonly inventoryBusy = signal(false);
  protected readonly inventoryError = signal('');
  protected readonly apiCredentials = signal<any[]>([]);
  protected readonly apiCredentialName = signal('External integration');
  protected readonly apiCredentialScopes = signal('read');
  protected readonly apiCredentialExpiry = signal('90');
  protected readonly apiCredentialBusy = signal(false);
  protected readonly apiCredentialError = signal('');
  protected readonly apiCredentialToken = signal('');
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
  protected productCategoryName(product: ProductRow): string {
    const names = (product.categoryIds ?? []).map(id => this.categories().find(category => category.id === id)?.name).filter((name): name is string => Boolean(name));
    return names.length ? names.join(', ') : 'Uncategorized';
  }
  protected hasActiveCategories(): boolean { return this.categories().some(category => category.status === 'active'); }

  protected readonly filteredProducts = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.productFilter();
    return this.products().filter(p => (!query || [p.name,p.sku,p.category].some(v => v.toLowerCase().includes(query))) && (filter === 'All' || p.status === filter));
  });
  protected activeCount(): number { return this.products().filter(p => p.status === 'Active').length; }
  protected lowStockCount(): number { return this.inventory().filter((item) => item.quantityOnHand !== null && item.reorderPoint !== null && item.quantityOnHand <= item.reorderPoint).length; }
  protected filterCount(filter: 'All' | ProductStatus): number { return filter === 'All' ? this.products().length : this.products().filter(p => p.status === filter).length; }
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


  protected hasOpenPosSession(): boolean { return this.posSessions().some((session: any) => session.status === 'open'); }

  protected async createPosSession(event: Event): Promise<void> {
    event.preventDefault();
    const label = this.posSessionLabel().trim();
    if (!label) { this.posError.set('Enter a register name.'); return; }
    this.posBusy.set(true); this.posError.set('');
    try {
      const session = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/sessions', {
        method: 'POST', body: JSON.stringify({ label, terminalType: this.posTerminalType() })
      });
      this.posSessions.update(rows => [session, ...rows.filter(row => row.id !== session.id)]);
      this.selectedPosSessionId.set(String(session.id));
      this.notify('POS register opened.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not open this register.');
    } finally { this.posBusy.set(false); }
  }

  protected async closePosSession(): Promise<void> {
    const sessionId = this.selectedPosSessionId();
    if (!sessionId) return;
    this.posBusy.set(true); this.posError.set('');
    try {
      const closed = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/sessions/' + encodeURIComponent(sessionId) + '/close', {
        method: 'PATCH', body: JSON.stringify({})
      });
      this.posSessions.update(rows => rows.map(row => row.id === sessionId ? closed : row));
      this.selectedPosSessionId.set('');
      this.notify('POS register closed.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not close this register.');
    } finally { this.posBusy.set(false); }
  }

  protected addPosCartItem(event: Event): void {
    event.preventDefault();
    const variantId = this.posVariantId();
    const quantity = Number(this.posQuantity());
    const sourceType = this.posSourceType();
    const product = sourceType === 'product' ? this.products().find(row => row.variantId === variantId && row.status === 'Active') : null;
    const menuItem = sourceType === 'menu_item' ? this.selectedPosMenuItem() : null;
    if (!this.selectedPosSessionId() || (sourceType === 'product' ? !product : !menuItem) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || (sourceType === 'menu_item' && !this.posModifiersValid())) {
      this.posCartError.set('Choose an open register, a valid active item, quantity, and all required modifier options.');
      return;
    }
    const modifiers = sourceType === 'menu_item' ? this.selectedPosModifiersPayload() : [];
    const modifierDelta = modifiers.reduce((sum, selection) => {
      const group = menuItem?.modifierGroups?.find(candidate => candidate.id === selection.groupId);
      return sum + selection.optionIds.reduce((subtotal, optionId) => subtotal + Number(group?.options.find(option => option.id === optionId)?.priceDeltaMinor ?? 0), 0);
    }, 0);
    const name = sourceType === 'product' ? product!.name : menuItem!.name;
    const sourceItemId = sourceType === 'product' ? product!.id : menuItem!.id;
    const sourceVariantId = sourceType === 'product' ? variantId : undefined;
    const priceAmountMinor = sourceType === 'product' ? product!.priceMinor : menuItem!.priceAmountMinor + modifierDelta;
    const currency = sourceType === 'product' ? product!.currency : menuItem!.currency;
    const metadata = sourceType === 'menu_item' ? { modifiers } : undefined;
    const key = [sourceType, sourceItemId, sourceVariantId ?? '', JSON.stringify(modifiers)].join(':');
    this.posCartError.set('');
    const existingLine = this.posCart().find(line => line.key === key);
    if (existingLine && existingLine.quantity + quantity > 10000) {
      this.posCartError.set('A ticket line cannot exceed 10,000 units.');
      return;
    }
    this.posCart.update(lines => {
      if (!existingLine) return [...lines, { key, sourceType, sourceItemId, sourceVariantId, quantity, name, priceAmountMinor, currency, metadata }];
      return lines.map(line => line.key === key ? { ...line, quantity: line.quantity + quantity } : line);
    });
    this.posQuantity.set('1');
    if (sourceType === 'menu_item') this.posModifiers.set({});
    this.notify('Item added to the POS ticket.');
  }

  protected removePosCartItem(key: string): void { this.posCart.update(lines => lines.filter(line => line.key !== key)); }
  protected posCartTotalMinor(): number { return this.posCart().reduce((sum, line) => sum + line.priceAmountMinor * line.quantity, 0); }

  protected async createPosOrder(): Promise<void> {
    const sessionId = this.selectedPosSessionId();
    if (!sessionId || !this.posCart().length) {
      this.posError.set('Choose an open register and add at least one item to the ticket.');
      return;
    }
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          sessionId, channel: 'pos', fulfillment: this.posFulfillment(),
          customerNote: this.posCustomerNote().trim() || null,
          idempotencyKey: 'merchant-pos-' + crypto.randomUUID(),
          items: this.posCart().map(line => ({
            sourceType: line.sourceType, sourceItemId: line.sourceItemId,
            ...(line.sourceVariantId ? { sourceVariantId: line.sourceVariantId } : {}),
            quantity: line.quantity, ...(line.metadata ? { metadata: line.metadata } : {})
          }))
        })
      });
      const rows = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
      this.posOrders.set(Array.isArray(rows) ? rows : []);
      this.posQuantity.set('1'); this.posCustomerNote.set(''); this.posCart.set([]); this.posCartError.set('');
      this.notify('POS order created with server-calculated pricing.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not create this POS order.');
    } finally { this.posSaveBusy.set(false); }
  }

  protected async recordPosPayment(order: any): Promise<void> {
    if (!order?.id || order.status === 'cancelled') return;
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      const endpoint = '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.id) + '/payments';
      const details = await this.apiClient.request(endpoint);
      const balance = Number(details?.balanceMinor);
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('The order payment balance could not be verified.');
      if (balance === 0) {
        this.notify('This order is already fully paid.');
        return;
      }
      await this.apiClient.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          method: this.paymentMethod(),
          status: 'succeeded',
          amountMinor: balance,
          note: 'Recorded from merchant POS',
          idempotencyKey: 'pos-payment-' + order.id + '-' + crypto.randomUUID()
        })
      });
      await this.loadWorkspace();
      this.notify('Offline payment recorded. No external payment was processed.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not record POS payment.');
    } finally { this.posSaveBusy.set(false); }
  }

  protected async updatePosOrderStatus(order: any, status: string): Promise<void> {
    if (!order?.id || status === order.status) return;
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders/' + encodeURIComponent(order.id) + '/status', {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      const rows = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
      this.posOrders.set(Array.isArray(rows) ? rows : []);
      this.notify('POS order status updated and audited.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not update this POS order.');
    } finally { this.posSaveBusy.set(false); }
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
  protected async loadApiCredentials(): Promise<void> {
    if (!this.organizationId()) return;
    this.apiCredentialBusy.set(true);
    this.apiCredentialError.set('');
    try { this.apiCredentials.set(await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials')); }
    catch (error) { this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not load API credentials.'); }
    finally { this.apiCredentialBusy.set(false); }
  }
  protected async createApiCredential(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const scopes = String(values.get('scopes') ?? 'read').split(',') as ('read' | 'write')[];
    const expiry = String(values.get('expiry') ?? '90');
    const expiresAt = expiry === 'never' ? undefined : new Date(Date.now() + Number(expiry) * 86400000).toISOString();
    this.apiCredentialBusy.set(true); this.apiCredentialError.set(''); this.apiCredentialToken.set('');
    try {
      const result = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials', { method: 'POST', body: JSON.stringify({ name, scopes, ...(expiresAt ? { expiresAt } : {}) }) });
      this.apiCredentialToken.set(String(result.token ?? ''));
      this.apiCredentialName.set('External integration');
      form.reset();
      await this.loadApiCredentials();
      this.notify('API credential created. Copy its token before hiding it.');
    } catch (error) { this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not create API credential.'); }
    finally { this.apiCredentialBusy.set(false); }
  }
  protected async revokeApiCredential(credential: any): Promise<void> {
    if (!credential?.id || !globalThis.confirm('Revoke "' + String(credential.name) + '"? Applications using this token will stop working.')) return;
    this.apiCredentialBusy.set(true); this.apiCredentialError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials/' + encodeURIComponent(credential.id), { method: 'DELETE', body: JSON.stringify({}) });
      await this.loadApiCredentials(); this.notify('API credential revoked.');
    } catch (error) { this.apiCredentialError.set(error instanceof Error ? error.message : 'Could not revoke API credential.'); }
    finally { this.apiCredentialBusy.set(false); }
  }
  protected copyApiCredentialToken(): void {
    const token = this.apiCredentialToken();
    if (!token || !globalThis.navigator?.clipboard) { this.apiCredentialError.set('Clipboard access is unavailable. Select and copy the token manually.'); return; }
    void globalThis.navigator.clipboard.writeText(token).then(() => this.notify('API token copied.')).catch(() => this.apiCredentialError.set('Could not access the clipboard. Select and copy the token manually.'));
  }
  protected selectNav(item: NavItem): void {
    this.activeNav.set(item);
    if (item === 'API & channels') { void this.loadApiCredentials(); return; }
    if (item === 'Integrations') { this.notify('Integration connectors are being added after API access.'); return; }
    if (!['Overview','Products','Menus','QR Studio','Orders','POS','Customers','Inventory'].includes(item)) this.notify(item + ' is planned for a future milestone.');
  }
  protected async toggleStorefrontPublishing(): Promise<void> {
    this.qrBusy.set(true); this.qrError.set('');
    try {
      const enabled = Array.from(new Set([...this.storeEnabledExperiences(), this.storeExperience()]));
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/storefront', {
        method: 'PATCH',
        body: JSON.stringify({ published: !this.storePublished(), defaultExperience: this.storeExperience(), enabledExperiences: enabled })
      });
      await this.loadWorkspace();
      this.notify(this.storePublished() ? 'Storefront published. Public menu and active QR entry points can now resolve.' : 'Storefront unpublished; public access is disabled.');
    } catch (error) { this.qrError.set(error instanceof Error ? error.message : 'Could not update storefront publishing.'); }
    finally { this.qrBusy.set(false); }
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
      await this.loadWorkspace();
      if (result?.id) this.selectedQrId.set(String(result.id));
      this.notify('Branded QR entry point saved.');
    } catch (error) { this.qrError.set(error instanceof Error ? error.message : 'Could not save this QR entry point.'); }
    finally { this.qrBusy.set(false); }
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
    this.qrTargetPath.set(point.targetPath);
    this.qrBrandName.set(point.branding?.brandName ?? this.storeName());
    this.qrForeground.set(point.branding?.foregroundColor ?? '#123456');
    this.qrBackground.set(point.branding?.backgroundColor ?? '#ffffff');
    this.qrAccent.set(point.branding?.accentColor ?? '#238636');
    this.qrLogoUrl.set(point.branding?.logoUrl ?? '');
    this.qrFrame.set(point.branding?.frame ?? 'none');
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
      await this.loadWorkspace(); this.notify('QR branding updated.');
    } catch (error) { this.qrError.set(error instanceof Error ? error.message : 'Could not update QR branding.'); }
    finally { this.qrBusy.set(false); }
  }
  protected async toggleQrEntryPoint(point: EntryPointRow): Promise<void> {
    this.qrBusy.set(true); this.qrError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points/' + encodeURIComponent(point.id), {
        method: 'PATCH', body: JSON.stringify({ status: point.status === 'active' ? 'disabled' : 'active' })
      });
      await this.loadWorkspace(); this.notify(point.status === 'active' ? 'QR entry point disabled.' : 'QR entry point enabled.');
    } catch (error) { this.qrError.set(error instanceof Error ? error.message : 'Could not change QR entry point status.'); }
    finally { this.qrBusy.set(false); }
  }
  protected selectedPosMenuItem(): MenuItemRow | null { return this.menuItems().find(item => item.id === this.posVariantId() && item.status === 'active' && item.availability !== 'unavailable' && this.menus().some(menu => menu.id === item.menuId && menu.status === 'active')) ?? null; }
  protected togglePosModifier(groupId: string, optionId: string, checked: boolean, maxSelections: number): void {
    this.posModifiers.update(current => {
      const selected = current[groupId] ?? [];
      if (!checked) return { ...current, [groupId]: selected.filter(id => id !== optionId) };
      if (selected.includes(optionId)) return current;
      if (maxSelections === 1) return { ...current, [groupId]: [optionId] };
      if (selected.length >= maxSelections) return current;
      return { ...current, [groupId]: [...selected, optionId] };
    });
  }
  protected posModifiersValid(): boolean {
    const item = this.selectedPosMenuItem();
    if (!item) return false;
    return (item.modifierGroups ?? []).every(group => {
      const count = (this.posModifiers()[group.id] ?? []).length;
      return count >= group.minSelections && count <= group.maxSelections;
    });
  }
  protected selectedPosModifiersPayload(): Array<{ groupId: string; optionIds: string[] }> {
    const item = this.selectedPosMenuItem();
    return (item?.modifierGroups ?? []).map(group => ({ groupId: group.id, optionIds: this.posModifiers()[group.id] ?? [] })).filter(selection => selection.optionIds.length > 0);
  }

  protected availablePosMenuItems(): MenuItemRow[] { const activeMenus = new Set(this.menus().filter(menu => menu.status === 'active').map(menu => menu.id)); return this.menuItems().filter(item => item.status === 'active' && item.availability !== 'unavailable' && activeMenus.has(item.menuId)); }
  protected refreshWorkspace(): void { void this.loadWorkspace(); }
  protected addProduct(): void { this.activeNav.set('Products'); this.editingProduct.set(null); this.productSaveError.set(''); this.productEditorOpen.set(true); }
  protected editProduct(product: ProductRow): void { this.editingProduct.set(product); this.productSaveError.set(''); this.productEditorOpen.set(true); }
  protected closeProductEditor(): void { if (!this.productSaveBusy()) { this.productEditorOpen.set(false); this.editingProduct.set(null); } }
  protected async uploadProductImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; const product = this.editingProduct();
    if (!file || !product) return;
    this.imageUploadError.set(''); this.imageUploadNote.set('');
    const maxWidth = Math.floor(this.imageMaxWidth()); const maxHeight = Math.floor(this.imageMaxHeight());
    if (!Number.isInteger(maxWidth) || !Number.isInteger(maxHeight) || maxWidth < 64 || maxHeight < 64 || maxWidth > 2400 || maxHeight > 2400) { this.imageUploadError.set('Choose maximum width and height between 64 and 2400 pixels.'); input.value = ''; return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { this.imageUploadError.set('Choose a JPEG, PNG or WebP image.'); input.value = ''; return; }
    if (file.size > 25 * 1024 * 1024) { this.imageUploadError.set('The original image must be 25 MB or smaller.'); input.value = ''; return; }
    this.imageUploadBusy.set(true);
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('This image has too many pixels. Choose a smaller original.'); }
      const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height); const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha: false }); if (!context) { bitmap.close(); throw new Error('Your browser could not prepare the image.'); }
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      let optimized: Blob | null = null;
      for (const quality of [0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46, 0.40]) { optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality)); if (optimized && optimized.size <= 1024 * 1024) break; }
      if (!optimized) throw new Error('Your browser could not encode this image as WebP.');
      if (optimized.size > 1024 * 1024) {
        const scaledCanvas = document.createElement('canvas');
        let scaleDown = 0.85;
        while ((optimized?.size ?? Infinity) > 1024 * 1024 && scaleDown >= 0.35) {
          scaledCanvas.width = Math.max(1, Math.floor(canvas.width * scaleDown));
          scaledCanvas.height = Math.max(1, Math.floor(canvas.height * scaleDown));
          const scaledContext = scaledCanvas.getContext('2d', { alpha: false });
          if (!scaledContext) break;
          scaledContext.fillStyle = '#ffffff'; scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
          scaledContext.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
          for (const quality of [0.72, 0.62, 0.52, 0.42]) {
            optimized = await new Promise<Blob | null>((resolve) => scaledCanvas.toBlob(resolve, 'image/webp', quality));
            if (optimized && optimized.size <= 1024 * 1024) break;
          }
          if (optimized && optimized.size <= 1024 * 1024) break;
          scaleDown *= 0.85;
        }
        if (optimized && optimized.size <= 1024 * 1024) { canvas.width = scaledCanvas.width; canvas.height = scaledCanvas.height; }
      }
      if (!optimized || optimized.size > 4096 * 1024) throw new Error('This image is still larger than 4096 KB after compression. Reduce its dimensions and try again.');
      const response = await fetch(this.apiClient.url('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/products/' + encodeURIComponent(product.id) + '/media'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/webp', 'X-Image-Alt': this.imageAltText().trim(), 'X-Image-Position': '0' }, body: optimized });
      const payload = await response.json().catch(() => ({})) as { data?: { contentUrl?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'The image could not be uploaded.');
      this.imageUploadNote.set('Uploaded ' + canvas.width + ' × ' + canvas.height + ' WebP · ' + (optimized.size / 1024).toFixed(0) + ' KB. Original: ' + (file.size / 1024).toFixed(0) + ' KB.');
      await this.loadWorkspace();
    } catch (error) { this.imageUploadError.set(error instanceof Error ? error.message : 'Could not prepare or upload the image.'); }
    finally { this.imageUploadBusy.set(false); input.value = ''; }
  }
  protected async saveProduct(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(values.get('name') ?? '').trim();
    const editing = this.editingProduct();
    const slug = String(values.get('slug') ?? '').trim();
    const description = String(values.get('description') ?? '').trim() || null;
    const price = Number(values.get('price'));
    if (!Number.isFinite(price) || price < 0) { this.productSaveError.set('Enter a valid non-negative price.'); return; }
    const sku = String(values.get('sku') ?? '').trim() || null;
    this.productSaveBusy.set(true); this.productSaveError.set('');
    try {
      if (editing) {
        await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/products/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH', body: JSON.stringify({
            name, slug, description, status: String(values.get('status') ?? 'draft'),
            categoryIds: values.getAll('categoryIds').map(String),
            variant: { id: editing.variantId, sku, title: name, amountMinor: Math.round(price * 100), currency: editing.currency }
          })
        });
      } else {
        await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/products`, { method: 'POST', body: JSON.stringify({
          storeId: this.storeId(), slug, name, description, status: 'draft', kind: 'physical',
          availabilityStatus: 'available', availabilityNote: null, attributes: {}, categoryIds: values.getAll('categoryIds').map(String),
          variants: [{ id: crypto.randomUUID(), sku, title: name, options: {}, amountMinor: Math.round(price * 100), currency: this.storeCurrency(), status: 'active', barcode: null, weightGrams: null, metadata: {} }]
        }) });
      }
      this.productEditorOpen.set(false);
      this.editingProduct.set(null);
      await this.loadWorkspace();
      this.notify(editing ? 'Product changes saved.' : 'Draft product saved to your catalog.');
    } catch (error) {
      this.productSaveError.set(error instanceof Error ? error.message : 'Could not save this product.');
    } finally { this.productSaveBusy.set(false); }
  }
  protected async createCustomer(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const displayName = String(values.get('displayName') ?? '').trim() || null;
    const email = String(values.get('email') ?? '').trim() || null;
    const phone = String(values.get('phone') ?? '').trim() || null;
    if (!displayName && !email && !phone) { this.customerSaveError.set('Enter a name, email or phone number.'); return; }
    this.customerSaveBusy.set(true); this.customerSaveError.set('');
    try {
      const customer = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/customers', {
        method: 'POST', body: JSON.stringify({ displayName, email, phone, metadata: {} })
      });
      this.customers.update((rows) => [{ id: String(customer.id), displayName: String(customer.displayName ?? ''), email: customer.email ?? null, phone: customer.phone ?? null }, ...rows]);
      this.customerFormOpen.set(false); this.notify('Customer saved to your database.');
    } catch (error) { this.customerSaveError.set(error instanceof Error ? error.message : 'Could not save this customer.'); }
    finally { this.customerSaveBusy.set(false); }
  }

  protected toggleCustomerForm(): void { this.customerFormOpen.update((value) => !value); }

  protected locationOptions(): { id: string; name: string }[] {
    const unique = new Map<string, string>();
    for (const item of this.inventory()) unique.set(item.locationId, item.locationName);
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }

  protected async createInventoryLevel(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const locationId = String(values.get('locationId') ?? '');
    const variantId = String(values.get('variantId') ?? '');
    const quantityOnHand = Number(values.get('quantityOnHand'));
    const rawReorderPoint = String(values.get('reorderPoint') ?? '').trim();
    const reorderPoint = rawReorderPoint ? Number(rawReorderPoint) : null;
    if (!locationId || !variantId || !Number.isInteger(quantityOnHand) || quantityOnHand < 0 || (reorderPoint !== null && (!Number.isInteger(reorderPoint) || reorderPoint < 0))) {
      this.inventoryError.set('Choose a location and product, then enter valid non-negative whole-number quantities.'); return;
    }
    this.inventoryBusy.set(true); this.inventoryError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
        method: 'PUT', body: JSON.stringify({ locationId, variantId, quantityOnHand, reorderPoint })
      });
      await this.loadWorkspace(); this.notify('Stock level saved.');
    } catch (error) { this.inventoryError.set(error instanceof Error ? error.message : 'Could not set stock level.'); }
    finally { this.inventoryBusy.set(false); }
  }

  protected async createInventoryLocation(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(values.get('name') ?? '').trim();
    if (!name) return;
    this.inventoryBusy.set(true); this.inventoryError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/locations', {
        method: 'POST', body: JSON.stringify({ storeId: this.storeId(), name })
      });
      await this.loadWorkspace(); this.notify('Inventory location created.');
    } catch (error) { this.inventoryError.set(error instanceof Error ? error.message : 'Could not create the inventory location.'); }
    finally { this.inventoryBusy.set(false); }
  }

  protected async adjustInventory(event: Event, item: InventoryRow): Promise<void> {
    event.preventDefault();
    if (!item.variantId) return;
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const quantityOnHand = Number(values.get('quantityOnHand'));
    const rawReorderPoint = String(values.get('reorderPoint') ?? '').trim();
    const reorderPoint = rawReorderPoint ? Number(rawReorderPoint) : null;
    if (!Number.isInteger(quantityOnHand) || quantityOnHand < 0 || (reorderPoint !== null && (!Number.isInteger(reorderPoint) || reorderPoint < 0))) {
      this.inventoryError.set('Stock quantities and reorder points must be non-negative whole numbers.'); return;
    }
    this.inventoryBusy.set(true); this.inventoryError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
        method: 'PUT', body: JSON.stringify({ locationId: item.locationId, variantId: item.variantId, quantityOnHand, reorderPoint })
      });
      await this.loadWorkspace(); this.notify('Stock level updated.');
    } catch (error) { this.inventoryError.set(error instanceof Error ? error.message : 'Could not update stock.'); }
    finally { this.inventoryBusy.set(false); }
  }

  protected openQrStudio(): void { if (typeof window !== 'undefined') window.location.assign('/qr'); }
  protected notify(message: string): void { this.toast.set(message); globalThis.setTimeout(() => { if (this.toast() === message) this.toast.set(''); }, 3000); }
}
