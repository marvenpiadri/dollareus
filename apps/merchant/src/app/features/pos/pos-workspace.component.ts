import { Component, input, output } from '@angular/core';
import { MenuItemRow, OrderRow, PosCartLine, ProductRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-pos-workspace',
  standalone: true,
  templateUrl: './pos-workspace.component.html',
  styleUrl: './pos-workspace.component.css'
})
export class PosWorkspaceComponent {
  readonly hasOpenPosSession = input(false);
  readonly posError = input('');
  readonly posSessionLabel = input('');
  readonly posTerminalType = input('counter');
  readonly posBusy = input(false);
  readonly selectedPosSessionId = input('');
  readonly posSessions = input<any[]>([]);
  readonly posSourceType = input('product');
  readonly posVariantId = input('');
  readonly products = input<ProductRow[]>([]);
  readonly availablePosMenuItems = input<MenuItemRow[]>([]);
  readonly selectedPosMenuItem = input<MenuItemRow | null>(null);
  readonly posModifiers = input<Record<string, string[]>>({});
  readonly storeCurrency = input('MAD');
  readonly posQuantity = input('1');
  readonly posFulfillment = input('pickup');
  readonly posCustomerNote = input('');
  readonly posSaveBusy = input(false);
  readonly posModifiersValid = input(true);
  readonly posCart = input<PosCartLine[]>([]);
  readonly posCartTotalMinor = input(0);
  readonly posCartError = input('');
  readonly paymentMethod = input('cash');
  readonly posOrders = input<OrderRow[]>([]);

  readonly createPosSessionRequested = output<Event>();
  readonly posSessionLabelChangeRequested = output<string>();
  readonly posTerminalTypeChangeRequested = output<string>();
  readonly selectedPosSessionIdChangeRequested = output<string>();
  readonly closePosSessionRequested = output<void>();
  readonly addPosCartItemRequested = output<Event>();
  readonly posSourceTypeChangeRequested = output<string>();
  readonly posVariantIdChangeRequested = output<string>();
  readonly togglePosModifierRequested = output<{ groupId: string; optionId: string; checked: boolean; maxSelections: number }>();
  readonly posQuantityChangeRequested = output<string>();
  readonly posFulfillmentChangeRequested = output<string>();
  readonly posCustomerNoteChangeRequested = output<string>();
  readonly removePosCartItemRequested = output<string>();
  readonly createPosOrderRequested = output<void>();
  readonly paymentMethodChangeRequested = output<string>();
  readonly recordPosPaymentRequested = output<OrderRow>();
  readonly updatePosOrderStatusRequested = output<{ order: OrderRow; status: string }>();

  protected money(minor: number, currency: string): string {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }
  protected statusClass(status: string): string {
    const value = status.toLowerCase();
    return value === 'confirmed' || value === 'processing' ? 'processing' : value === 'completed' || value === 'paid' ? 'paid' : value === 'cancelled' || value === 'refunded' ? 'draft' : 'pending';
  }
  protected orderStatusLabel(status: string): string {
    return status ? status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ') : 'Unknown';
  }
}
