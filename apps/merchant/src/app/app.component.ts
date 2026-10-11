import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AuthPanelComponent } from './auth-panel.component';
import { PublicHomeComponent } from './public-home.component';
import { QrStudioComponent } from './qr-studio.component';

type NavItem = 'Overview' | 'Orders' | 'POS' | 'Products' | 'Menus' | 'QR Studio' | 'Customers' | 'Inventory' | 'API & channels' | 'Integrations' | 'Settings';
type ProductStatus = 'Active' | 'Draft' | 'Archived';
interface ProductRow { id: string; name: string; slug: string; description: string | null; category: string; sku: string; variantId: string; priceMinor: number; currency: string; stock: number | null; status: ProductStatus; initials: string; tone: string; imageUrl: string | null; }
interface OrderRow { id: string; resourceId: string; customer: string; channel: string; totalMinor: number; currency: string; status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded'; paymentStatus: string; }
interface CustomerRow { id: string; displayName: string; email: string | null; phone: string | null; }
interface CategoryRow { id: string; name: string; slug: string; description: string | null; position: number; status: 'draft' | 'active' | 'archived'; }
interface MenuRow { id: string; slug: string; name: string; description: string | null; status: 'draft' | 'active' | 'archived'; servicePeriods: string[]; itemCount: number; }
interface MenuItemRow { id: string; menuId: string; slug: string; name: string; description: string | null; priceAmountMinor: number; currency: string; status: 'draft' | 'active' | 'archived'; availability: 'available' | 'unavailable' | 'limited'; position: number; categoryId?: string | null; allergens?: string[]; dietaryLabels?: string[]; }
interface EntryPointRow { id: string; storeId: string; type: 'direct-link' | 'qr' | 'embed'; targetPath: '/' | '/menu' | '/catalog' | '/services'; targetUrl?: string | null; targetUrlPath?: string; status: 'active' | 'disabled'; branding: { brandName?: string | null; foregroundColor?: string; backgroundColor?: string; accentColor?: string; logoUrl?: string | null; frame?: 'none' | 'bottom-label' | 'top-label'; label?: string | null }; }
interface InventoryRow { locationId: string; locationName: string; storeId: string | null; variantId: string | null; variantTitle: string | null; productName: string | null; quantityOnHand: number | null; quantityReserved: number | null; reorderPoint: number | null; }
type FulfillmentStage = 'preparing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'delivery_failed' | 'returned' | 'cancelled';
interface ShipmentDetails { id: string; orderId: string; stage: FulfillmentStage; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; estimatedDeliveryDate: string | null; notes: string | null; createdAt: string; updatedAt: string; }

@Component({
  selector: 'dlr-root',
  standalone: true,
  imports: [DatePipe, AuthPanelComponent, PublicHomeComponent, QrStudioComponent],
  template: `
    @if (publicPage() === 'home') {
      <dlr-public-home />
    } @else if (publicPage() === 'qr') {
      <dlr-qr-studio />
    } @else if (!authReady()) {
      <main class="auth-loading"><span class="brand-mark">d.</span><p>Preparing your workspace…</p></main>
    } @else if (!authenticated()) {
      <dlr-auth-panel (signedIn)="onSignedIn()" />
    } @else if (workspaceLoading()) {
      <main class="auth-loading"><span class="brand-mark">d.</span><p>Loading your workspace…</p></main>
    } @else if (workspaceError()) {
      <main style="min-height:100vh;display:grid;place-content:center;justify-items:center;gap:12px;padding:24px;background:#f8fafc;color:#0f172a"><span class="brand-mark">d.</span><h1 style="font-size:24px;margin:0">We couldn’t load your workspace</h1><p style="max-width:460px;text-align:center;color:#64748b">{{ workspaceError() }}</p><button class="button primary" type="button" (click)="retryWorkspace()">Try again</button><button type="button" style="border:0;background:none;color:#238636" (click)="signOut()">Sign out</button></main>
    } @else if (onboardingStage() !== 'ready') {
      <main style="min-height:100vh;display:grid;place-content:center;padding:24px;background:#f8fafc;color:#0f172a">
        <section style="width:min(100%,480px);padding:34px;background:white;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 18px 60px #253b1b0b">
          <a class="brand" href="#" style="padding:0 0 24px" (click)="$event.preventDefault()"><span class="brand-mark">d.</span><span>dollareus<small>COMMERCE WORKSPACE</small></span></a>
          @if (onboardingStage() === 'organization') {
            <p class="eyebrow">STEP 1 OF 2</p><h1 style="font-size:26px;margin:0 0 8px">Create your workspace</h1><p style="color:#64748b;font-size:15px;line-height:1.6">Start with your business or organization. You can configure more details later.</p>
            <form style="display:grid;gap:13px;margin-top:22px" (submit)="createOrganization($event)"><label style="display:grid;gap:7px;font-size:14px">Business name<input name="name" required maxlength="180" placeholder="e.g. Atlas Atelier" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:7px;font-size:14px">Workspace URL slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="atlas-atelier" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"><small style="color:#64748b">Lowercase letters, numbers and hyphens only.</small></label>@if (onboardingError()) { <p role="alert" style="color:#a44737;font-size:14px">{{ onboardingError() }}</p> }<button class="button primary" type="submit" [disabled]="onboardingBusy()">{{ onboardingBusy() ? 'Creating…' : 'Create workspace' }}</button></form>
          } @else {
            <p class="eyebrow">STEP 2 OF 2</p><h1 style="font-size:26px;margin:0 0 8px">Create your first store</h1><p style="color:#64748b;font-size:15px;line-height:1.6">Your workspace is ready. Give your first store a name and a unique URL slug.</p>
            <form style="display:grid;gap:13px;margin-top:22px" (submit)="createStore($event)"><label style="display:grid;gap:7px;font-size:14px">Store name<input name="name" required maxlength="180" placeholder="e.g. Atlas Atelier" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:7px;font-size:14px">Store URL slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="atlas-atelier" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"><small style="color:#64748b">Your store is private until publishing is implemented.</small></label>@if (onboardingError()) { <p role="alert" style="color:#a44737;font-size:14px">{{ onboardingError() }}</p> }<button class="button primary" type="submit" [disabled]="onboardingBusy()">{{ onboardingBusy() ? 'Creating…' : 'Create store' }}</button></form>
          }
        </section>
      </main>
    } @else {
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#" (click)="$event.preventDefault(); selectNav('Overview')"><span class="brand-mark">d.</span><span>dollareus<small>COMMERCE WORKSPACE</small></span></a>
        <button class="store-switch" type="button" (click)="notify('Multiple-store switching is not available yet.')"><span class="store-avatar">{{ storeName().slice(0,1).toUpperCase() }}</span><span><b>{{ storeName() }}</b><small>{{ storeSlug() }}</small></span><span class="chevron">⌄</span></button>
        <p class="nav-heading">WORKSPACE</p>
        @for (item of primaryNav; track item.label) {
          <button class="nav-item" [class.active]="activeNav() === item.label" (click)="selectNav(item.label)" type="button"><span class="nav-symbol">{{ item.symbol }}</span>{{ item.label }}@if(item.label === 'Orders' && orders().length > 0){<span class="count">{{ orders().length }}</span>}</button>
        }
        <p class="nav-heading channels-heading">SALES CHANNELS</p>
        @for (item of channelNav; track item.label) {
          <button class="nav-item" [class.active]="activeNav() === item.label" (click)="selectNav(item.label)" type="button"><span class="nav-symbol">{{ item.symbol }}</span>{{ item.label }}</button>
        }
        <div class="sidebar-bottom"><div class="help-card"><span>✳</span><b>Building something?</b><p>Your store, your way. More tools are on the way.</p><button type="button" (click)="notify('The product roadmap will be published soon.')">Explore the roadmap ↗</button></div><button class="nav-item" type="button" (click)="selectNav('Settings')"><span class="nav-symbol">⚙</span>Settings</button><div class="user"><span class="user-avatar">D</span><span><b>Signed-in merchant</b><small>Workspace access</small></span><button type="button" aria-label="Account options" (click)="signOut()" aria-label="Sign out">↪</button></div></div>
      </aside>
      <main class="main">
        <header class="topbar"><div class="breadcrumbs"><span>{{ storeName() }}</span><span>/</span><b>{{ activeNav() }}</b></div><div class="top-actions"><label class="global-search"><span>⌕</span><input aria-label="Search products" placeholder="Search products..." [value]="search()" (input)="search.set($any($event.target).value)"><kbd>⌘ K</kbd></label><button class="icon-button" aria-label="Notifications" type="button" (click)="notify('Notifications are not connected yet.')">♧<i></i></button><span class="demo-pill"><i></i> Connected workspace</span></div></header>
        <div class="content">
          <section class="welcome"><div><p class="eyebrow">— &nbsp; YOUR BUSINESS WORKSPACE</p><h1>{{ activeNav() === 'Overview' ? 'Good morning, welcome back.' : activeNav() }}</h1><p class="subtitle">{{ activeNav() === 'Overview' ? 'Here’s what’s happening with your business today.' : pageDescription() }}</p></div><div class="actions"><button class="button secondary" type="button" (click)="notify('Store preview will be available after publishing is implemented.')">◉ &nbsp; Preview store</button><button class="button primary" type="button" (click)="addProduct()">＋ &nbsp; Add product</button></div></section>
          @if (activeNav() === 'Overview') {
          <section class="setup-banner"><span class="banner-icon">◇</span><div class="banner-copy"><b>Your workspace is connected</b><p>Products, orders, customers and stock levels load from PostgreSQL. Payments, sales analytics and publishing remain to be connected.</p></div><span class="progress"><i></i> Core setup</span><button type="button" (click)="notify('Store publishing is not implemented yet; your store remains private.')">Publishing status →</button></section>
          <section class="metrics">
            <article class="metric"><div class="metric-top"><span>Total sales</span><span class="metric-icon green">↗</span></div><strong>—</strong><footer>Sales analytics not connected</footer></article>
            <article class="metric"><div class="metric-top"><span>Orders</span><span class="metric-icon purple">▤</span></div><strong>{{ orders().length }}</strong><footer>Orders in your database <button type="button" (click)="selectNav('Orders')">View orders →</button></footer></article>
            <article class="metric"><div class="metric-top"><span>Products</span><span class="metric-icon peach">◇</span></div><strong>{{ products().length }} <small>in your catalog</small></strong><footer>{{ activeCount() }} active products <button type="button" (click)="selectNav('Products')">View catalog →</button></footer></article>
            <article class="metric"><div class="metric-top"><span>Low stock alerts</span><span class="metric-icon amber">△</span></div><strong>{{ lowStockCount() }}</strong><footer>Items at or below reorder point</footer></article>
          </section>
          <section class="two-column">
            <article class="panel"><div class="panel-heading"><div><h2>Recent orders</h2><p>A quick look at your latest sales.</p></div><button type="button" (click)="selectNav('Orders')">View all orders →</button></div><div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>CHANNEL</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>@for(order of orders();track order.id){<tr><td class="order-id">{{ order.id }}</td><td>{{ order.customer }}</td><td><span class="channel-dot" [class.mageus]="order.channel === 'Mageus'" [class.pos]="order.channel === 'POS'"></span>{{ order.channel }}</td><td class="total">{{ money(order.totalMinor,order.currency) }}</td><td><span class="status" [class]="statusClass(order.status)">{{ orderStatusLabel(order.status) }}</span></td></tr>} @empty {<tr><td colspan="5" class="empty-state">No orders yet. Orders created through checkout or POS will appear here.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{ orders().length }} recent orders <button type="button" (click)="selectNav('Orders')">Open order manager →</button></div></article>
            <article class="panel channels"><div class="panel-heading"><div><h2>Sales channels</h2><p>Where customers find you.</p></div><button type="button" (click)="selectNav('Integrations')">···</button></div><div class="channel-row"><span class="channel-icon">▣</span><span><b>Custom website / app</b><small>Dollareus API access</small></span><button type="button" (click)="selectNav('API & channels')">Manage API access</button></div><div class="channel-row"><span class="channel-icon mageus-icon">m.</span><span><b>Mageus storefront</b><small>Default public storefront</small></span><button type="button" (click)="notify('Mageus will connect through scoped authorization.')">Connect</button></div><div class="channel-row"><span class="channel-icon">▤</span><span><b>In-person POS</b><small>Sell in person</small></span><button type="button" (click)="notify('POS is planned as a business module.')">Set up</button></div><div class="channel-row"><span class="channel-icon qr-icon">▦</span><span><b>QR commerce</b><small>Menus and product links</small></span><button type="button" (click)="openQrStudio()">Explore</button></div><button class="add-channel" type="button" (click)="selectNav('Integrations')">＋ Add a sales channel</button></article>
          </section>
          }
          @if (activeNav() === 'Overview' || activeNav() === 'Products') {
          <section class="panel product-panel"><div class="panel-heading product-heading"><div><h2>Products</h2><p>Keep your catalog organized and ready to sell.</p></div><div class="product-actions"><label class="product-search">⌕ <input aria-label="Filter products" placeholder="Search products..." [value]="search()" (input)="search.set($any($event.target).value)"></label><button class="button primary small" type="button" (click)="addProduct()">＋ Add product</button></div></div><div class="filters">@for(filter of filters;track filter){<button type="button" [class.selected]="productFilter() === filter" (click)="productFilter.set(filter)">{{ filter }} <span>{{ filterCount(filter) }}</span></button>}</div><div class="table-wrap"><table class="products-table"><thead><tr><th>PRODUCT</th><th>STATUS</th><th>INVENTORY</th><th>CATEGORY</th><th>PRICE</th><th></th></tr></thead><tbody>@for(product of filteredProducts();track product.id){<tr><td><div class="product-cell"><span class="product-art" [class]="product.tone">@if(product.imageUrl){<img [src]="product.imageUrl" [alt]="product.name" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:8px">} @else { {{ product.initials }} }</span><span><b>{{ product.name }}</b><small>SKU: {{ product.sku }}</small></span></div></td><td><span class="status" [class]="product.status === 'Active' ? 'paid' : product.status === 'Draft' ? 'draft' : 'pending'">{{ product.status }}</span></td><td [class.low]="product.stock !== null && product.stock > 0 && product.stock < 10" [class.empty]="product.stock === 0">{{ product.stock === null ? 'Not tracked' : product.stock === 0 ? 'Out of stock' : product.stock + ' in stock' }}</td><td class="muted">{{ product.category }}</td><td class="total">{{ money(product.priceMinor,product.currency) }}</td><td><button class="more" type="button" [attr.aria-label]="'More options for ' + product.name" (click)="editProduct(product)">···</button></td></tr>} @empty {<tr><td colspan="6" class="empty-state">No products match your search. <button type="button" (click)="search.set('');productFilter.set('All')">Clear filters</button></td></tr>}</tbody></table></div><div class="panel-footer">Showing {{ filteredProducts().length }} of {{ products().length }} database products <button type="button" (click)="selectNav('Products')">View product catalog →</button></div></section>
          }
          @if (activeNav() === 'Orders') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Orders</h2><p>Track offline payments here. Dollareus does not process online payments.</p></div></div>@if(orderActionError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{orderActionError()}}</p>}<div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>STATUS</th><th>PAYMENT</th><th>TOTAL</th><th>UPDATE</th><th>PAYMENTS</th><th>SHIPPING</th><th>REFUNDS</th></tr></thead><tbody>@for(order of orders();track order.resourceId){<tr><td class="order-id">{{order.id}}</td><td>{{order.customer}}</td><td><span class="status" [class]="statusClass(order.status)">{{orderStatusLabel(order.status)}}</span></td><td>{{orderStatusLabel(order.paymentStatus)}}</td><td class="total">{{money(order.totalMinor,order.currency)}}</td><td>@if(order.status==='pending'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="pending">Pending</option><option value="confirmed">Confirm</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='confirmed'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="confirmed">Confirmed</option><option value="processing">Start processing</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='processing'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="processing">Processing</option><option value="completed">Complete</option><option value="cancelled">Cancel</option></select>} @else {<span class="muted">Final state</span>}</td><td><button class="button secondary small" type="button" (click)="openPaymentTracker(order)">{{selectedPaymentOrder()?.resourceId===order.resourceId?'Viewing':'Track payment'}}</button></td><td><button class="button secondary small" type="button" (click)="openShipmentTracker(order)">{{selectedShipmentOrder()?.resourceId===order.resourceId?'Viewing':'Track shipment'}}</button></td><td><button class="button secondary small" type="button" (click)="openRefundTracker(order)">{{selectedRefundOrder()?.resourceId===order.resourceId?'Viewing':'Refunds'}}</button></td></tr>} @empty {<tr><td colspan="9" class="empty-state">No orders yet. Orders created through checkout or POS will appear here.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{orders().length}} database orders</div></section>
            @if(selectedPaymentOrder(); as paymentOrder){<section class="panel product-panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Payment tracking · {{paymentOrder.id}}</h2><p>Record cash, cash on delivery, bank transfer, mobile money, card-terminal, or other offline payments. Confirm receipt manually.</p></div><button class="button secondary small" type="button" (click)="selectedPaymentOrder.set(null);paymentDetails.set(null)">Close</button></div>@if(paymentDetailsBusy()){<p style="padding:16px">Loading payment history…</p>} @else if(paymentDetails()){<div style="display:flex;gap:20px;flex-wrap:wrap;padding:12px 17px"><div><small>Total</small><strong style="display:block">{{money(paymentDetails().totalMinor,paymentDetails().currency)}}</strong></div><div><small>Recorded as received</small><strong style="display:block">{{money(paymentDetails().paidAmountMinor,paymentDetails().currency)}}</strong></div><div><small>Remaining balance</small><strong style="display:block">{{money(paymentDetails().balanceMinor,paymentDetails().currency)}}</strong></div></div><form class="customer-form" (submit)="recordManualPayment($event)"><label>Method<select [value]="paymentMethod()" (change)="paymentMethod.set($any($event.target).value)"><option value="cash">Cash</option><option value="cash_on_delivery">Cash on delivery</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="card_terminal">Card terminal</option><option value="other">Other</option></select></label><label>Amount ({{paymentDetails().currency}})<input type="number" min="0.01" step="0.01" required [value]="paymentAmount()" (input)="paymentAmount.set($any($event.target).value)" placeholder="0.00"></label><label>Reference (optional)<input maxlength="200" [value]="paymentReference()" (input)="paymentReference.set($any($event.target).value)" placeholder="Receipt or transfer reference"></label><label>Note (optional)<input maxlength="1000" [value]="paymentNote()" (input)="paymentNote.set($any($event.target).value)" placeholder="Who collected it, transfer details…"></label><label>Receipt status<select [value]="paymentRecordStatus()" (change)="paymentRecordStatus.set($any($event.target).value)"><option value="succeeded">Received / verified</option><option value="pending">Expected / not yet received</option></select></label><button class="button primary small" type="submit" [disabled]="paymentSaveBusy()"> {{paymentSaveBusy()?'Saving…':'Record offline payment'}} </button></form><div class="table-wrap"><table><thead><tr><th>DATE</th><th>METHOD</th><th>REFERENCE / NOTE</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>@for(payment of paymentDetails().payments;track payment.id){<tr><td>{{payment.createdAt}}</td><td>{{orderStatusLabel(payment.providerPayload?.method ?? 'other')}}</td><td>{{payment.providerPayload?.reference || payment.providerPayload?.note || '—'}}</td><td class="total">{{money(payment.amountMinor,payment.currency)}}</td><td>{{orderStatusLabel(payment.status)}}</td><td>@if(payment.status==='pending'){<button class="button secondary small" type="button" (click)="finalizeManualPayment(payment.id,'succeeded')">Confirm received</button><button class="button secondary small" type="button" (click)="finalizeManualPayment(payment.id,'cancelled')">Cancel</button>} @else {<span class="muted">Recorded</span>}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">No payment records yet. Record the first offline payment above.</td></tr>}</tbody></table></div>}</section>}
            @if(selectedShipmentOrder(); as shipmentOrder){<section class="panel product-panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Shipment tracking · {{shipmentOrder.id}}</h2><p>Record the courier and delivery progress. For cash on delivery, record collected cash separately under Track payment.</p></div><button class="button secondary small" type="button" (click)="selectedShipmentOrder.set(null);shipmentDetails.set(null)">Close</button></div>
              @if(shipmentBusy()){<p style="padding:18px">Loading shipment details…</p>} @else {
                <form class="customer-form shipment-form" (submit)="saveShipment($event)">
                  <label>Delivery stage<select [value]="shipmentStage()" (change)="shipmentStage.set($any($event.target).value)"><option value="preparing">Preparing package</option><option value="shipped">Shipped</option><option value="out_for_delivery">Out for delivery</option><option value="delivered">Delivered</option><option value="delivery_failed">Delivery failed</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></label>
                  <label>Courier / carrier<input maxlength="120" [value]="shipmentCarrier()" (input)="shipmentCarrier.set($any($event.target).value)" placeholder="Your chosen delivery company"></label>
                  <label>Tracking number<input maxlength="160" [value]="shipmentTrackingNumber()" (input)="shipmentTrackingNumber.set($any($event.target).value)" placeholder="Courier tracking number"></label>
                  <label>Tracking URL<input type="url" maxlength="1000" [value]="shipmentTrackingUrl()" (input)="shipmentTrackingUrl.set($any($event.target).value)" placeholder="https://carrier.example/track/…"></label>
                  <label>Expected delivery<input type="date" [value]="shipmentEstimatedDate()" (input)="shipmentEstimatedDate.set($any($event.target).value)"></label>
                  <label>Delivery notes<input maxlength="1000" [value]="shipmentNotes()" (input)="shipmentNotes.set($any($event.target).value)" placeholder="Delivery instructions or exception"></label>
                  <button class="button primary small" type="submit" [disabled]="shipmentSaveBusy()">{{shipmentSaveBusy()?'Saving…':(shipmentDetails()?.fulfillments?.length?'Save shipment updates':'Create shipment record')}}</button>
                </form>
                @if(orderActionError()){<p role="alert" style="padding:8px 17px;color:#b91c1c;font-size:13px">{{orderActionError()}}</p>}
                @if(shipmentDetails(); as shipmentData){<div class="table-wrap"><table><thead><tr><th>STAGE</th><th>COURIER</th><th>TRACKING</th><th>EXPECTED</th><th>NOTES</th><th>UPDATED</th></tr></thead><tbody>@for(shipment of shipmentData.fulfillments;track shipment.id){<tr><td><span class="status" [class]="statusClass(shipment.stage)">{{orderStatusLabel(shipment.stage)}}</span></td><td>{{shipment.carrier || 'Not assigned'}}</td><td>@if(shipment.trackingUrl){<a [href]="shipment.trackingUrl" target="_blank" rel="noopener noreferrer">{{shipment.trackingNumber || 'Open tracking'}}</a>} @else { {{shipment.trackingNumber || '—'}} }</td><td>{{shipment.estimatedDeliveryDate || '—'}}</td><td>{{shipment.notes || '—'}}</td><td>{{shipment.updatedAt | date:'mediumDate'}}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">No shipment has been recorded yet.</td></tr>}</tbody></table></div>}
              }
            </section>}
            @if(selectedRefundOrder(); as refundOrder){<section class="panel product-panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Refunds · {{refundOrder.id}}</h2><p>Record money already returned through your offline process. This does not initiate a bank or payment-provider transfer.</p></div><button class="button secondary small" type="button" (click)="selectedRefundOrder.set(null);refundDetails.set(null)">Close</button></div>
              @if(refundBusy()){<p style="padding:18px">Loading refund history…</p>} @else if(refundDetails(); as refundData){
                <form class="customer-form" (submit)="recordRefund($event)"><label>Successful payment<select required [value]="refundPaymentId()" (change)="refundPaymentId.set($any($event.target).value)"><option value="">Choose a recorded payment</option>@for(payment of refundData.payments;track payment.id){@if(payment.status==='succeeded'){<option [value]="payment.id">{{orderStatusLabel(payment.providerPayload?.method ?? 'other')}} · {{money(payment.amountMinor,payment.currency)}} · {{payment.createdAt | date:'mediumDate'}}</option>}}</select></label><label>Refund amount ({{refundData.currency}})<input type="number" min="0.01" step="0.01" required [value]="refundAmount()" (input)="refundAmount.set($any($event.target).value)" placeholder="0.00"></label><label>Reason / reference<input maxlength="1000" [value]="refundReason()" (input)="refundReason.set($any($event.target).value)" placeholder="Customer return, duplicate payment…"></label><button class="button primary small" type="submit" [disabled]="refundSaveBusy() || !refundPaymentId()">{{refundSaveBusy()?'Saving…':'Record manual refund'}}</button></form>
                <div class="table-wrap"><table><thead><tr><th>DATE</th><th>AMOUNT</th><th>REASON</th><th>STATUS</th></tr></thead><tbody>@for(refund of refundData.refunds;track refund.id){<tr><td>{{refund.createdAt | date:'medium'}}</td><td class="total">{{money(refund.amountMinor,refund.currency)}}</td><td>{{refund.reason || '—'}}</td><td>{{orderStatusLabel(refund.status)}}</td></tr>} @empty {<tr><td colspan="4" class="empty-state">No refunds recorded for this order.</td></tr>}</tbody></table></div>
              } @else {<p style="padding:18px">Refund details are unavailable. Close this panel and try again.</p>}
            </section>}
          }
          @if (activeNav() === 'POS') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Point of sale</h2><p>Create an in-person sale using active product prices from your store. Payment collection and stock deduction are not automated.</p></div><span class="status" [class]="hasOpenPosSession() ? 'paid' : 'pending'">{{hasOpenPosSession() ? 'Register open' : 'Register closed'}}</span></div>
              @if(posError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{posError()}}</p>}
              <form class="customer-form" (submit)="createPosSession($event)"><label>Register name<input name="label" required maxlength="120" [value]="posSessionLabel()" (input)="posSessionLabel.set($any($event.target).value)"></label><label>Terminal type<select [value]="posTerminalType()" (change)="posTerminalType.set($any($event.target).value)"><option value="retail">Retail</option><option value="restaurant">Restaurant</option><option value="service">Services</option><option value="general">General</option></select></label><button class="button primary small" type="submit" [disabled]="posBusy()">{{posBusy()?'Opening…':'Open register'}}</button></form>
              <div style="display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:14px 17px;border-bottom:1px solid #eef0eb"><label style="display:grid;gap:6px;flex:1;min-width:220px;color:#6f786a;font-size:13px;font-weight:700">Active register<select [value]="selectedPosSessionId()" (change)="selectedPosSessionId.set($any($event.target).value)" style="height:42px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;background:white"><option value="">Choose an open register</option>@for(session of posSessions();track session.id){@if(session.status==='open'){<option [value]="session.id">{{session.label}} · {{orderStatusLabel(session.terminalType)}}</option>}}</select></label><button class="button secondary small" type="button" [disabled]="posBusy() || !selectedPosSessionId()" (click)="closePosSession()">Close register</button></div>
              <form class="customer-form" (submit)="createPosOrder($event)"><label>Product<select required [value]="posVariantId()" (change)="posVariantId.set($any($event.target).value)"><option value="">Choose an active product</option>@for(product of products();track product.id){@if(product.status==='Active' && product.variantId){<option [value]="product.variantId">{{product.name}} · {{money(product.priceMinor,product.currency)}}</option>}}</select></label><label>Quantity<input type="number" min="1" max="10000" step="1" required [value]="posQuantity()" (input)="posQuantity.set($any($event.target).value)"></label><label>Fulfillment<select [value]="posFulfillment()" (change)="posFulfillment.set($any($event.target).value)"><option value="counter">Counter sale</option><option value="takeaway">Takeaway</option><option value="dine_in">Dine in</option><option value="delivery">Delivery</option><option value="service">Service</option></select></label><label>Note (optional)<input maxlength="1000" [value]="posCustomerNote()" (input)="posCustomerNote.set($any($event.target).value)" placeholder="Customer or receipt note"></label><button class="button primary small" type="submit" [disabled]="posSaveBusy() || !selectedPosSessionId() || !posVariantId()">{{posSaveBusy()?'Saving…':'Create POS order'}}</button></form>
              <div class="table-wrap"><table><thead><tr><th>ORDER</th><th>ITEMS</th><th>FULFILLMENT</th><th>TOTAL</th><th>STATUS</th><th>UPDATE</th></tr></thead><tbody>@for(order of posOrders();track order.id){<tr><td class="order-id">#{{order.orderNumber}}</td><td>@for(item of order.items || [];track item.id){<div>{{item.quantity}} × {{item.name}}</div>}</td><td>{{orderStatusLabel(order.fulfillment)}}</td><td class="total">{{money(order.totalMinor,order.currency)}}</td><td><span class="status" [class]="statusClass(order.status)">{{orderStatusLabel(order.status)}}</span></td><td>@if(order.status==='confirmed'){<select aria-label="Update POS order status" [disabled]="posSaveBusy()" (change)="updatePosOrderStatus(order,$any($event.target).value)"><option value="confirmed">Confirmed</option><option value="preparing">Preparing</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='preparing'){<select aria-label="Update POS order status" [disabled]="posSaveBusy()" (change)="updatePosOrderStatus(order,$any($event.target).value)"><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='ready'){<select aria-label="Update POS order status" [disabled]="posSaveBusy()" (change)="updatePosOrderStatus(order,$any($event.target).value)"><option value="ready">Ready</option><option value="completed">Complete</option><option value="cancelled">Cancel</option></select>} @else {<span class="muted">Final state</span>}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">No POS orders yet. Open a register and create your first in-person sale.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{posOrders().length}} POS orders · totals are server-priced; record receipts separately under Orders</div></section>
          }
          @if (activeNav() === 'QR Studio') {
            <section class="panel product-panel">
              <div class="panel-heading"><div><h2>Storefront publishing</h2><p>Publish the store before its restaurant menus and saved QR entry points can be accessed publicly.</p></div><span class="status-pill">{{storePublished() ? 'Published' : 'Private'}}</span></div>
              <div class="customer-form">
                <label>Default public experience<select [value]="storeExperience()" (change)="storeExperience.set($any($event.target).value)"><option value="menu">Restaurant menu</option><option value="commerce">Commerce</option><option value="catalog">Catalog</option><option value="services">Services</option></select></label>
                <button class="button primary" type="button" [disabled]="qrBusy()" (click)="toggleStorefrontPublishing()">{{qrBusy() ? 'Saving…' : (storePublished() ? 'Unpublish storefront' : 'Publish storefront')}}</button>
              </div>
              <div class="panel-heading"><div><h2>Branded QR entry points</h2><p>Create permanent entry-point records for this store and save brand styling alongside each destination. Only published storefront paths will be publicly resolvable.</p></div><a href="/qr" target="_blank" rel="noopener noreferrer">Open standalone QR generator ↗</a></div>
              @if(qrError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{qrError()}}</p>}
              <form class="customer-form" (submit)="createQrEntryPoint($event)">
                <label>Brand / restaurant name<input name="brandName" maxlength="120" [value]="qrBrandName()" (input)="qrBrandName.set($any($event.target).value)" placeholder="{{storeName()}}"></label>
                <label>Destination<select name="targetPath" [value]="qrTargetPath()" (change)="qrTargetPath.set($any($event.target).value)"><option value="/menu">Restaurant menu</option><option value="/">Store homepage</option><option value="/catalog">Product catalog</option><option value="/services">Services</option></select></label>
                <label>QR foreground<input type="color" [value]="qrForeground()" (input)="qrForeground.set($any($event.target).value)"></label>
                <label>Background<input type="color" [value]="qrBackground()" (input)="qrBackground.set($any($event.target).value)"></label>
                <label>Brand accent<input type="color" [value]="qrAccent()" (input)="qrAccent.set($any($event.target).value)"></label>
                <label>Frame style<select [value]="qrFrame()" (change)="qrFrame.set($any($event.target).value)"><option value="none">No frame</option><option value="bottom-label">Label below</option><option value="top-label">Label above</option></select></label>
                <label>Printed label<input maxlength="80" [value]="qrLabel()" (input)="qrLabel.set($any($event.target).value)" placeholder="Scan to view menu"></label>
                <label>Logo URL (HTTPS)<input type="url" [value]="qrLogoUrl()" (input)="qrLogoUrl.set($any($event.target).value)" placeholder="https://…/logo.png"></label>
                <button class="button primary" type="submit" [disabled]="qrBusy()">{{qrBusy()?'Saving…':'＋ Save branded QR entry point'}}</button>
              </form>
              <div class="table-wrap"><table><thead><tr><th>ENTRY POINT</th><th>DESTINATION</th><th>BRANDING</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
                @for(point of entryPoints();track point.id){<tr><td><b>{{point.branding?.brandName || storeName()}}</b><div class="muted">{{point.type}} · {{point.id.slice(0,8)}}</div></td><td>{{point.targetPath}}</td><td><span style="display:inline-block;width:13px;height:13px;border-radius:50%;border:1px solid #d1d5db;vertical-align:middle" [style.background]="point.branding?.foregroundColor || '#123456'"></span> <span style="display:inline-block;width:13px;height:13px;border-radius:50%;border:1px solid #d1d5db;vertical-align:middle" [style.background]="point.branding?.backgroundColor || '#ffffff'"></span> {{point.branding?.frame || 'none'}}</td><td><span class="status-pill">{{point.status}}</span></td><td><div class="product-actions"><a class="button small" [class.disabled]="!point.targetUrl" [attr.href]="point.targetUrl ? qrGeneratorUrl(point) : null" target="_blank" rel="noopener noreferrer">Generate QR</a><button class="button small" type="button" (click)="editQrEntryPoint(point)">Edit branding</button><button class="button small" type="button" [disabled]="qrBusy()" (click)="toggleQrEntryPoint(point)">{{point.status === 'active' ? 'Disable' : 'Enable'}}</button></div></td></tr>}
                @if(entryPoints().length === 0){<tr><td colspan="5" class="empty-state">No saved QR entry points yet. Create one above to store a restaurant or store destination with its branding.</td></tr>}
              </tbody></table></div>
              @if(selectedQrId()){
                <div class="panel-heading"><div><h2>Edit saved branding</h2><p>Changes are stored on the selected entry point.</p></div></div>
                <form class="customer-form" (submit)="saveQrBranding($event)">
                  <label>Brand / restaurant name<input name="brandName" maxlength="120" [value]="qrBrandName()" (input)="qrBrandName.set($any($event.target).value)"></label>
                  <label>QR foreground<input type="color" [value]="qrForeground()" (input)="qrForeground.set($any($event.target).value)"></label>
                  <label>Background<input type="color" [value]="qrBackground()" (input)="qrBackground.set($any($event.target).value)"></label>
                  <label>Brand accent<input type="color" [value]="qrAccent()" (input)="qrAccent.set($any($event.target).value)"></label>
                  <label>Frame style<select [value]="qrFrame()" (change)="qrFrame.set($any($event.target).value)"><option value="none">No frame</option><option value="bottom-label">Label below</option><option value="top-label">Label above</option></select></label>
                  <label>Printed label<input maxlength="80" [value]="qrLabel()" (input)="qrLabel.set($any($event.target).value)"></label>
                  <label>Logo URL (HTTPS)<input type="url" [value]="qrLogoUrl()" (input)="qrLogoUrl.set($any($event.target).value)" placeholder="https://…/logo.png"></label>
                  <button class="button primary" type="submit" [disabled]="qrBusy()">{{qrBusy()?'Saving…':'Save branding changes'}}</button>
                  <button class="button secondary" type="button" (click)="selectedQrId.set('')">Cancel editing</button>
                </form>
              }
              <p class="muted" style="padding:0 17px 16px">Branding and destinations are saved in Dollareus. Generate QR opens the standalone branded PNG/SVG exporter; public URL, TLS, and logo CORS behavior still need production verification.</p>
            </section>
          }
          @if (activeNav() === 'Customers') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Customers</h2><p>Customer records are saved to your organization.</p></div><button class="button primary small" type="button" (click)="toggleCustomerForm()">＋ Add customer</button></div>
              @if(customerFormOpen()){<form class="customer-form" (submit)="createCustomer($event)"><label>Display name<input name="displayName" maxlength="180" placeholder="Customer name"></label><label>Email<input name="email" type="email" maxlength="254" placeholder="customer@example.com"></label><label>Phone<input name="phone" maxlength="80" placeholder="+212…"></label>@if(customerSaveError()){<p role="alert">{{customerSaveError()}}</p>}<button class="button primary" type="submit" [disabled]="customerSaveBusy()">{{customerSaveBusy()?'Saving…':'Save customer'}}</button></form>}
              <div class="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>PHONE</th></tr></thead><tbody>@for(customer of customers();track customer.id){<tr><td>{{customer.displayName || 'Unnamed customer'}}</td><td>{{customer.email || '—'}}</td><td>{{customer.phone || '—'}}</td></tr>} @empty {<tr><td colspan="3" class="empty-state">No customer records yet. Add a customer to get started.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{customers().length}} customers</div></section>
          }
          @if (activeNav() === 'Menus') {
            <section class="panel product-panel">
              <div class="panel-heading"><div><h2>Restaurant menus</h2><p>Create menus, publish them, and control item availability. Changes are saved to the organization API.</p></div></div>
              <form class="customer-form" (submit)="createMenu($event)">
                <label>Menu name<input name="name" required maxlength="180" placeholder="e.g. Lunch menu"></label>
                <label>Slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="lunch-menu"></label>
                <label>Description<input name="description" maxlength="5000" placeholder="Optional menu description"></label>
                <button class="button primary" type="submit" [disabled]="menuBusy()">{{menuBusy()?'Saving…':'＋ Create menu'}}</button>
              </form>
              <div class="panel-heading"><div><h2>Menu categories</h2><p>Use store categories to group restaurant dishes.</p></div></div>
              <form class="customer-form" (submit)="createCategory($event)">
                <label>Category name<input name="name" required maxlength="120" placeholder="e.g. Starters"></label>
                <label>Slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="starters"></label>
                <button class="button secondary" type="submit" [disabled]="categoryBusy()">{{categoryBusy()?'Saving…':'＋ Add category'}}</button>
              </form>
              <div class="table-wrap"><table><thead><tr><th>CATEGORY</th><th>SLUG</th><th>STATUS</th></tr></thead><tbody>@for(category of categories();track category.id){<tr><td>{{category.name}}</td><td>{{category.slug}}</td><td>{{category.status}}</td></tr>} @empty {<tr><td colspan="3" class="empty-state">No categories yet. Add one to group dishes.</td></tr>}</tbody></table></div>
              @if(menuError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{menuError()}}</p>}
              <div class="table-wrap"><table><thead><tr><th>MENU</th><th>ITEMS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
                @for(menu of menus();track menu.id){<tr><td><b>{{menu.name}}</b><div class="muted">{{menu.slug}}</div></td><td>{{menu.itemCount}}</td><td><span class="status-pill">{{menu.status}}</span></td><td><div class="product-actions"><button class="button small" type="button" (click)="selectedMenuId.set(menu.id)">Manage items</button><button class="button small" type="button" [disabled]="menuBusy()" (click)="setMenuStatus(menu,menu.status === 'active' ? 'draft' : 'active')">{{menu.status === 'active' ? 'Unpublish' : 'Publish'}}</button></div></td></tr>}
                @if(menus().length === 0){<tr><td colspan="4" class="empty-state">Create your first menu to start adding restaurant items.</td></tr>}
              </tbody></table></div>
              @if(selectedMenuId()){
                <div class="panel-heading"><div><h2>Menu items</h2><p>Selected menu: {{selectedMenuName()}}</p></div></div>
                <form class="customer-form" (submit)="createMenuItem($event)">
                  <label>Item name<input name="name" required maxlength="180" placeholder="e.g. Chicken sandwich"></label>
                  <label>Slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="chicken-sandwich"></label>
                  <label>Price ({{storeCurrency()}})<input name="price" type="number" min="0" step="0.01" required placeholder="45.00"></label>
                  <label>Description<input name="description" maxlength="5000" placeholder="Optional description"></label>
                  <label>Category<select name="categoryId"><option value="">Uncategorized</option>@for(category of categories();track category.id){@if(category.status === 'active'){<option [value]="category.id">{{category.name}}</option>}}</select></label>
                  <label>Allergens (comma-separated)<input name="allergens" maxlength="1000" placeholder="e.g. milk, sesame, nuts"></label>
                  <label>Dietary labels (comma-separated)<input name="dietaryLabels" maxlength="1000" placeholder="e.g. vegetarian, vegan, gluten-free"></label>
                  <button class="button primary" type="submit" [disabled]="menuBusy()">{{menuBusy()?'Saving…':'＋ Add item'}}</button>
                </form>
                <div class="table-wrap"><table><thead><tr><th>ITEM</th><th>PRICE</th><th>DIETARY / ALLERGENS</th><th>AVAILABILITY</th><th>STATUS</th></tr></thead><tbody>
                  @for(item of selectedMenuItems();track item.id){<tr><td><b>{{item.name}}</b><div class="muted">{{item.slug}}</div></td><td>{{money(item.priceAmountMinor,item.currency)}}</td><td><div>{{(item.dietaryLabels || []).join(', ') || '—'}}</div><small class="muted">{{(item.allergens || []).length ? 'Contains: ' + (item.allergens || []).join(', ') : 'No allergens listed'}}</small></td><td><select [value]="item.availability" [attr.aria-label]="'Availability for '+item.name" (change)="setMenuItemAvailability(item,$any($event.target).value)"><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></td><td><button class="button small" type="button" (click)="setMenuItemStatus(item,item.status === 'active' ? 'draft' : 'active')">{{item.status === 'active' ? 'Unpublish' : 'Publish'}}</button></td></tr>}
                  @if(selectedMenuItems().length === 0){<tr><td colspan="5" class="empty-state">No items yet. Add an item using the form above.</td></tr>}
                </tbody></table></div>
              }
            </section>
          }
          @if (activeNav() === 'Inventory') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Inventory</h2><p>Adjust stock by variant and location. Reserved quantities are protected.</p></div></div>
              <form class="customer-form" (submit)="createInventoryLocation($event)"><label>New location<input name="name" required maxlength="180" placeholder="e.g. Main stockroom"></label><button class="button primary" type="submit" [disabled]="inventoryBusy()">{{inventoryBusy()?'Saving…':'Add location'}}</button></form>
              @if(inventoryError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{inventoryError()}}</p>}
              <form class="customer-form" (submit)="createInventoryLevel($event)"><label>Location<select name="locationId" required><option value="">Choose a location</option>@for(location of locationOptions();track location.id){<option [value]="location.id">{{location.name}}</option>}</select></label><label>Product variant<select name="variantId" required><option value="">Choose a product</option>@for(product of products();track product.variantId){@if(product.variantId){<option [value]="product.variantId">{{product.name}} · {{product.sku}}</option>}}</select></label><label>Quantity on hand<input name="quantityOnHand" type="number" min="0" required value="0"></label><label>Reorder point<input name="reorderPoint" type="number" min="0" placeholder="Optional"></label><button class="button primary" type="submit" [disabled]="inventoryBusy()">{{inventoryBusy()?'Saving…':'Set stock level'}}</button></form>
              <div class="table-wrap"><table><thead><tr><th>LOCATION</th><th>PRODUCT</th><th>ON HAND</th><th>RESERVED</th><th>REORDER</th><th>ADJUST STOCK</th></tr></thead><tbody>@for(item of inventory();track item.locationId + ':' + (item.variantId || 'empty')){<tr><td>{{item.locationName}}</td><td>{{item.productName || 'No stock assigned'}}</td><td>{{item.quantityOnHand ?? '—'}}</td><td>{{item.quantityReserved ?? '—'}}</td><td>{{item.reorderPoint ?? '—'}}</td><td>@if(item.variantId){<form class="inline-adjust" (submit)="adjustInventory($event,item)"><input name="quantityOnHand" type="number" min="0" required [value]="item.quantityOnHand ?? 0" aria-label="New on-hand quantity"><input name="reorderPoint" type="number" min="0" [value]="item.reorderPoint ?? ''" aria-label="Reorder point" placeholder="Reorder"><button type="submit" aria-label="Save stock adjustment">Save</button></form>} @else {<span class="muted">Add a variant first</span>}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">Create a stock location to start tracking inventory.</td></tr>}</tbody></table></div><div class="panel-footer">Stock levels are persisted in PostgreSQL</div></section>
          }
          @if (activeNav() === 'API & channels') {
            <section class="panel product-panel">
              <div class="panel-heading"><div><h2>Developer API access</h2><p>Create organization-scoped credentials for websites, apps, and approved integrations.</p></div><span class="status-pill">Metered</span></div>
              <div style="padding:0 17px 15px;color:#64748b;font-size:13px;line-height:1.6">Tokens are shown once and stored as hashes. Read credentials can retrieve data; write credentials can change data. Keep tokens server-side and never place them in public browser code.</div>
              <form class="customer-form" (submit)="createApiCredential($event)">
                <label>Credential name<input name="name" required maxlength="120" [value]="apiCredentialName()" (input)="apiCredentialName.set($any($event.target).value)" placeholder="Mageus integration"></label>
                <label>Permissions<select name="scopes" [value]="apiCredentialScopes()" (change)="apiCredentialScopes.set($any($event.target).value)"><option value="read">Read only</option><option value="write">Write only</option><option value="read,write">Read and write</option></select></label>
                <label>Expiry<select name="expiry" [value]="apiCredentialExpiry()" (change)="apiCredentialExpiry.set($any($event.target).value)"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option><option value="never">No expiry</option></select></label>
                <button class="button primary" type="submit" [disabled]="apiCredentialBusy() || !organizationId()">{{apiCredentialBusy()?'Creating…':'＋ Create API credential'}}</button>
              </form>
              @if(apiCredentialError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{apiCredentialError()}}</p>}
              @if(apiCredentialToken()){
                <section style="margin:0 17px 16px;padding:14px;border:1px solid #bbf7d0;border-radius:9px;background:#f0fdf4">
                  <b style="font-size:14px;color:#1f6f2c">Copy your new token now</b>
                  <p style="margin:5px 0 10px;color:#64748b;font-size:13px">This is the only time the full token will be displayed.</p>
                  <code style="display:block;overflow-wrap:anywhere;padding:10px;border:1px solid #d1fae5;border-radius:7px;background:white;color:#0f172a;font-size:13px">{{apiCredentialToken()}}</code>
                  <div style="display:flex;gap:8px;margin-top:10px"><button class="button secondary small" type="button" (click)="copyApiCredentialToken()">Copy token</button><button class="button secondary small" type="button" (click)="apiCredentialToken.set('')">Hide token</button></div>
                </section>
              }
              <div class="table-wrap"><table><thead><tr><th>CREDENTIAL</th><th>PERMISSIONS</th><th>CREATED</th><th>LAST USED</th><th>REQUESTS</th><th>EXPIRY / STATUS</th><th></th></tr></thead><tbody>
                @for(credential of apiCredentials();track credential.id){<tr><td><b>{{credential.name}}</b><div class="muted">{{credential.tokenPrefix}}…</div></td><td>{{credential.scopes.join(', ')}}</td><td>{{credential.createdAt || '—'}}</td><td>{{credential.lastUsedAt || 'Not used yet'}}</td><td>{{credential.requestCount ?? 0}}</td><td>@if(credential.revokedAt){<span class="status draft">Revoked</span>} @else if(credential.expiresAt){ {{credential.expiresAt}} } @else {No expiry}</td><td>@if(!credential.revokedAt){<button class="button secondary small" type="button" [disabled]="apiCredentialBusy()" (click)="revokeApiCredential(credential)">Revoke</button>}</td></tr>}
                @empty {<tr><td colspan="7" class="empty-state">No API credentials yet. Create one for a trusted server-side integration.</td></tr>}
              </tbody></table></div>
              <div class="panel-footer"><span>Requests are metered per credential. Billing quotas, webhooks, and public developer docs are still in progress.</span><button type="button" (click)="loadApiCredentials()">Refresh credentials ↻</button></div>
            </section>
          }
          <footer class="page-footer"><span>© 2026 Dollareus</span><span>● Preview environment</span><a href="https://github.com/marvenpiadri/dollareus" target="_blank" rel="noreferrer">Developer docs ↗</a></footer>
        </div>
      </main>
      @if (productEditorOpen()) { <div role="presentation" style="position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#17201680" (click)="closeProductEditor()"><section role="dialog" aria-modal="true" aria-labelledby="product-editor-title" style="width:min(100%,520px);padding:28px;background:white;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 80px #0002" (click)="$event.stopPropagation()"><div style="display:flex;justify-content:space-between;align-items:start;gap:16px"><div><p class="eyebrow">PRODUCT CATALOG</p><h2 id="product-editor-title" style="margin:0 0 8px;font-size:24px">{{ editingProduct() ? 'Edit product' : 'Add a product' }}</h2><p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6">{{ editingProduct() ? 'Update product details, default variant pricing, and optimized product images.' : 'Create a draft product first. After saving, reopen it to add product images.' }}</p></div><button type="button" aria-label="Close product editor" (click)="closeProductEditor()" style="border:0;background:none;font-size:24px;color:#64748b">×</button></div><form style="display:grid;gap:13px" (submit)="saveProduct($event)"><label style="display:grid;gap:6px;font-size:14px">Product name<input name="name" required maxlength="180" [value]="editingProduct()?.name ?? ''" placeholder="e.g. Handmade ceramic bowl" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">Product URL slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" [value]="editingProduct()?.slug ?? ''" placeholder="handmade-ceramic-bowl" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">Description<textarea name="description" maxlength="10000" rows="3" placeholder="Describe your product" style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical">{{ editingProduct()?.description ?? '' }}</textarea></label>@if (editingProduct()) { <label style="display:grid;gap:6px;font-size:14px">Status<select name="status" [value]="editingProduct()?.status === 'Active' ? 'active' : editingProduct()?.status === 'Archived' ? 'archived' : 'draft'" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label> }<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label style="display:grid;gap:6px;font-size:14px">Price ({{ editingProduct()?.currency ?? storeCurrency() }})<input name="price" type="number" min="0" step="0.01" required [value]="editingProduct() ? ((editingProduct()?.priceMinor ?? 0) / 100).toFixed(2) : '0.00'" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">SKU (optional)<input name="sku" maxlength="100" [value]="editingProduct()?.sku === '—' ? '' : editingProduct()?.sku ?? ''" placeholder="SKU-001" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label></div>@if (editingProduct()) { <section style="display:grid;gap:10px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc"><div><b style="font-size:14px">Product image</b><p style="margin:4px 0;color:#64748b;font-size:12px;line-height:1.5">Images are resized and converted to WebP in your browser before upload. Original image bytes are not sent.</p></div><label style="display:grid;gap:6px;font-size:13px">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" (change)="uploadProductImage($event)" [disabled]="imageUploadBusy()" style="font-size:13px"></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label style="display:grid;gap:5px;font-size:12px">Max width (px)<input type="number" min="64" max="2400" step="1" [value]="imageMaxWidth()" (input)="imageMaxWidth.set($any($event.target).valueAsNumber)" style="height:38px;padding:0 9px;border:1px solid #cbd5e1;border-radius:7px"></label><label style="display:grid;gap:5px;font-size:12px">Max height (px)<input type="number" min="64" max="2400" step="1" [value]="imageMaxHeight()" (input)="imageMaxHeight.set($any($event.target).valueAsNumber)" style="height:38px;padding:0 9px;border:1px solid #cbd5e1;border-radius:7px"></label></div><label style="display:grid;gap:5px;font-size:12px">Alt text (accessibility)<input maxlength="500" [value]="imageAltText()" (input)="imageAltText.set($any($event.target).value)" placeholder="Describe the product image" style="height:38px;padding:0 9px;border:1px solid #cbd5e1;border-radius:7px"></label>@if(imageUploadBusy()){<p style="margin:0;color:#64748b;font-size:13px">Resizing, compressing and uploading…</p>} @if(imageUploadNote()){<p role="status" style="margin:0;color:#23733a;font-size:13px">{{imageUploadNote()}}</p>} @if(imageUploadError()){<p role="alert" style="margin:0;color:#a44737;font-size:13px">{{imageUploadError()}}</p>}</section> }@if (productSaveError()) { <p role="alert" style="margin:0;color:#a44737;font-size:14px">{{ productSaveError() }}</p> }<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px"><button type="button" class="button secondary" (click)="closeProductEditor()">Cancel</button><button type="submit" class="button primary" [disabled]="productSaveBusy()">{{ productSaveBusy() ? 'Saving…' : editingProduct() ? 'Save changes' : 'Save draft product' }}</button></div></form></section></div> }
      @if (toast()) { <div class="toast" role="status"><span>✓</span>{{ toast() }}<button type="button" aria-label="Dismiss" (click)="toast.set('')">×</button></div> }
    </div>
    }
  `,
  styles: [`
    :host{display:block;min-height:100vh;color:#0f172a}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.shell{min-height:100vh;background:#f8fafc}.sidebar{position:fixed;inset:0 auto 0 0;width:260px;padding:23px 14px 13px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:5}.brand{display:flex;align-items:center;gap:10px;padding:0 8px 25px;color:#0f172a;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.8px}.brand-mark{display:grid;place-items:center;width:37px;height:37px;border-radius:11px;background:#f0fdf4;color:#238636;font-size:23px}.brand small{display:block;margin-top:4px;font-size:12px;letter-spacing:1.4px;color:#64748b}.store-switch{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;text-align:left;margin-bottom:27px}.store-avatar,.user-avatar{display:grid;place-items:center;width:33px;height:33px;border-radius:9px;background:#f0fdf4;color:#238636;font-weight:750}.store-switch>span:nth-child(2),.user>span:nth-child(2){display:flex;flex:1;flex-direction:column;gap:4px}.store-switch b,.user b{font-size:14px}.store-switch small,.user small{font-size:13px;color:#64748b}.chevron{color:#64748b}.nav-heading{margin:0 0 8px;padding:0 11px;font-size:13px;letter-spacing:1.1px;color:#64748b;font-weight:750}.nav-item{display:flex;align-items:center;gap:11px;width:100%;min-height:42px;height:auto;margin:2px 0;padding:0 11px;border:0;border-radius:7px;background:transparent;text-align:left;color:#475569;font-size:14px}.nav-item:hover,.nav-item.active{background:#f0fdf4;color:#1f6f2c}.nav-item.active{font-weight:750}.nav-symbol{width:18px;text-align:center;font-size:17px}.count{margin-left:auto;padding:3px 6px;background:#dcfce7;border-radius:4px;font-size:13px}.channels-heading{margin-top:25px}.sidebar-bottom{margin-top:auto}.help-card{padding:13px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:13px}.help-card>span{display:grid;place-items:center;width:26px;height:26px;margin-bottom:9px;background:#dcfce7;border-radius:8px;color:#238636}.help-card b{font-size:14px}.help-card p{font-size:14px;line-height:1.55;color:#64748b;margin:6px 0 10px}.help-card button{padding:0;border:0;background:none;color:#238636;font-size:14px;font-weight:700}.user{position:relative;display:flex;align-items:center;gap:9px;padding:12px 4px 0;border-top:1px solid #e2e8f0}.user-avatar{border-radius:50%;font-size:13px}.user>button{border:0;background:none;color:#64748b;font-size:19px}.main{min-height:100vh;margin-left:260px}.topbar{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;height:70px;padding:0 34px;background:#ffffffef;border-bottom:1px solid #e2e8f0;backdrop-filter:blur(10px)}.breadcrumbs{display:flex;gap:10px;align-items:center;font-size:14px;color:#64748b}.breadcrumbs b{color:#0f172a}.top-actions{display:flex;align-items:center;gap:13px}.global-search,.product-search{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#64748b}.global-search{width:245px}.global-search input,.product-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;font-size:14px;color:#0f172a}.global-search input::placeholder,.product-search input::placeholder{color:#64748b}.global-search kbd{padding:3px 5px;border:1px solid #e2e8f0;border-radius:4px;background:white;color:#64748b;font-size:12px;white-space:nowrap}.icon-button{position:relative;width:33px;height:33px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#475569;font-size:19px}.icon-button i{position:absolute;right:7px;top:6px;width:5px;height:5px;background:#d98c60;border-radius:50%}.demo-pill{font-size:13px;color:#64748b;white-space:nowrap}.demo-pill i{display:inline-block;width:6px;height:6px;margin-right:5px;background:#238636;border-radius:50%}.content{max-width:1680px;margin:auto;padding:34px 38px 22px}.welcome{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.eyebrow{font-size:13px;letter-spacing:1.15px;color:#838b7f;font-weight:750;margin:0}.welcome h1{margin:10px 0 7px;font-size:25px;letter-spacing:-1px;line-height:1.2}.subtitle{margin:0;color:#64748b;font-size:14px}.actions{display:flex;gap:8px}.button{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:650;white-space:nowrap}.secondary{background:white;color:#4f584c}.primary{background:#238636;color:white;border-color:#238636}.primary:hover{background:#1f6f2c}.setup-banner{display:flex;align-items:center;gap:12px;padding:13px 16px;margin-bottom:18px;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4}.banner-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;background:#dcfce7;color:#238636;font-size:24px}.banner-copy{flex:1;min-width:0}.banner-copy b{font-size:14px;color:#1f6f2c}.banner-copy p{margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.5}.progress{font-size:13px;color:#475569;white-space:nowrap}.progress i{display:inline-block;width:38px;height:4px;margin-right:5px;border-radius:4px;background:linear-gradient(to right,#238636 40%,#dcfce7 40%)}.setup-banner>button{border:0;background:none;color:#238636;font-size:14px;font-weight:750;white-space:nowrap}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:18px}.metric,.panel{min-width:0;border:1px solid #e2e8f0;border-radius:10px;background:white;box-shadow:0 2px 6px #24351f04}.metric{padding:15px 15px 12px}.metric-top{display:flex;align-items:center;justify-content:space-between;color:#64748b;font-size:14px}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;font-size:17px}.green{background:#f0fdf4;color:#238636}.purple{background:#f1edfa;color:#8976bd}.peach{background:#fbefe7;color:#bd8560}.amber{background:#fcf4df;color:#bb9441}.metric>strong{display:flex;align-items:center;gap:7px;margin:12px 0;font-size:22px;letter-spacing:-.7px;white-space:nowrap}.metric em{padding:4px 5px;border-radius:4px;background:#edf6e9;color:#238636;font-size:12px;letter-spacing:0;font-style:normal}.metric strong small{font-size:13px;letter-spacing:0;color:#64748b;font-weight:500}.metric footer{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:25px;padding-top:9px;border-top:1px solid #f1f5f9;color:#64748b;font-size:12px}.metric footer button,.panel-heading>button,.panel-footer button{padding:0;border:0;background:none;color:#238636;font-size:13px;font-weight:700;white-space:nowrap}.spark{font-size:17px;letter-spacing:1px;line-height:1}.green-spark{color:#bbf7d0}.purple-spark{color:#c4b5e2}.two-column{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(280px,1fr);gap:15px;margin-bottom:18px}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 17px 14px}.panel-heading h2{margin:0;font-size:15px;font-weight:750}.panel-heading p{margin:5px 0 0;color:#64748b;font-size:13px}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}thead{background:#f8fafc}th{height:32px;padding:0 10px;border-top:1px solid #f0f2ee;border-bottom:1px solid #f0f2ee;color:#64748b;font-size:12px;letter-spacing:.7px;font-weight:750}td{height:49px;padding:0 10px;border-bottom:1px solid #f0f2ee;color:#475569;font-size:13px}th:first-child,td:first-child{padding-left:17px}.order-id{color:#238636;font-weight:750}.total{color:#3f483d;font-weight:700}.channel-dot{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#84a67b}.channel-dot.mageus{background:#a18cc9}.channel-dot.pos{background:#d4a06d}.status{display:inline-block;padding:5px 7px;border-radius:5px;font-size:12px;font-weight:650}.status.paid{background:#f0fdf4;color:#238636}.status.processing{background:#f0edfa;color:#8976b7}.status.pending{background:#fbf2df;color:#a98737}.status.draft{background:#f1f2ef;color:#8e9589}.panel-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 17px;border-top:1px solid #eff1ed;color:#9aa096;font-size:12px}.channel-row{display:flex;align-items:center;gap:9px;padding:11px 16px;border-bottom:1px solid #f1f5f9}.channel-icon{display:grid;place-items:center;width:32px;height:32px;border:1px solid #e2e8f0;border-radius:8px;color:#657b5c;font-size:17px;flex:none}.mageus-icon{background:#f2eff9;color:#6d6392;font-weight:800}.qr-icon{background:#eff5ed}.channel-row>span:nth-child(2){display:flex;flex:1;flex-direction:column;gap:4px}.channel-row b{font-size:13px;color:#4a5247}.channel-row small{font-size:12px;color:#64748b}.channel-row em{font-size:12px;font-style:normal;white-space:nowrap}.connected{color:#238636}.channel-row>button{padding:5px 8px;border:1px solid #e2e8f0;border-radius:5px;background:white;color:#5a7654;font-size:12px;font-weight:700}.add-channel{display:block;width:calc(100% - 32px);height:31px;margin:11px 16px 14px;border:1px dashed #cbd5e1;border-radius:7px;background:#ffffff;color:#687b61;font-size:13px}.product-panel{margin-bottom:0}.product-heading{padding-bottom:14px}.product-actions{display:flex;align-items:center;gap:8px}.product-search{width:175px;height:32px}.small{height:38px;padding:0 10px;font-size:13px}.filters{display:flex;gap:17px;align-items:center;padding:0 17px;border-bottom:1px solid #eef0eb;overflow-x:auto}.filters button{position:relative;display:flex;align-items:center;gap:6px;height:38px;padding:0;border:0;background:none;color:#8c9488;font-size:13px;white-space:nowrap}.filters button.selected{color:#426e3f;font-weight:750}.filters button.selected:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#58834f}.filters button span{padding:3px 5px;border-radius:4px;background:#f1f5f9;color:#8d9588;font-size:12px}.filters button.selected span{background:#dcfce7;color:#57804d}.products-table th{height:35px}.products-table td{height:57px}.product-cell{display:flex;align-items:center;gap:9px}.product-cell>span:nth-child(2){display:flex;flex-direction:column;gap:4px}.product-cell b{font-size:13px;color:#41483e}.product-cell small{font-size:12px;color:#64748b}.product-art{display:grid;place-items:center;width:42px;height:42px;border-radius:8px;font-size:13px;font-weight:750;flex:none;overflow:hidden}.clay{background:#f1e6dc;color:#a2795d}.sage{background:#e5eee1;color:#65835b}.sand{background:#f3ecda;color:#9c8756}.blue{background:#e2eaf1;color:#68869f}.olive{background:#e9eadc;color:#7d8050}.muted{color:#64748b}.low{color:#b78a40;font-weight:700}.empty{color:#c07965}.more{border:0;background:none;color:#92998e;font-size:18px}.empty-state{text-align:center;color:#838b80}.empty-state button{border:0;background:none;color:#4f7849;font-size:13px;font-weight:700}.page-footer{display:flex;justify-content:space-between;gap:10px;padding:19px 2px 3px;color:#a0a69c;font-size:12px}.page-footer a{color:#818a7d;text-decoration:none}.customer-form{display:flex;align-items:end;flex-wrap:wrap;gap:10px;padding:16px 17px;border-bottom:1px solid #eef0eb}.customer-form label{display:grid;gap:6px;flex:1;min-width:150px;color:#6f786a;font-size:13px;font-weight:700}.customer-form select{height:42px;min-width:140px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;font-size:15px}.shipment-form{align-items:stretch}.shipment-form label{min-width:190px}.shipment-form button{align-self:end;min-height:42px;padding:0 16px}.customer-form input{height:42px;min-width:0;padding:0 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px}.customer-form p{width:100%;margin:0;color:#a44737;font-size:14px}.inline-adjust{display:flex;gap:4px;align-items:center}.inline-adjust input{width:88px;height:36px;padding:0 5px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px}.inline-adjust button{height:36px;padding:0 7px;border:1px solid #cbd5e1;border-radius:5px;background:#f0fdf4;color:#238636;font-size:13px;font-weight:700}.toast{position:fixed;right:24px;bottom:24px;z-index:10;display:flex;align-items:center;gap:10px;max-width:min(440px,calc(100vw - 32px));padding:12px 14px;border:1px solid #bbf7d0;border-radius:9px;background:white;box-shadow:0 12px 35px #263b201c;color:#485345;font-size:14px;line-height:1.5}.toast>span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#f0fdf4;color:#238636}.toast button{margin-left:4px;border:0;background:none;color:#92998e;font-size:18px}@media(max-width:1200px){.sidebar{width:232px}.main{margin-left:232px}.content{padding:25px 23px 16px}.topbar{padding:0 23px}.metrics{gap:9px}.metric{padding:12px}.metric>strong{font-size:20px}.two-column{grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr)}}@media(max-width:950px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.two-column{grid-template-columns:1fr}.welcome h1{font-size:22px}}@media(max-width:700px){.sidebar{position:static;width:auto;height:auto;padding:11px 13px 8px;border-right:0;border-bottom:1px solid #e2e8f0}.brand{padding:0 3px 10px;font-size:19px}.brand-mark{width:33px;height:33px}.store-switch,.nav-heading,.nav-item,.sidebar-bottom{display:none}.main{margin-left:0}.topbar{position:static;height:60px;padding:0 14px}.global-search{width:35px;padding:0 8px;border:0;background:transparent}.global-search input,.global-search kbd,.demo-pill{display:none}.top-actions{gap:7px}.content{padding:21px 13px 15px}.welcome{align-items:flex-start;flex-direction:column;gap:14px}.welcome h1{font-size:22px}.actions{width:100%}.actions .button{flex:1}.setup-banner{flex-wrap:wrap;padding:11px}.banner-copy{flex:1;width:calc(100% - 50px)}.progress{margin-left:45px}.metrics{gap:8px}.metric{padding:11px 10px}.metric>strong{font-size:18px;flex-wrap:wrap;gap:4px}.metric footer{font-size:12px}.spark{display:none}.panel-heading{padding:14px 12px}.panel-footer{padding:10px 12px}.filters{padding:0 12px;gap:12px}.product-heading{align-items:flex-start;flex-direction:column}.product-actions{width:100%}.product-search{flex:1;width:auto}.page-footer{flex-wrap:wrap}.page-footer a{margin-left:auto}}@media(max-width:380px){.metrics{grid-template-columns:1fr 1fr}.metric>strong{font-size:17px}.filters{gap:10px}.filters button{font-size:12px}}
  `]
})
export class AppComponent {
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

