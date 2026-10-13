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
import { StorefrontSettingsComponent } from './storefront-settings.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiClientService } from '../../core/api/api-client.service';
import { SessionService } from '../../core/auth/session.service';
import { WorkspaceDataService, StoreSummary } from '../../core/workspace-data.service';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

type NavItem = 'Overview' | 'Orders' | 'POS' | 'Products' | 'Menus' | 'QR Studio' | 'Customers' | 'Inventory' | 'API & channels' | 'Integrations' | 'Settings';
import { ProductStatus, ProductRow, OrderRow, CategoryRow, MenuRow, MenuModifierGroup, MenuItemRow, InventoryRow, FulfillmentStage, ShipmentDetails } from '../../shared/models/commerce.models';


import { PageHeader, Modal } from '../../shared/components';

@Component({
  selector: 'dlr-workspace',
  imports: [AuthPanelComponent, RestaurantMenuManagerComponent, CustomerManagementComponent, InventoryManagementComponent, OverviewDashboardComponent, OrderManagementComponent, ProductCatalogComponent, PosWorkspaceComponent, QrManagementComponent, ApiCredentialsComponent, WorkspaceShellComponent, StorefrontSettingsComponent, PageHeader, Modal],
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
  protected readonly showCreateStore = signal(false);
  protected readonly storeCurrency = signal('MAD');
  protected readonly onboardingStage = signal<'organization' | 'store' | 'ready'>('organization');
  protected readonly organizationId = signal('');
  protected readonly storeId = signal('');
  protected readonly storeName = signal('');
  protected readonly storeSlug = signal('');
  protected readonly stores = signal<StoreSummary[]>([]);

  constructor(private readonly router: Router, private readonly route: ActivatedRoute, private readonly apiClient: ApiClientService, private readonly sessionService: SessionService, private readonly workspaceData: WorkspaceDataService) { this.route.queryParamMap.subscribe(params => { const section = params.get('section'); const valid: NavItem[] = ['Overview', 'Orders', 'POS', 'Products', 'Menus', 'QR Studio', 'Customers', 'Inventory', 'API & channels', 'Integrations', 'Settings']; if (section && valid.includes(section as NavItem)) this.activeNav.set(section as NavItem); }); void this.checkSession(); }

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
      this.stores.set([]);
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem('dollareus:selected-store'); } catch { /* Ignore unavailable browser storage. */ }
      this.onboardingStage.set('organization');
    }
  }
  private preferredStoreId(): string {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem('dollareus:selected-store') ?? '' : ''; }
    catch { return ''; }
  }

  private async loadWorkspace(selectedStoreId = this.storeId() || this.preferredStoreId()): Promise<void> {
    this.workspaceLoading.set(true);
    this.workspaceError.set('');
    this.onboardingError.set('');
    try {
      const snapshot = await this.workspaceData.load(selectedStoreId);
      this.organizationId.set(snapshot.organizationId);
      this.storeId.set(snapshot.storeId);
      try { if (typeof localStorage !== 'undefined' && snapshot.storeId) localStorage.setItem('dollareus:selected-store', snapshot.storeId); } catch { /* Keep workspace usable when browser storage is unavailable. */ }
      this.storeCurrency.set(snapshot.storeCurrency);
      this.storeName.set(snapshot.storeName);
      this.storeSlug.set(snapshot.storeSlug);
      this.stores.set(snapshot.stores);
      this.onboardingStage.set(snapshot.stage);
      this.products.set(snapshot.products);
      this.orders.set(snapshot.orders);
      this.categories.set(snapshot.categories);
      this.inventory.set(snapshot.inventory);
      this.menus.set(snapshot.menus);
      this.menuItems.set(snapshot.menuItems);
    } catch (error) {
      this.workspaceError.set(error instanceof Error ? error.message : 'An unexpected error occurred while loading your workspace.');
    } finally {
      this.workspaceLoading.set(false);
    }
  }

  protected retryWorkspace(): void { void this.loadWorkspace(); }
  protected openCreateStore(): void { this.onboardingError.set(''); this.showCreateStore.set(true); }
  protected closeCreateStore(): void { if (!this.onboardingBusy()) this.showCreateStore.set(false); }

  private detectedTimeZone(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Casablanca'; } catch { return 'Africa/Casablanca'; } }

  private slugify(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'my-business'; }

  protected async createOrganization(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    this.onboardingBusy.set(true); this.onboardingError.set('');
    try {
      const organization = await this.apiClient.request('/api/v1/organizations', { method: 'POST', body: JSON.stringify({ name: String(values.get('name') ?? '').trim(), slug: this.slugify(String(values.get('name') ?? '')) }) });
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
      const businessType = String(values.get('businessType') ?? 'retail');
      const defaultExperience = businessType === 'restaurant' || businessType === 'cafe' ? 'menu' : businessType === 'freelancer' || businessType === 'services' ? 'services' : 'catalog';
      const store = await this.apiClient.request(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/stores`, { method: 'POST', body: JSON.stringify({
        name: String(values.get('name') ?? '').trim(), slug: this.slugify(String(values.get('name') ?? '')), description: null,
        businessType, status: 'active', currency: 'MAD', locale: 'en', timeZone: this.detectedTimeZone(),
        defaultExperience, enabledExperiences: [defaultExperience], published: false, theme: {}
      }) });
      this.storeId.set(store.id); this.storeCurrency.set('MAD'); this.storeName.set(store.name); this.storeSlug.set(store.slug);
      this.onboardingStage.set('ready');
      this.showCreateStore.set(false);
      await this.loadWorkspace(String(store.id));
    } catch (error) {
      this.onboardingError.set(error instanceof Error ? error.message : 'Could not create your store.');
    } finally { this.onboardingBusy.set(false); }
  }

  protected readonly activeNav = signal<NavItem>('Overview');
  protected readonly search = signal('');
  protected readonly toast = signal('');
  protected readonly primaryNav: {label: NavItem; symbol: string}[] = [
    {label:'Overview',symbol:'dashboard'},{label:'Orders',symbol:'receipt_long'},{label:'POS',symbol:'point_of_sale'},{label:'Products',symbol:'inventory_2'},{label:'Menus',symbol:'restaurant_menu'},{label:'QR Studio',symbol:'qr_code_2'},{label:'Customers',symbol:'groups'},{label:'Inventory',symbol:'warehouse'}
  ];
  protected readonly channelNav: {label: NavItem; symbol: string}[] = [{label:'API & channels',symbol:'hub'},{label:'Integrations',symbol:'extension'}];
  protected readonly filters: ('All' | ProductStatus)[] = ['All','Active','Draft','Archived'];
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly openProductEditorRequest = signal(0);
  protected readonly orders = signal<OrderRow[]>([]);
  protected readonly categories = signal<CategoryRow[]>([]);
  protected readonly menus = signal<MenuRow[]>([]);
  protected readonly menuItems = signal<MenuItemRow[]>([]);
  protected readonly inventory = signal<InventoryRow[]>([]);


  protected activeCount(): number { return this.products().filter(p => p.status === 'Active').length; }
  protected lowStockCount(): number { return this.inventory().filter((item) => item.storeId === this.storeId() && item.quantityOnHand !== null && item.reorderPoint !== null && item.quantityOnHand <= item.reorderPoint).length; }
  protected money(minor: number, currency: string): string { return new Intl.NumberFormat('en', {style:'currency',currency,maximumFractionDigits:2}).format(minor / 100); }
  protected categoryName(categoryId?: string | null): string { return this.categories().find(category => category.id === categoryId)?.name ?? '—'; }
  protected statusClass(status: string): string { const value = status.toLowerCase(); return value === 'confirmed' || value === 'processing' ? 'processing' : value === 'completed' || value === 'paid' ? 'paid' : value === 'cancelled' || value === 'refunded' ? 'draft' : 'pending'; }
  protected orderStatusLabel(status: string): string { return status ? status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ') : 'Unknown'; }

  protected pageDescription(): string { return this.activeNav() === 'Products' ? 'Manage your catalog, prices and product availability.' : this.activeNav() === 'QR Studio' ? 'Create and manage branded QR entry points for menus and storefronts.' : this.activeNav() === 'Menus' ? 'Build restaurant menus, publish items, and control availability.' : this.activeNav() === 'Orders' ? 'Review orders and their saved item snapshots.' : this.activeNav() === 'POS' ? 'Open a register and create in-person sales.' : this.activeNav() === 'Customers' ? 'Keep customer contact details and notes together.' : this.activeNav() === 'Inventory' ? 'Track stock by location and reorder threshold.' : 'Configure your business workspace and connected channels.'; }
  protected selectNav(item: NavItem): void {
    this.activeNav.set(item);
    if (item === 'API & channels') return;
    if (item === 'Integrations') { this.notify('Integration connectors are being added after API access.'); return; }
    if (!['Overview','Products','Menus','QR Studio','Orders','POS','Customers','Inventory','Settings'].includes(item)) this.notify(item + ' is planned for a future milestone.');
  }
  protected refreshWorkspace(): void { void this.loadWorkspace(); }
  protected switchStore(storeId: string): void { if (storeId && storeId !== this.storeId()) void this.loadWorkspace(storeId); }
  protected async previewStore(): Promise<void> {
    try {
      const stores = await this.apiClient.request<any[]>('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores');
      const store = (Array.isArray(stores) ? stores : []).find((item: any) => item.id === this.storeId());
      if (!store) throw new Error('The selected store could not be found.');
      if (!store.published) { this.selectNav('Settings'); this.notify('Configure your public address and publish the store in Settings first.'); return; }
      const handle = String(store.publicHandle ?? ''); const location = String(store.locationSlug ?? store.slug ?? '');
      if (!handle || !location) throw new Error('Save a public username and location address in Settings first.');
      await this.router.navigateByUrl('/' + encodeURIComponent(handle) + '/' + encodeURIComponent(location));
    } catch (error) { this.notify(error instanceof Error ? error.message : 'Could not open the public store preview.'); }
  }
  protected addProduct(): void { this.selectNav('Products'); this.openProductEditorRequest.update(value => value + 1); }

  protected openQrStudio(): void { if (typeof window !== 'undefined') window.location.assign('/qr'); }
  protected notify(message: string): void { this.toast.set(message); globalThis.setTimeout(() => { if (this.toast() === message) this.toast.set(''); }, 3000); }
}
