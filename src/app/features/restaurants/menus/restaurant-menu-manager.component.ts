import { Component, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../../core/api/api-client.service';
import { CategoryRow, MenuItemRow, MenuModifierGroup, MenuRow } from '../../../shared/models/commerce.models';

@Component({
  selector: 'dlr-restaurant-menu-manager',
  standalone: true,
  templateUrl: './restaurant-menu-manager.component.html',
  styleUrl: './restaurant-menu-manager.component.css'
})
export class RestaurantMenuManagerComponent {
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  readonly currency = input('MAD');
  readonly initialMenus = input<MenuRow[] | null>(null);
  readonly initialMenuItems = input<MenuItemRow[] | null>(null);
  readonly initialCategories = input<CategoryRow[] | null>(null);
  readonly notifyRequested = output<string>();
  readonly dataChanged = output<void>();

  protected readonly menus = signal<MenuRow[]>([]);
  protected readonly menuItems = signal<MenuItemRow[]>([]);
  protected readonly categories = signal<CategoryRow[]>([]);
  protected readonly selectedMenuId = signal('');
  protected readonly editingMenuItem = signal<MenuItemRow | null>(null);
  protected readonly editingMenu = signal<MenuRow | null>(null);
  protected readonly menuBusy = signal(false);
  protected readonly menuError = signal('');
  protected readonly categoryBusy = signal(false);

  private loadSequence = 0;

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      const initialMenus = this.initialMenus();
      const initialMenuItems = this.initialMenuItems();
      const initialCategories = this.initialCategories();
      if (!organizationId || !storeId) return;
      if (initialMenus && initialMenuItems && initialCategories) {
        this.menus.set(initialMenus);
        this.menuItems.set(initialMenuItems);
        this.categories.set(initialCategories);
        if (!initialMenus.some(menu => menu.id === this.selectedMenuId())) this.selectedMenuId.set(initialMenus[0]?.id ?? '');
        this.menuBusy.set(false);
        return;
      }
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organizationId();
    const storeId = this.storeId();
    if (!organizationId || !storeId) return;
    const sequence = ++this.loadSequence;
    this.menuBusy.set(true);
    this.menuError.set('');
    try {
      const [menuRows, categoryRows] = await Promise.all([
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/menus'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/categories')
      ]);
      const loadedMenus = Array.isArray(menuRows) ? menuRows as MenuRow[] : [];
      const loadedCategories = Array.isArray(categoryRows) ? categoryRows as CategoryRow[] : [];
      const itemGroups = await Promise.all(loadedMenus.map(menu => this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/menus/' + encodeURIComponent(menu.id) + '/items')));
      if (sequence !== this.loadSequence) return;
      this.menus.set(loadedMenus);
      this.categories.set(loadedCategories);
      this.menuItems.set(itemGroups.flatMap((group, index) => (Array.isArray(group) ? group : []).map((item: any): MenuItemRow => ({
        id: String(item.id), menuId: String(item.menuId ?? loadedMenus[index].id), slug: String(item.slug ?? ''), name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null,
        priceAmountMinor: Number(item.priceAmountMinor ?? 0), currency: String(item.currency ?? this.currency()),
        status: String(item.status ?? 'draft') as MenuItemRow['status'],
        availability: String(item.availability ?? 'available') as MenuItemRow['availability'],
        position: Number(item.position ?? 0),
        categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
        allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
        dietaryLabels: Array.isArray(item.dietaryLabels) ? item.dietaryLabels.map(String) : [],
        modifierGroups: Array.isArray(item.metadata?.modifierGroups) ? item.metadata.modifierGroups as MenuModifierGroup[] : []
      }))));
      if (!loadedMenus.some(menu => menu.id === this.selectedMenuId())) this.selectedMenuId.set(loadedMenus[0]?.id ?? '');
    } catch (error) {
      if (sequence === this.loadSequence) this.menuError.set(error instanceof Error ? error.message : 'Could not load restaurant menus.');
    } finally {
      if (sequence === this.loadSequence) this.menuBusy.set(false);
    }
  }

  protected categoryName(categoryId?: string | null): string {
    return this.categories().find(category => category.id === categoryId)?.name ?? '—';
  }
  protected money(minor: number, currency: string): string {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }
  protected selectedMenuName(): string {
    return this.menus().find(menu => menu.id === this.selectedMenuId())?.name ?? 'Menu';
  }
  protected selectedMenuItems(): MenuItemRow[] {
    return this.menuItems().filter(item => item.menuId === this.selectedMenuId());
  }
  protected modifierGroupsJson(item: MenuItemRow | null): string {
    return JSON.stringify(item?.modifierGroups ?? [], null, 2);
  }

  protected async createCategory(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    if (!name || !slug || !this.storeId()) { this.menuError.set('Enter a category name and URL slug.'); return; }
    this.categoryBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/categories', {
        method: 'POST', body: JSON.stringify({ storeId: this.storeId(), name, slug, description: null, position: this.categories().length, status: 'active' })
      });
      form.reset();
      await this.load(); this.dataChanged.emit();
      this.notifyRequested.emit('Menu category created.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not create category.'); }
    finally { this.categoryBusy.set(false); }
  }
  protected async createMenu(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const servicePeriods = String(values.get('servicePeriods') ?? 'all-day').split(',').map(value => value.trim()).filter(Boolean);
    if (!name || !slug || servicePeriods.length === 0) return;
    this.menuBusy.set(true); this.menuError.set('');
    try {
      const created = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus', {
        method: 'POST', body: JSON.stringify({ storeId: this.storeId(), slug, name, description: description || null, servicePeriods, status: 'draft' })
      });
      await this.load(); this.dataChanged.emit();
      if (created?.id) this.selectedMenuId.set(String(created.id));
      form.reset(); this.notifyRequested.emit('Menu created as a draft.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not create menu.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async saveMenu(event: Event, menu: MenuRow): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const servicePeriods = String(values.get('servicePeriods') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (!name || !slug || servicePeriods.length === 0) {
      this.menuError.set('Provide a name, slug, and at least one service period.');
      return;
    }
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(menu.id), {
        method: 'PATCH', body: JSON.stringify({ name, slug, description: description || null, servicePeriods })
      });
      await this.load(); this.dataChanged.emit();
      this.editingMenu.set(null);
      this.notifyRequested.emit('Menu details updated.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update menu.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async createMenuItem(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    const price = Number(values.get('price'));
    const description = String(values.get('description') ?? '').trim();
    const allergens = String(values.get('allergens') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const dietaryLabels = String(values.get('dietaryLabels') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const categoryId = String(values.get('categoryId') ?? '').trim() || null;
    const menuId = this.selectedMenuId();
    if (!menuId || !name || !slug || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100))) {
      this.menuError.set('Choose a menu and enter a valid item name, slug, and non-negative price.'); return;
    }
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(menuId) + '/items', {
        method: 'POST', body: JSON.stringify({ slug, name, description: description || null, priceAmountMinor: Math.round(price * 100), currency: this.currency(), status: 'draft', categoryId, allergens, dietaryLabels, availability: 'available', metadata: {} })
      });
      await this.load(); this.dataChanged.emit(); form.reset(); this.notifyRequested.emit('Menu item saved as a draft.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not create menu item.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async saveMenuItemDetails(event: Event): Promise<void> {
    event.preventDefault();
    const item = this.editingMenuItem();
    if (!item) return;
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const categoryId = String(values.get('categoryId') ?? '').trim() || null;
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const price = Number(values.get('price'));
    if (!name || !slug || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100))) { this.menuError.set('Enter a valid item name, slug, and non-negative price.'); return; }
    const allergens = String(values.get('allergens') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const dietaryLabels = String(values.get('dietaryLabels') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    let modifierGroups: MenuModifierGroup[];
    try {
      const parsedModifiers: unknown = JSON.parse(String(values.get('modifierGroupsJson') ?? '[]'));
      if (!Array.isArray(parsedModifiers)) throw new Error('Modifier groups must be a JSON array.');
      const groups = parsedModifiers as unknown[];
      const groupIds = new Set<string>();
      modifierGroups = groups.map((rawGroup, groupIndex) => {
        if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
          throw new Error(`Modifier group ${groupIndex + 1} must be an object.`);
        }
        const group = rawGroup as Record<string, unknown>;
        const id = typeof group.id === 'string' ? group.id.trim() : '';
        const groupName = typeof group.name === 'string' ? group.name.trim() : '';
        const minSelections = group.minSelections;
        const maxSelections = group.maxSelections;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || groupIds.has(id)) {
          throw new Error(`Modifier group ${groupIndex + 1} needs a unique lowercase ID.`);
        }
        if (!groupName || groupName.length > 120 || typeof group.required !== 'boolean' ||
            !Number.isSafeInteger(minSelections) || !Number.isSafeInteger(maxSelections) ||
            (minSelections as number) < 0 || (maxSelections as number) < (minSelections as number) ||
            (group.required && (minSelections as number) < 1) || !Array.isArray(group.options) ||
            (maxSelections as number) > group.options.length) {
          throw new Error(`Modifier group "${groupName || id}" has invalid names, selection limits, or options.`);
        }
        groupIds.add(id);
        const optionIds = new Set<string>();
        const options = (group.options as unknown[]).map((rawOption, optionIndex) => {
          if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption)) {
            throw new Error(`Option ${optionIndex + 1} in "${groupName}" must be an object.`);
          }
          const option = rawOption as Record<string, unknown>;
          const optionId = typeof option.id === 'string' ? option.id.trim() : '';
          const optionName = typeof option.name === 'string' ? option.name.trim() : '';
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(optionId) || optionIds.has(optionId) ||
              !optionName || optionName.length > 120 || !Number.isSafeInteger(option.priceDeltaMinor)) {
            throw new Error(`Option ${optionIndex + 1} in "${groupName}" needs a unique lowercase ID, name, and integer price delta.`);
          }
          optionIds.add(optionId);
          return { id: optionId, name: optionName, priceDeltaMinor: option.priceDeltaMinor as number };
        });
        return {
          id, name: groupName, required: group.required as boolean,
          minSelections: minSelections as number, maxSelections: maxSelections as number, options
        };
      });
    } catch (error) {
      this.menuError.set(error instanceof Error ? error.message : 'Modifier groups must be valid JSON containing valid groups and options.');
      return;
    }
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/' + encodeURIComponent(item.id), {
        method: 'PATCH', body: JSON.stringify({ name, slug, description: description || null, priceAmountMinor: Math.round(price * 100), categoryId, allergens, dietaryLabels, modifierGroups })
      });
      this.editingMenuItem.set(null);
      await this.load(); this.dataChanged.emit();
      this.notifyRequested.emit('Menu item details updated.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update menu item details.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async moveMenu(menu: MenuRow, delta: -1 | 1): Promise<void> {
    const ordered = [...this.menus()];
    const index = ordered.findIndex(row => row.id === menu.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length || this.menuBusy()) return;
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/menus/reorder', {
        method: 'PUT', body: JSON.stringify({ menuIds: ordered.map(row => row.id) })
      });
      await this.load(); this.dataChanged.emit();
      this.notifyRequested.emit('Menu order saved.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not reorder menus. Reload and try again.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async moveMenuItem(item: MenuItemRow, delta: -1 | 1): Promise<void> {
    const ordered = [...this.selectedMenuItems()];
    const index = ordered.findIndex(row => row.id === item.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length || this.menuBusy()) return;
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/reorder', {
        method: 'PUT', body: JSON.stringify({ itemIds: ordered.map(row => row.id) })
      });
      await this.load(); this.dataChanged.emit();
      this.notifyRequested.emit('Dish order saved.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not reorder dishes. Reload and try again.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuStatus(menu: MenuRow, status: 'draft' | 'active'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(menu.id) + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      await this.load(); this.dataChanged.emit(); this.notifyRequested.emit(status === 'active' ? 'Menu published.' : 'Menu unpublished.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update menu status.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuItemAvailability(item: MenuItemRow, availability: 'available' | 'unavailable' | 'limited'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/' + encodeURIComponent(item.id), { method: 'PATCH', body: JSON.stringify({ availability }) });
      this.menuItems.update(items => items.map(row => row.id === item.id ? { ...row, availability } : row));
      this.dataChanged.emit();
      this.notifyRequested.emit('Item availability updated.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update item availability.'); await this.load(); this.dataChanged.emit(); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuItemStatus(item: MenuItemRow, status: 'draft' | 'active'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/' + encodeURIComponent(item.id), { method: 'PATCH', body: JSON.stringify({ status }) });
      this.menuItems.update(items => items.map(row => row.id === item.id ? { ...row, status } : row));
      this.dataChanged.emit();
      this.notifyRequested.emit(status === 'active' ? 'Menu item published.' : 'Menu item unpublished.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update item status.'); }
    finally { this.menuBusy.set(false); }
  }
  protected refresh(): void { void this.load(); }
}