  protected readonly publicPage = signal<'home' | 'qr' | 'login' | 'signup' | 'app'>('home');

  constructor() {
    const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') || '/' : '/';
    const authAction = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('auth') : null;
    const page = authAction === 'verify-email' || authAction === 'reset-password' ? 'login' : path === '/qr' ? 'qr' : path === '/login' ? 'login' : path === '/signup' ? 'signup' : path === '/app' ? 'app' : path === '/' ? 'home' : 'app';
    this.publicPage.set(page);
    if (page === 'app' || page === 'login' || page === 'signup') void this.checkSession();
    else { this.authReady.set(true); this.workspaceLoading.set(false); }
  }

  private async checkSession(): Promise<void> {
    const action = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('auth') : null;
    if (action === 'verify-email' || action === 'reset-password') {
      this.authenticated.set(false);
      this.authReady.set(true);
      return;
    }
    const apiBase = ((globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string }).DOLLAREUS_API_URL ?? '').replace(/\/$/, '');
    try {
      const response = await fetch(apiBase + '/api/v1/auth/session', { credentials: 'include' });
      this.authenticated.set(response.ok);
      if (response.ok) await this.loadWorkspace();
    } catch {
      this.authenticated.set(false);
    } finally {
      this.authReady.set(true);
    }
  }

