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
  readonly storeName = input('');
  readonly products = input<ProductRow[]>([]);
  readonly menus = input<MenuRow[]>([]);
  readonly menuItems = input<MenuItemRow[]>([]);
  readonly storeCurrency = input('MAD');
  readonly notifyRequested = output<string>();
  readonly dataChanged = output<void>();

  protected readonly posSessions = signal<any[]>([]);
  protected readonly posLocations = signal<Array<{ id: string; name: string }>>([]);
  protected readonly selectedPosLocationId = signal('');
  protected readonly posOrders = signal<any[]>([]);
  protected readonly selectedPosSessionId = signal('');
  protected readonly posSessionLabel = signal('Main register');
  protected readonly posTerminalType = signal('retail');
  protected readonly posVariantId = signal('');
  protected readonly posSourceType = signal<'product' | 'service' | 'menu_item'>('product');
  protected readonly posModifiers = signal<Record<string, string[]>>({});
  protected readonly posCart = signal<PosCartLine[]>([]);
  protected readonly posQuantity = signal('1');
  protected readonly posFulfillment = signal('counter');
  protected readonly posTableLabel = signal('');
  protected readonly posCustomerNote = signal('');
  protected readonly posBusy = signal(false);
  protected readonly posSaveBusy = signal(false);
  private posOrderIdempotencyKey = '';
  protected readonly posError = signal('');
  protected readonly posCartError = signal('');
  protected readonly paymentMethod = signal('cash');
  protected readonly paymentTarget = signal<any | null>(null);
  protected readonly paymentRecords = signal<any[]>([]);
  protected readonly paymentBalanceMinor = signal(0);
  protected readonly paymentAmount = signal('');
  protected readonly paymentRecordStatus = signal<'pending' | 'succeeded'>('succeeded');
  protected readonly paymentReference = signal('');
  protected readonly paymentNote = signal('');
  private loadSequence = 0;

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      const storeId = this.storeId();
      if (organizationId && storeId) void this.loadPosData();
    });
    effect(() => {
      const sourceType = this.posSourceType();
      if (sourceType !== 'product' && sourceType !== 'service') return;
      const products = this.products();
      const selected = this.posVariantId();
      const activeVariants = products.filter(product => product.status === 'Active' && (sourceType === 'service' ? product.kind === 'service' : product.kind !== 'service')).flatMap(product =>
        (product.variants?.length ? product.variants : product.variantId ? [{ id: product.variantId }] : []).filter(variant => !!variant.id)
      );
      if (!selected || !activeVariants.some(variant => variant.id === selected)) {
        this.posVariantId.set(activeVariants[0]?.id ?? '');
      }
    });
  }

  protected async refreshPosData(): Promise<void> {
    await this.loadPosData();
    if (!this.posError()) this.notifyRequested.emit('POS registers and orders refreshed from the server.');
  }

  private async refreshPosOrders(): Promise<boolean> {
    try {
      const rows = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
      this.posOrders.set(Array.isArray(rows) ? rows : []);
      return true;
    } catch {
      return false;
    }
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
      let openSession = this.posSessions().find(session => session.status === 'open');
      this.selectedPosSessionId.set(openSession ? String(openSession.id) : '');
      try {
        const inventory = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(organizationId) + '/inventory');
        const locationRows = Array.isArray(inventory) ? inventory : [];
        const unique = new Map<string, { id: string; name: string }>();
        for (const row of locationRows as any[]) {
          if (row.storeId !== storeId || row.locationStatus === 'archived' || !row.locationId) continue;
          unique.set(String(row.locationId), { id: String(row.locationId), name: String(row.locationName ?? 'Stock location') });
        }
        this.posLocations.set([...unique.values()]);
        const sessionLocation = openSession?.locationId ? String(openSession.locationId) : '';
        this.selectedPosLocationId.set(sessionLocation || this.posLocations()[0]?.id || '');
      } catch {
        this.posLocations.set([]);
        this.selectedPosLocationId.set(openSession?.locationId ? String(openSession.locationId) : '');
      }
    } catch (error) {
      if (sequence === this.loadSequence) this.posError.set(error instanceof Error ? error.message : 'Could not load POS registers and orders.');
    } finally {
      if (sequence === this.loadSequence) this.posBusy.set(false);
    }
  }

  protected hasOpenPosSession(): boolean { return this.posSessions().some((session: any) => session.status === 'open'); }
  protected selectPosSession(sessionId: string): void {
    this.selectedPosSessionId.set(sessionId);
    const session = this.posSessions().find(row => String(row.id) === sessionId);
    if (session?.locationId) this.selectedPosLocationId.set(String(session.locationId));
  }
  protected selectedPosSessionNeedsLocation(): boolean {
    const session = this.posSessions().find(row => String(row.id) === this.selectedPosSessionId());
    const hasTrackedRetailItems = this.products().some(product => product.status === 'Active' && (product.kind === 'physical' || product.kind === 'food') && (product.stock !== null || product.variants?.some(variant => variant.stock !== null)));
    return !!session && !session.locationId && hasTrackedRetailItems;
  }

  protected async createPosSession(event: Event): Promise<void> {
    event.preventDefault();
    const label = this.posSessionLabel().trim();
    if (!label) { this.posError.set('Enter a register name.'); return; }
    this.posBusy.set(true); this.posError.set('');
    try {
      const session = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/sessions', {
        method: 'POST', body: JSON.stringify({ label, terminalType: this.posTerminalType(), locationId: this.selectedPosLocationId() || null })
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

  protected changePosSourceType(value: string): void {
    if (value !== 'product' && value !== 'service' && value !== 'menu_item') return;
    this.posSourceType.set(value);
    this.posVariantId.set('');
    this.posModifiers.set({});
    if (value === 'service') this.posFulfillment.set('service');
  }

  protected addPosCartItem(event: Event): void {
    event.preventDefault();
    const variantId = this.posVariantId();
    const quantity = Number(this.posQuantity());
    const sourceType = this.posSourceType();
    const productType = sourceType === 'product' || sourceType === 'service';
    const product = productType ? this.products().find(row =>
      row.status === 'Active' &&
      (sourceType === 'service' ? row.kind === 'service' : row.kind !== 'service') &&
      (row.variants?.some(variant => variant.id === variantId) || row.variantId === variantId)
    ) : null;
    const productVariant = product?.variants?.find(variant => variant.id === variantId) ?? (product ? {
      id: product.variantId, title: 'Default', sku: product.sku, priceMinor: product.priceMinor,
      currency: product.currency, stock: product.stock
    } : null);
    const menuItem = sourceType === 'menu_item' ? this.selectedPosMenuItem() : null;
    if (!this.selectedPosSessionId() || (productType ? !product : !menuItem) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || (sourceType === 'menu_item' && !this.posModifiersValid())) {
      this.posCartError.set('Choose an open register, a valid active item, quantity, and all required modifier options.');
      return;
    }
    const modifiers = sourceType === 'menu_item' ? this.selectedPosModifiersPayload() : [];
    const modifierDelta = modifiers.reduce((sum, selection) => {
      const group = menuItem?.modifierGroups?.find(candidate => candidate.id === selection.groupId);
      return sum + selection.optionIds.reduce((subtotal, optionId) => subtotal + Number(group?.options.find(option => option.id === optionId)?.priceDeltaMinor ?? 0), 0);
    }, 0);
    const name = productType ? product!.name : menuItem!.name;
    const sourceItemId = productType ? product!.id : menuItem!.id;
    const sourceVariantId = productType ? variantId : undefined;
    const priceAmountMinor = productType ? productVariant!.priceMinor : menuItem!.priceAmountMinor + modifierDelta;
    const currency = productType ? productVariant!.currency : menuItem!.currency;
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
          tableLabel: this.posFulfillment() === 'dine_in' ? this.posTableLabel().trim() || null : null,
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
      this.posQuantity.set('1'); this.posTableLabel.set(''); this.posCustomerNote.set(''); this.posCart.set([]); this.posCartError.set('');
      this.notifyRequested.emit('POS order created with server-calculated pricing.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not create this POS order.');
    } finally { this.posSaveBusy.set(false); }
  }

  protected printPosReceipt(order: any): void {
    if (!order?.id || typeof window === 'undefined') return;
    const receiptWindow = window.open('', '_blank', 'width=420,height=720');
    if (!receiptWindow) {
      this.posError.set('The receipt window was blocked. Allow pop-ups for this site, then try printing again.');
      return;
    }
    const escapeHtml = (value: unknown): string => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const currency = String(order.currency ?? this.storeCurrency());
    const items = Array.isArray(order.items) ? order.items : [];
    const lineRows = items.map((item: any) => {
      const name = escapeHtml(item.name ?? item.productName ?? 'Item');
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const unit = Number(item.unitAmountMinor ?? item.priceAmountMinor ?? 0);
      const total = Number(item.lineTotalMinor ?? item.totalMinor ?? unit * quantity);
      const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const modifiers = Array.isArray(metadata.modifierSnapshot) ? metadata.modifierSnapshot : Array.isArray(metadata.modifiers) ? metadata.modifiers : [];
      const modifierNames = modifiers.flatMap((group: any) =>
        Array.isArray(group.options) ? group.options.map((option: any) => String(option.name ?? '')) :
        Array.isArray(group.optionIds) ? group.optionIds.map(String) : []
      ).filter(Boolean);
      return '<div class="line"><div class="item-name">' + name + '</div>' +
        (modifierNames.length ? '<div class="muted">' + escapeHtml(modifierNames.join(', ')) + '</div>' : '') +
        '<div class="amount"><span>' + quantity + ' × ' + escapeHtml(this.money(unit, currency)) +
        '</span><strong>' + escapeHtml(this.money(total, currency)) + '</strong></div></div>';
    }).join('');
    const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
    const dateLabel = Number.isNaN(createdAt.getTime()) ? new Date().toLocaleString() : createdAt.toLocaleString();
    const fulfillment = escapeHtml(this.orderStatusLabel(String(order.fulfillment ?? 'counter')));
    const table = order.tableLabel ? '<p>Table: ' + escapeHtml(order.tableLabel) + '</p>' : '';
    const payment = escapeHtml(this.orderStatusLabel(String(order.paymentStatus ?? 'unpaid')));
    receiptWindow.document.open();
    receiptWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt #' + escapeHtml(order.orderNumber ?? order.id) + '</title><style>' +
      '*{box-sizing:border-box}body{font:12px/1.45 Arial,sans-serif;color:#111;margin:0 auto;padding:5mm;width:72mm}h1{font-size:18px;text-align:center;margin:0 0 4px}p{margin:3px 0}.center{text-align:center}.muted{color:#555;font-size:10px}.rule{border:0;border-top:1px dashed #777;margin:10px 0}.line{padding:5px 0;border-bottom:1px dotted #ddd}.item-name{font-weight:700;overflow-wrap:anywhere}.amount{display:flex;justify-content:space-between;gap:8px;margin-top:3px}.totals{display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:700}.footer{text-align:center;margin-top:14px}.actions{text-align:center;margin:0 0 12px}button{padding:8px 14px}@media print{body{width:72mm;padding:0}.actions{display:none}@page{size:80mm auto;margin:4mm}}' +
      '</style></head><body><div class="actions"><button onclick="window.print()">Print receipt</button> <button onclick="window.close()">Close</button></div><h1>' + escapeHtml(this.storeName() || 'Sales receipt') + '</h1><p class="center">Sales receipt · In-store purchase</p><hr class="rule"><p><strong>Order #' + escapeHtml(order.orderNumber ?? order.id) + '</strong></p><p>' + escapeHtml(dateLabel) + '</p><p>Order: ' + escapeHtml(this.orderStatusLabel(String(order.status ?? 'pending'))) + '</p><p>Payment: ' + payment + '</p><p>Fulfillment: ' + fulfillment + '</p>' + table + '<hr class="rule">' + lineRows + '<hr class="rule"><div class="totals"><span>Total</span><span>' + escapeHtml(this.money(Number(order.totalMinor ?? 0), currency)) + '</span></div><p>Subtotal and tax are not itemized in this receipt.</p><hr class="rule"><div class="footer">Thank you for your purchase.</div><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)});</script></body></html>');
    receiptWindow.document.close();
    receiptWindow.focus();
    this.posError.set('');
  }

  protected async openPosPaymentForm(order: any): Promise<void> {
    if (!order?.id || ['cancelled', 'refunded'].includes(String(order.status)) || order.paymentStatus === 'refunded') return;
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      const endpoint = '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.id) + '/payments';
      const details = await this.apiClient.request(endpoint);
      const balance = Number(details?.balanceMinor);
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('The order payment balance could not be verified.');
      this.paymentTarget.set(order);
      this.paymentBalanceMinor.set(balance);
      this.paymentRecords.set(Array.isArray(details?.payments) ? details.payments : []);
      this.paymentAmount.set((balance / 100).toFixed(2));
      this.paymentRecordStatus.set('succeeded');
      this.paymentReference.set('');
      this.paymentNote.set('');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not load the payment balance.');
    } finally {
      this.posSaveBusy.set(false);
    }
  }

  protected closePosPaymentForm(): void {
    this.paymentTarget.set(null);
    this.paymentRecords.set([]);
    this.paymentBalanceMinor.set(0);
    this.paymentAmount.set('');
    this.paymentReference.set('');
    this.paymentNote.set('');
  }

  protected async updatePosPaymentStatus(order: any, payment: any, status: 'succeeded' | 'cancelled'): Promise<void> {
    if (!order?.id || !payment?.id || payment.status !== 'pending') return;
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) +
        '/orders/' + encodeURIComponent(order.id) + '/payments/' + encodeURIComponent(payment.id), {
          method: 'PATCH', body: JSON.stringify({ status })
        });
      const details = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) +
        '/orders/' + encodeURIComponent(order.id) + '/payments');
      this.paymentRecords.set(Array.isArray(details?.payments) ? details.payments : []);
      this.paymentBalanceMinor.set(Math.max(0, Number(details?.balanceMinor) || 0));
      this.paymentAmount.set((this.paymentBalanceMinor() / 100).toFixed(2));
      await this.loadPosData();
      this.dataChanged.emit();
      this.notifyRequested.emit(status === 'succeeded'
        ? 'Payment manually confirmed as received. Dollareus did not process money.'
        : 'Pending payment record cancelled. No money was moved.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not update the payment record.');
    } finally {
      this.posSaveBusy.set(false);
    }
  }

  protected async recordPosPayment(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.paymentTarget();
    if (!order?.id) return;
    const amount = Number(this.paymentAmount());
    const amountMinor = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountMinor) || amountMinor > this.paymentBalanceMinor()) {
      this.posError.set('Enter a valid amount that does not exceed the remaining confirmed balance.');
      return;
    }
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      const endpoint = '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.id) + '/payments';
      await this.apiClient.request(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          method: this.paymentMethod(),
          status: this.paymentRecordStatus(),
          amountMinor,
          reference: this.paymentReference().trim() || null,
          note: this.paymentNote().trim() || 'Manually recorded by merchant',
          idempotencyKey: 'pos-payment-' + order.id + '-' + crypto.randomUUID()
        })
      });
      this.closePosPaymentForm();
      await this.loadPosData();
      this.dataChanged.emit();
      this.notifyRequested.emit(this.paymentRecordStatus() === 'pending'
        ? 'Payment recorded as awaiting confirmation. No money was processed by Dollareus.'
        : 'Payment manually marked as received. No money was processed by Dollareus.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record the payment.';
      const reconciled = await this.refreshPosOrders();
      this.posError.set(reconciled
        ? message + ' The latest order/payment state was reloaded from the server; verify it before retrying.'
        : message + ' The latest order/payment state could not be reloaded. Refresh POS data before retrying.');
    } finally {
      this.posSaveBusy.set(false);
    }
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
      const message = error instanceof Error ? error.message : 'Could not confirm the POS order status update.';
      const reconciled = await this.refreshPosOrders();
      this.posError.set(reconciled
        ? message + ' The latest order state was reloaded from the server; verify it before trying again.'
        : message + ' The latest order state could not be reloaded. Use Refresh POS data before retrying.');
    } finally { this.posSaveBusy.set(false); }
  }

  protected readonly posItemSearch = signal('');

  protected availablePosProducts(): ProductRow[] {
    const query = this.posItemSearch().trim().toLocaleLowerCase();
    return this.products().filter(product => product.status === 'Active' && (this.posSourceType() === 'service' ? product.kind === 'service' : product.kind !== 'service') && (!query ||
      product.name.toLocaleLowerCase().includes(query) ||
      (product.variants ?? []).some(variant =>
        variant.sku.toLocaleLowerCase().includes(query) ||
        variant.title.toLocaleLowerCase().includes(query)
      )
    ));
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
