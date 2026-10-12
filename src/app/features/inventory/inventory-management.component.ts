import { Component, computed, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import { InventoryRow, ProductRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-inventory-management',
  standalone: true,
  templateUrl: './inventory-management.component.html',
  styleUrl: './inventory-management.component.css'
})
type InventoryMovement = { id: string; locationName: string; productName: string; variantTitle: string; movementType: string; quantityDelta: number; quantityAfter: number; referenceType: string | null; referenceId: string | null; note: string | null; createdAt: string };

export class InventoryManagementComponent {
  readonly inventory = input.required<InventoryRow[]>();
  readonly products = input.required<ProductRow[]>();
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  readonly notifyRequested = output<string>();
  readonly dataChanged = output<void>();
  protected readonly inventoryError = signal('');
  protected readonly inventoryBusy = signal(false);
  protected readonly currentStoreInventory = computed(() => this.inventory().filter(item => item.storeId === this.storeId()));
  protected readonly movementHistory = signal<InventoryMovement[]>([]);
  protected readonly movementHistoryError = signal('');
  private movementLoadVersion = 0;

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      if (organizationId && storeId) void this.loadMovementHistory(organizationId, storeId);
    });
  }

  private async loadMovementHistory(organizationId = this.organizationId(), storeId = this.storeId()): Promise<void> {
    const version = ++this.movementLoadVersion;
    try {
      const rows = await this.apiClient.request<InventoryMovement[]>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/inventory/movements?storeId=${encodeURIComponent(storeId)}&limit=100`);
      if (version === this.movementLoadVersion && organizationId === this.organizationId() && storeId === this.storeId()) {
        this.movementHistory.set(Array.isArray(rows) ? rows : []);
        this.movementHistoryError.set('');
      }
    } catch (error) {
      if (version === this.movementLoadVersion) this.movementHistoryError.set(error instanceof Error ? error.message : 'Could not load stock movement history.');
    }
  }

  protected locationOptions(): { id: string; name: string }[] {
    const unique = new Map<string, string>();
    for (const item of this.currentStoreInventory()) unique.set(item.locationId, item.locationName);
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
      this.inventoryError.set('Choose a location and product, then enter valid non-negative whole-number quantities.');
      return;
    }
    this.inventoryBusy.set(true); this.inventoryError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
        method: 'PUT', body: JSON.stringify({ locationId, variantId, quantityOnHand, reorderPoint })
      });
      this.dataChanged.emit();
      await this.loadMovementHistory();
      this.notifyRequested.emit('Stock level saved.');
    } catch (error) {
      this.inventoryError.set(error instanceof Error ? error.message : 'Could not set stock level.');
    } finally {
      this.inventoryBusy.set(false);
    }
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
      this.dataChanged.emit();
      this.notifyRequested.emit('Inventory location created.');
    } catch (error) {
      this.inventoryError.set(error instanceof Error ? error.message : 'Could not create the inventory location.');
    } finally {
      this.inventoryBusy.set(false);
    }
  }

  protected async adjustInventory(event: Event, item: InventoryRow): Promise<void> {
    event.preventDefault();
    if (!item.variantId) return;
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const quantityOnHand = Number(values.get('quantityOnHand'));
    const rawReorderPoint = String(values.get('reorderPoint') ?? '').trim();
    const reorderPoint = rawReorderPoint ? Number(rawReorderPoint) : null;
    if (!Number.isInteger(quantityOnHand) || quantityOnHand < 0 || (reorderPoint !== null && (!Number.isInteger(reorderPoint) || reorderPoint < 0))) {
      this.inventoryError.set('Stock quantities and reorder points must be non-negative whole numbers.');
      return;
    }
    this.inventoryBusy.set(true); this.inventoryError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
        method: 'PUT', body: JSON.stringify({ locationId: item.locationId, variantId: item.variantId, quantityOnHand, reorderPoint })
      });
      this.dataChanged.emit();
      await this.loadMovementHistory();
      this.notifyRequested.emit('Stock level updated.');
    } catch (error) {
      this.inventoryError.set(error instanceof Error ? error.message : 'Could not update stock.');
    } finally {
      this.inventoryBusy.set(false);
    }
  }
}