  protected onSignedIn(): void {
    this.publicPage.set('app');
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/app');
    this.authenticated.set(true);
    this.authReady.set(true);
    this.workspaceLoading.set(true);
    void this.loadWorkspace();
  }

  protected async signOut(): Promise<void> {
    const apiBase = ((globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string }).DOLLAREUS_API_URL ?? '').replace(/\/$/, '');
    try {
      await fetch(apiBase + '/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      this.authenticated.set(false);
      this.publicPage.set('login');
      if (typeof window !== 'undefined') window.history.replaceState({}, '', '/login');
      this.products.set([]);
      this.organizationId.set('');
      this.storeId.set('');
      this.storeName.set('');
      this.storeSlug.set('');
      this.onboardingStage.set('organization');
    }
  }
  private apiBase(): string { return ((globalThis as typeof globalThis & { DOLLAREUS_API_URL?: string }).DOLLAREUS_API_URL ?? '').replace(/\/$/, ''); }

  private async apiRequest(path: string, init: RequestInit = {}): Promise<any> {
    const response = await fetch(this.apiBase() + path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const payload = await response.json().catch(() => ({})) as { data?: any; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status}).`);
    return payload.data;
  }

  private async loadWorkspace(): Promise<void> {
    this.workspaceLoading.set(true);
    this.workspaceError.set('');
    this.onboardingError.set('');
    try {
      const organizations = await this.apiRequest('/api/v1/organizations');
      const organization = Array.isArray(organizations) ? organizations[0] : null;
      if (!organization) {
        this.organizationId.set('');
        this.onboardingStage.set('organization');
        this.products.set([]);
        return;
      }
      this.organizationId.set(organization.id);
      const stores = await this.apiRequest(`/api/v1/organizations/${encodeURIComponent(organization.id)}/stores`);
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
      const rows = await this.apiRequest(`/api/v1/organizations/${encodeURIComponent(organization.id)}/products`);
      const products = Array.isArray(rows) ? rows : [];
      this.products.set(products.filter((p: any) => p.storeId === store.id).map((p: any): ProductRow => {
        const variant = Array.isArray(p.variants) ? p.variants[0] : null;
        const status: ProductStatus = p.status === 'active' ? 'Active' : p.status === 'archived' ? 'Archived' : 'Draft';
        const name = String(p.name ?? 'Untitled product');
        return {
          id: String(p.id), name, slug: String(p.slug ?? ''), description: typeof p.description === 'string' ? p.description : null, category: 'Uncategorized', sku: variant?.sku ? String(variant.sku) : '—', variantId: String(variant?.id ?? ''),
          priceMinor: Number(variant?.amountMinor ?? 0), currency: String(variant?.currency ?? store.defaultCurrency ?? 'MAD'),
          stock: null, status, initials: name.split(/\s+/).slice(0, 2).map((part: string) => part[0] ?? '').join('').toUpperCase(),
          tone: 'sage', imageUrl: Array.isArray(p.media) && p.media[0]?.contentUrl ? this.apiBase() + String(p.media[0].contentUrl) + '?width=300' : null
        };
      }));
      const [orderRows, customerRows, inventoryRows, sessionRows, posOrderRows, menuRows, entryPointRows, categoryRows] = await Promise.all([
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/orders'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/customers'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/inventory'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/pos/sessions'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/pos/orders'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/menus'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/entry-points'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/stores/' + encodeURIComponent(store.id) + '/categories')
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
      const itemGroups = await Promise.all(loadedMenus.map((menu) => this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/menus/' + encodeURIComponent(menu.id) + '/items')));
      const savedEntryPoints = Array.isArray(entryPointRows) ? entryPointRows as EntryPointRow[] : [];
      this.entryPoints.set(await Promise.all(savedEntryPoints.map(async (point) => {
        try {
          const publicPoint = await this.apiRequest('/api/v1/public/entry-points/' + encodeURIComponent(point.id));
          return { ...point, targetUrl: typeof publicPoint?.targetUrl === 'string' ? publicPoint.targetUrl : null, targetUrlPath: String(publicPoint?.targetUrlPath ?? '') };
        } catch { return { ...point, targetUrl: null, targetUrlPath: '/' + this.storeSlug() + point.targetPath }; }
      })));
      if (!this.entryPoints().some(point => point.id === this.selectedQrId())) this.selectedQrId.set('');
      this.menuItems.set(itemGroups.flatMap((group, index) => (Array.isArray(group) ? group : []).map((item: any): MenuItemRow => ({
        id: String(item.id), menuId: String(item.menuId ?? loadedMenus[index].id), slug: String(item.slug ?? ''), name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null, priceAmountMinor: Number(item.priceAmountMinor ?? 0), currency: String(item.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(item.status ?? 'draft') as MenuItemRow['status'], availability: String(item.availability ?? 'available') as MenuItemRow['availability'], position: Number(item.position ?? 0)
      }))));
      if (!loadedMenus.some((menu) => menu.id === this.selectedMenuId())) this.selectedMenuId.set(loadedMenus[0]?.id ?? '');
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
      const organization = await this.apiRequest('/api/v1/organizations', { method: 'POST', body: JSON.stringify({ name: String(values.get('name') ?? '').trim(), slug: String(values.get('slug') ?? '').trim() }) });
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
      const store = await this.apiRequest(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/stores`, { method: 'POST', body: JSON.stringify({
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
  protected readonly categoryBusy = signal(false);
  protected readonly menus = signal<MenuRow[]>([]);
  protected readonly menuItems = signal<MenuItemRow[]>([]);
  protected readonly selectedMenuId = signal('');
  protected readonly menuBusy = signal(false);
  protected readonly menuError = signal('');
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
  protected readonly posQuantity = signal('1');
  protected readonly posFulfillment = signal('counter');
  protected readonly posCustomerNote = signal('');
  protected readonly posBusy = signal(false);
  protected readonly posSaveBusy = signal(false);
  protected readonly posError = signal('');
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
  protected readonly filteredProducts = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.productFilter();
    return this.products().filter(p => (!query || [p.name,p.sku,p.category].some(v => v.toLowerCase().includes(query))) && (filter === 'All' || p.status === filter));
  });
  protected activeCount(): number { return this.products().filter(p => p.status === 'Active').length; }
  protected lowStockCount(): number { return this.inventory().filter((item) => item.quantityOnHand !== null && item.reorderPoint !== null && item.quantityOnHand <= item.reorderPoint).length; }
  protected filterCount(filter: 'All' | ProductStatus): number { return filter === 'All' ? this.products().length : this.products().filter(p => p.status === filter).length; }
  protected money(minor: number, currency: string): string { return new Intl.NumberFormat('en', {style:'currency',currency,maximumFractionDigits:2}).format(minor / 100); }
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
      const details = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments');
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
      const result = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments', {
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
      const result = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments/' + encodeURIComponent(paymentId), {
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
    const details = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/payments');
    this.paymentDetails.set(details);
  }


  protected hasOpenPosSession(): boolean { return this.posSessions().some((session: any) => session.status === 'open'); }

  protected async createPosSession(event: Event): Promise<void> {
    event.preventDefault();
    const label = this.posSessionLabel().trim();
    if (!label) { this.posError.set('Enter a register name.'); return; }
    this.posBusy.set(true); this.posError.set('');
    try {
      const session = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/sessions', {
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
      const closed = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/sessions/' + encodeURIComponent(sessionId) + '/close', {
        method: 'PATCH', body: JSON.stringify({})
      });
      this.posSessions.update(rows => rows.map(row => row.id === sessionId ? closed : row));
      this.selectedPosSessionId.set('');
      this.notify('POS register closed.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not close this register.');
    } finally { this.posBusy.set(false); }
  }

  protected async createPosOrder(event: Event): Promise<void> {
    event.preventDefault();
    const sessionId = this.selectedPosSessionId();
    const variantId = this.posVariantId();
    const quantity = Number(this.posQuantity());
    const product = this.products().find(row => row.variantId === variantId && row.status === 'Active');
    if (!sessionId || !product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      this.posError.set('Choose an open register, an active product, and a valid whole-number quantity.');
      return;
    }
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          sessionId, channel: 'pos', fulfillment: this.posFulfillment(),
          customerNote: this.posCustomerNote().trim() || null,
          idempotencyKey: 'merchant-pos-' + crypto.randomUUID(),
          items: [{ sourceType: 'product', sourceItemId: product.id, sourceVariantId: variantId, quantity }]
        })
      });
      const rows = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
      this.posOrders.set(Array.isArray(rows) ? rows : []);
      this.posQuantity.set('1'); this.posCustomerNote.set('');
      this.notify('POS order created with server-calculated pricing.');
    } catch (error) {
      this.posError.set(error instanceof Error ? error.message : 'Could not create this POS order.');
    } finally { this.posSaveBusy.set(false); }
  }

  protected async updatePosOrderStatus(order: any, status: string): Promise<void> {
    if (!order?.id || status === order.status) return;
    this.posSaveBusy.set(true); this.posError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders/' + encodeURIComponent(order.id) + '/status', {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      const rows = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/pos/orders');
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
      const result = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/refunds', {
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
      this.apiRequest(base + '/refunds'),
      this.apiRequest(base + '/payments')
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
      const details = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId) + '/fulfillments');
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
      await this.apiRequest(createNew ? base : base + '/' + encodeURIComponent(latest!.id), {
        method: createNew ? 'POST' : 'PATCH',
        body: JSON.stringify(payload)
      });
      const details = await this.apiRequest(base);
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
      const updated = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/orders/' + encodeURIComponent(order.resourceId), { method: 'PATCH', body: JSON.stringify({ status }) });
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
    try { this.apiCredentials.set(await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials')); }
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
      const result = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials', { method: 'POST', body: JSON.stringify({ name, scopes, ...(expiresAt ? { expiresAt } : {}) }) });
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/api-credentials/' + encodeURIComponent(credential.id), { method: 'DELETE', body: JSON.stringify({}) });
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/stores/' + encodeURIComponent(this.storeId()) + '/storefront', {
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
      const result = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points', {
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points/' + encodeURIComponent(id), {
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/entry-points/' + encodeURIComponent(point.id), {
        method: 'PATCH', body: JSON.stringify({ status: point.status === 'active' ? 'disabled' : 'active' })
      });
      await this.loadWorkspace(); this.notify(point.status === 'active' ? 'QR entry point disabled.' : 'QR entry point enabled.');
    } catch (error) { this.qrError.set(error instanceof Error ? error.message : 'Could not change QR entry point status.'); }
    finally { this.qrBusy.set(false); }
  }
  protected selectedMenuName(): string { return this.menus().find(menu => menu.id === this.selectedMenuId())?.name ?? 'Menu'; }
  protected selectedMenuItems(): MenuItemRow[] { return this.menuItems().filter(item => item.menuId === this.selectedMenuId()); }
  protected async createCategory(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    if (!name || !slug || !this.storeId()) { this.menuError.set('Enter a category name and URL slug.'); return; }
    this.categoryBusy.set(true); this.menuError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/categories', {
        method: 'POST', body: JSON.stringify({ storeId: this.storeId(), name, slug, description: null, position: this.categories().length, status: 'active' })
      });
      form.reset();
      await this.loadWorkspace();
      this.notify('Menu category created.');
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
    if (!name || !slug) return;
    this.menuBusy.set(true); this.menuError.set('');
    try {
      const created = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus', {
        method: 'POST', body: JSON.stringify({ storeId: this.storeId(), slug, name, description: description || null, servicePeriods: ['all-day'], status: 'draft' })
      });
      await this.loadWorkspace();
      if (created?.id) this.selectedMenuId.set(String(created.id));
      form.reset(); this.notify('Menu created as a draft.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not create menu.'); }
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(menuId) + '/items', {
        method: 'POST', body: JSON.stringify({ slug, name, description: description || null, priceAmountMinor: Math.round(price * 100), currency: this.storeCurrency(), status: 'draft', categoryId, allergens, dietaryLabels, availability: 'available', metadata: {} })
      });
      await this.loadWorkspace(); form.reset(); this.notify('Menu item saved as a draft.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not create menu item.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuStatus(menu: MenuRow, status: 'draft' | 'active'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(menu.id) + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      await this.loadWorkspace(); this.notify(status === 'active' ? 'Menu published.' : 'Menu unpublished.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update menu status.'); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuItemAvailability(item: MenuItemRow, availability: 'available' | 'unavailable' | 'limited'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/' + encodeURIComponent(item.id), { method: 'PATCH', body: JSON.stringify({ availability }) });
      this.menuItems.update(items => items.map(row => row.id === item.id ? { ...row, availability } : row));
      this.notify('Item availability updated.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update item availability.'); await this.loadWorkspace(); }
    finally { this.menuBusy.set(false); }
  }
  protected async setMenuItemStatus(item: MenuItemRow, status: 'draft' | 'active'): Promise<void> {
    this.menuBusy.set(true); this.menuError.set('');
    try {
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/menus/' + encodeURIComponent(item.menuId) + '/items/' + encodeURIComponent(item.id), { method: 'PATCH', body: JSON.stringify({ status }) });
      this.menuItems.update(items => items.map(row => row.id === item.id ? { ...row, status } : row));
      this.notify(status === 'active' ? 'Menu item published.' : 'Menu item unpublished.');
    } catch (error) { this.menuError.set(error instanceof Error ? error.message : 'Could not update item status.'); }
    finally { this.menuBusy.set(false); }
  }
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
      const response = await fetch(this.apiBase() + '/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/products/' + encodeURIComponent(product.id) + '/media', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/webp', 'X-Image-Alt': this.imageAltText().trim(), 'X-Image-Position': '0' }, body: optimized });
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
        await this.apiRequest(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/products/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH', body: JSON.stringify({
            name, slug, description, status: String(values.get('status') ?? 'draft'),
            variant: { id: editing.variantId, sku, title: name, amountMinor: Math.round(price * 100), currency: editing.currency }
          })
        });
      } else {
        await this.apiRequest(`/api/v1/organizations/${encodeURIComponent(this.organizationId())}/products`, { method: 'POST', body: JSON.stringify({
          storeId: this.storeId(), slug, name, description, status: 'draft', kind: 'physical',
          availabilityStatus: 'available', availabilityNote: null, attributes: {}, categoryIds: [],
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
      const customer = await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/customers', {
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/locations', {
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
      await this.apiRequest('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/inventory/levels', {
        method: 'PUT', body: JSON.stringify({ locationId: item.locationId, variantId: item.variantId, quantityOnHand, reorderPoint })
      });
      await this.loadWorkspace(); this.notify('Stock level updated.');
    } catch (error) { this.inventoryError.set(error instanceof Error ? error.message : 'Could not update stock.'); }
    finally { this.inventoryBusy.set(false); }
  }

  protected openQrStudio(): void { if (typeof window !== 'undefined') window.location.assign('/qr'); }
  protected notify(message: string): void { this.toast.set(message); globalThis.setTimeout(() => { if (this.toast() === message) this.toast.set(''); }, 3000); }
}
