import { Component, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import { MenuItemRow, MenuRow, OrderRow, PosCartLine, ProductRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-pos-workspace',
  standalone: true,
  templateUrl: './pos-workspace.component.html',
  styleUrl: './pos-workspace.component.css'
})
export class PosWorkspaceComponent {
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  readonly products = input<ProductRow[]>([]);
  readonly menus = input<MenuRow[]>([]);
  readonly menuItems = input<MenuItemRow[]>([]);
  readonly storeCurrency = input('MAD');
  readonly notifyRequested = output<string>();
  readonly dataChanged = output<void>();

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
  private posOrderIdempotencyKey = '';
  protected readonly posError = signal('');
  protected readonly posCartError = signal('');
  protected readonly paymentMethod = signal('cash');
  private loadSequence = 0;

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      if (organizationId && storeId) void this.loadPosData();
    });
    effect(() => {
      const products = this.products();
      const selected = this.posVariantId();
      if (!selected || !products.some(product => product.variantId === selected && product.status === 'Active')) {
        this.posVariantId.set(products.find(product => product.status === 'Active' && product.variantId)?.variantId ?? '');
      }
    });
  }

  private async loadPosData(): Promise<void> {
    const organizationId = this.organizationId(), storeId = this.storeId();
    if (!organizationId || !storeId) return;
    const sequence = ++this.loadSequence;
    this.posBusy.set(true); this.posError.set('');
    try {
      const [sessions, orders] = await Promise.all([
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/pos/sessions'),
        this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/stores/' + encodeURIComponent(storeId) + '/pos/orders')
      ]);
      if (sequence !== this.loadSequence) return;
      this.posSessions.set(Array.isArray(sessions) ? sessions : []);
      this.posOrders.set(Array.isArray(orders) ? orders : []);
      const openSession = this.posSessions().find(session => session.status === 'open');
      this.selectedPosSessionId.set(openSession ? String(openSession.id) : '');
    } catch (error) {
      if (sequence === this.loadSequence) this.posError.set(error instanceof Error ? error.message : 'Could not load POS registers and orders.');
    } finally {
      if (sequence === this.loadSequence) this.posBusy.set(false);
    }
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
      this.notifyRequested.emit('POS register opened.');
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
      this.notifyRequested.emit('POS register closed.');
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
    this.notifyRequested.emit('Item added to the POS ticket.');
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
    if (!this.posOrderIdempotencyKey) this.posOrderIdempotencyKey = 'merchant-pos-' + crypto.randomUUID();
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          sessionId, channel: 'pos', fulfillment: this.posFulfillment(),
          customerNote: this.posCustomerNote().trim() || null,
          idempotencyKey: this.posOrderIdempotencyKey,
          items: this.posCart().map(line => ({
            sourceType: line.sourceType, sourceItemId: line.sourceItemId,
            ...(line.sourceVariantId ? { sourceVariantId: line.sourceVariantId } : {}),
            quantity: line.quantity, ...(line.metadata ? { metadata: line.metadata } : {})
          }))
        })
      });
      const rows = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
      this.posOrders.set(Array.isArray(rows) ? rows : []);
      this.dataChanged.emit();
      this.posOrderIdempotencyKey = '';
      this.posQuantity.set('1'); this.posCustomerNote.set(''); this.posCart.set([]); this.posCartError.set('');
      this.notifyRequested.emit('POS order created with server-calculated pricing.');
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
        this.notifyRequested.emit('This order is already fully paid.');
        return;
      }
      await this.apiClient.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          method: this.paymentMethod(),
          status: 'succeeded',
          amountMinor: balance,
          note: 'Recorded from merchant POS',
          idempotencyKey: 'pos-payment-' + order.id + '-' + balance + '-' + this.paymentMethod()
        })
      });
      await this.loadPosData();
      this.dataChanged.emit();
      this.notifyRequested.emit('Offline payment recorded. No external payment was processed.');
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
      this.dataChanged.emit();
      this.notifyRequested.emit('POS order status updated and audited.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not update this POS order.');
    } finally { this.posSaveBusy.set(false); }
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
