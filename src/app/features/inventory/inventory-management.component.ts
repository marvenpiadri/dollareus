import { Component, input, output } from '@angular/core';
import { InventoryRow, ProductRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-inventory-management',
  standalone: true,
  templateUrl: './inventory-management.component.html',
  styleUrl: './inventory-management.component.css'
})
export class InventoryManagementComponent {
  readonly inventory = input.required<InventoryRow[]>();
  readonly products = input.required<ProductRow[]>();
  readonly locationOptions = input.required<{ id: string; name: string }[]>();
  readonly inventoryError = input('');
  readonly inventoryBusy = input(false);
  readonly createLocationRequested = output<Event>();
  readonly createLevelRequested = output<Event>();
  readonly adjustRequested = output<{ event: Event; item: InventoryRow }>();
}
