import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AuthPanelComponent } from './auth-panel.component';
import { PublicHomeComponent } from './public-home.component';
import { QrStudioComponent } from './qr-studio.component';

type NavItem = 'Overview' | 'Orders' | 'Products' | 'Customers' | 'Inventory' | 'Online store' | 'Integrations' | 'Settings';
type ProductStatus = 'Active' | 'Draft' | 'Archived';
interface ProductRow { id: string; name: string; slug: string; description: string | null; category: string; sku: string; variantId: string; priceMinor: number; currency: string; stock: number | null; status: ProductStatus; initials: string; tone: string; }
interface OrderRow { id: string; resourceId: string; customer: string; channel: string; totalMinor: number; currency: string; status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded'; paymentStatus: string; }
interface CustomerRow { id: string; displayName: string; email: string | null; phone: string | null; }
interface InventoryRow { locationId: string; locationName: string; storeId: string | null; variantId: string | null; variantTitle: string | null; productName: string | null; quantityOnHand: number | null; quantityReserved: number | null; reorderPoint: number | null; }
type FulfillmentStage = 'preparing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'delivery_failed' | 'returned' | 'cancelled';
interface ShipmentDetails { id: string; orderId: string; stage: FulfillmentStage; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; estimatedDeliveryDate: string | null; notes: string | null; createdAt: string; updatedAt: string; }

@Component({
  selector: 'dlr-root',
  standalone: true,
  imports: [AuthPanelComponent, PublicHomeComponent, QrStudioComponent],
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
            <article class="panel channels"><div class="panel-heading"><div><h2>Sales channels</h2><p>Where customers find you.</p></div><button type="button" (click)="selectNav('Integrations')">···</button></div><div class="channel-row"><span class="channel-icon">▣</span><span><b>Online store</b><small>{{ storeSlug() }}</small></span><em>Not published</em></div><div class="channel-row"><span class="channel-icon mageus-icon">m.</span><span><b>Mageus</b><small>Creator storefront</small></span><button type="button" (click)="notify('Mageus will connect through scoped authorization.')">Connect</button></div><div class="channel-row"><span class="channel-icon">▤</span><span><b>In-person POS</b><small>Sell in person</small></span><button type="button" (click)="notify('POS is planned as a business module.')">Set up</button></div><div class="channel-row"><span class="channel-icon qr-icon">▦</span><span><b>QR commerce</b><small>Menus and product links</small></span><button type="button" (click)="openQrStudio()">Explore</button></div><button class="add-channel" type="button" (click)="selectNav('Integrations')">＋ Add a sales channel</button></article>
          </section>
          }
          @if (activeNav() === 'Overview' || activeNav() === 'Products') {
          <section class="panel product-panel"><div class="panel-heading product-heading"><div><h2>Products</h2><p>Keep your catalog organized and ready to sell.</p></div><div class="product-actions"><label class="product-search">⌕ <input aria-label="Filter products" placeholder="Search products..." [value]="search()" (input)="search.set($any($event.target).value)"></label><button class="button primary small" type="button" (click)="addProduct()">＋ Add product</button></div></div><div class="filters">@for(filter of filters;track filter){<button type="button" [class.selected]="productFilter() === filter" (click)="productFilter.set(filter)">{{ filter }} <span>{{ filterCount(filter) }}</span></button>}</div><div class="table-wrap"><table class="products-table"><thead><tr><th>PRODUCT</th><th>STATUS</th><th>INVENTORY</th><th>CATEGORY</th><th>PRICE</th><th></th></tr></thead><tbody>@for(product of filteredProducts();track product.id){<tr><td><div class="product-cell"><span class="product-art" [class]="product.tone">{{ product.initials }}</span><span><b>{{ product.name }}</b><small>SKU: {{ product.sku }}</small></span></div></td><td><span class="status" [class]="product.status === 'Active' ? 'paid' : product.status === 'Draft' ? 'draft' : 'pending'">{{ product.status }}</span></td><td [class.low]="product.stock !== null && product.stock > 0 && product.stock < 10" [class.empty]="product.stock === 0">{{ product.stock === null ? 'Not tracked' : product.stock === 0 ? 'Out of stock' : product.stock + ' in stock' }}</td><td class="muted">{{ product.category }}</td><td class="total">{{ money(product.priceMinor,product.currency) }}</td><td><button class="more" type="button" [attr.aria-label]="'More options for ' + product.name" (click)="editProduct(product)">···</button></td></tr>} @empty {<tr><td colspan="6" class="empty-state">No products match your search. <button type="button" (click)="search.set('');productFilter.set('All')">Clear filters</button></td></tr>}</tbody></table></div><div class="panel-footer">Showing {{ filteredProducts().length }} of {{ products().length }} database products <button type="button" (click)="selectNav('Products')">View product catalog →</button></div></section>
          }
          @if (activeNav() === 'Orders') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Orders</h2><p>Track offline payments here. Dollareus does not process online payments.</p></div></div>@if(orderActionError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{orderActionError()}}</p>}<div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>STATUS</th><th>PAYMENT</th><th>TOTAL</th><th>UPDATE</th><th>PAYMENTS</th><th>SHIPPING</th></tr></thead><tbody>@for(order of orders();track order.resourceId){<tr><td class="order-id">{{order.id}}</td><td>{{order.customer}}</td><td><span class="status" [class]="statusClass(order.status)">{{orderStatusLabel(order.status)}}</span></td><td>{{orderStatusLabel(order.paymentStatus)}}</td><td class="total">{{money(order.totalMinor,order.currency)}}</td><td>@if(order.status==='pending'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="pending">Pending</option><option value="confirmed">Confirm</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='confirmed'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="confirmed">Confirmed</option><option value="processing">Start processing</option><option value="cancelled">Cancel</option></select>} @else if(order.status==='processing'){<select aria-label="Update order status" [value]="order.status" [disabled]="orderActionBusyId()===order.resourceId" (change)="updateOrderStatus(order,$any($event.target).value)"><option value="processing">Processing</option><option value="completed">Complete</option><option value="cancelled">Cancel</option></select>} @else {<span class="muted">Final state</span>}</td><td><button class="button secondary small" type="button" (click)="openPaymentTracker(order)">{{selectedPaymentOrder()?.resourceId===order.resourceId?'Viewing':'Track payment'}}</button></td><td><button class="button secondary small" type="button" (click)="openShipmentTracker(order)">{{selectedShipmentOrder()?.resourceId===order.resourceId?'Viewing':'Track shipment'}}</button></td></tr>} @empty {<tr><td colspan="8" class="empty-state">No orders yet. Orders created through checkout or POS will appear here.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{orders().length}} database orders</div></section>
            @if(selectedPaymentOrder(); as paymentOrder){<section class="panel product-panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Payment tracking · {{paymentOrder.id}}</h2><p>Record cash, cash on delivery, bank transfer, mobile money, card-terminal, or other offline payments. Confirm receipt manually.</p></div><button class="button secondary small" type="button" (click)="selectedPaymentOrder.set(null);paymentDetails.set(null)">Close</button></div>@if(paymentDetailsBusy()){<p style="padding:16px">Loading payment history…</p>} @else if(paymentDetails()){<div style="display:flex;gap:20px;flex-wrap:wrap;padding:12px 17px"><div><small>Total</small><strong style="display:block">{{money(paymentDetails().totalMinor,paymentDetails().currency)}}</strong></div><div><small>Recorded as received</small><strong style="display:block">{{money(paymentDetails().paidAmountMinor,paymentDetails().currency)}}</strong></div><div><small>Remaining balance</small><strong style="display:block">{{money(paymentDetails().balanceMinor,paymentDetails().currency)}}</strong></div></div><form class="customer-form" (submit)="recordManualPayment($event)"><label>Method<select [value]="paymentMethod()" (change)="paymentMethod.set($any($event.target).value)"><option value="cash">Cash</option><option value="cash_on_delivery">Cash on delivery</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="card_terminal">Card terminal</option><option value="other">Other</option></select></label><label>Amount ({{paymentDetails().currency}})<input type="number" min="0.01" step="0.01" required [value]="paymentAmount()" (input)="paymentAmount.set($any($event.target).value)" placeholder="0.00"></label><label>Reference (optional)<input maxlength="200" [value]="paymentReference()" (input)="paymentReference.set($any($event.target).value)" placeholder="Receipt or transfer reference"></label><label>Note (optional)<input maxlength="1000" [value]="paymentNote()" (input)="paymentNote.set($any($event.target).value)" placeholder="Who collected it, transfer details…"></label><label>Receipt status<select [value]="paymentRecordStatus()" (change)="paymentRecordStatus.set($any($event.target).value)"><option value="succeeded">Received / verified</option><option value="pending">Expected / not yet received</option></select></label><button class="button primary small" type="submit" [disabled]="paymentSaveBusy()"> {{paymentSaveBusy()?'Saving…':'Record offline payment'}} </button></form><div class="table-wrap"><table><thead><tr><th>DATE</th><th>METHOD</th><th>REFERENCE / NOTE</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>@for(payment of paymentDetails().payments;track payment.id){<tr><td>{{payment.createdAt}}</td><td>{{orderStatusLabel(payment.providerPayload?.method ?? 'other')}}</td><td>{{payment.providerPayload?.reference || payment.providerPayload?.note || '—'}}</td><td class="total">{{money(payment.amountMinor,payment.currency)}}</td><td>{{orderStatusLabel(payment.status)}}</td><td>@if(payment.status==='pending'){<button class="button secondary small" type="button" (click)="finalizeManualPayment(payment.id,'succeeded')">Confirm received</button><button class="button secondary small" type="button" (click)="finalizeManualPayment(payment.id,'cancelled')">Cancel</button>} @else {<span class="muted">Recorded</span>}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">No payment records yet. Record the first offline payment above.</td></tr>}</tbody></table></div></div>}</section>}
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
                @if(shipmentDetails(); as shipmentData){<div class="table-wrap"><table><thead><tr><th>STAGE</th><th>COURIER</th><th>TRACKING</th><th>EXPECTED</th><th>NOTES</th><th>UPDATED</th></tr></thead><tbody>@for(shipment of shipmentData.fulfillments;track shipment.id){<tr><td><span class="status" [class]="statusClass(shipment.stage)">{{orderStatusLabel(shipment.stage)}}</span></td><td>{{shipment.carrier || 'Not assigned'}}</td><td>@if(shipment.trackingUrl){<a [href]="shipment.trackingUrl" target="_blank" rel="noopener noreferrer">{{shipment.trackingNumber || 'Open tracking'}}</a>} @else { {{shipment.trackingNumber || '—'}} }</td><td>{{shipment.estimatedDeliveryDate || '—'}}</td><td>{{shipment.notes || '—'}}</td><td>{{shipment.updatedAt}}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">No shipment has been recorded yet.</td></tr>}</tbody></table></div>}
              }
            </section>}
          }
          @if (activeNav() === 'Customers') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Customers</h2><p>Customer records are saved to your organization.</p></div><button class="button primary small" type="button" (click)="toggleCustomerForm()">＋ Add customer</button></div>
              @if(customerFormOpen()){<form class="customer-form" (submit)="createCustomer($event)"><label>Display name<input name="displayName" maxlength="180" placeholder="Customer name"></label><label>Email<input name="email" type="email" maxlength="254" placeholder="customer@example.com"></label><label>Phone<input name="phone" maxlength="80" placeholder="+212…"></label>@if(customerSaveError()){<p role="alert">{{customerSaveError()}}</p>}<button class="button primary" type="submit" [disabled]="customerSaveBusy()">{{customerSaveBusy()?'Saving…':'Save customer'}}</button></form>}
              <div class="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>PHONE</th></tr></thead><tbody>@for(customer of customers();track customer.id){<tr><td>{{customer.displayName || 'Unnamed customer'}}</td><td>{{customer.email || '—'}}</td><td>{{customer.phone || '—'}}</td></tr>} @empty {<tr><td colspan="3" class="empty-state">No customer records yet. Add a customer to get started.</td></tr>}</tbody></table></div><div class="panel-footer">Showing {{customers().length}} customers</div></section>
          }
          @if (activeNav() === 'Inventory') {
            <section class="panel product-panel"><div class="panel-heading"><div><h2>Inventory</h2><p>Adjust stock by variant and location. Reserved quantities are protected.</p></div></div>
              <form class="customer-form" (submit)="createInventoryLocation($event)"><label>New location<input name="name" required maxlength="180" placeholder="e.g. Main stockroom"></label><button class="button primary" type="submit" [disabled]="inventoryBusy()">{{inventoryBusy()?'Saving…':'Add location'}}</button></form>
              @if(inventoryError()){<p role="alert" style="padding:0 17px;color:#a44737;font-size:13px">{{inventoryError()}}</p>}
              <form class="customer-form" (submit)="createInventoryLevel($event)"><label>Location<select name="locationId" required><option value="">Choose a location</option>@for(location of locationOptions();track location.id){<option [value]="location.id">{{location.name}}</option>}</select></label><label>Product variant<select name="variantId" required><option value="">Choose a product</option>@for(product of products();track product.variantId){@if(product.variantId){<option [value]="product.variantId">{{product.name}} · {{product.sku}}</option>}}</select></label><label>Quantity on hand<input name="quantityOnHand" type="number" min="0" required value="0"></label><label>Reorder point<input name="reorderPoint" type="number" min="0" placeholder="Optional"></label><button class="button primary" type="submit" [disabled]="inventoryBusy()">{{inventoryBusy()?'Saving…':'Set stock level'}}</button></form>
              <div class="table-wrap"><table><thead><tr><th>LOCATION</th><th>PRODUCT</th><th>ON HAND</th><th>RESERVED</th><th>REORDER</th><th>ADJUST STOCK</th></tr></thead><tbody>@for(item of inventory();track item.locationId + ':' + (item.variantId || 'empty')){<tr><td>{{item.locationName}}</td><td>{{item.productName || 'No stock assigned'}}</td><td>{{item.quantityOnHand ?? '—'}}</td><td>{{item.quantityReserved ?? '—'}}</td><td>{{item.reorderPoint ?? '—'}}</td><td>@if(item.variantId){<form class="inline-adjust" (submit)="adjustInventory($event,item)"><input name="quantityOnHand" type="number" min="0" required [value]="item.quantityOnHand ?? 0" aria-label="New on-hand quantity"><input name="reorderPoint" type="number" min="0" [value]="item.reorderPoint ?? ''" aria-label="Reorder point" placeholder="Reorder"><button type="submit" aria-label="Save stock adjustment">Save</button></form>} @else {<span class="muted">Add a variant first</span>}</td></tr>} @empty {<tr><td colspan="6" class="empty-state">Create a stock location to start tracking inventory.</td></tr>}</tbody></table></div><div class="panel-footer">Stock levels are persisted in PostgreSQL</div></section>
          }
          <footer class="page-footer"><span>© 2026 Dollareus</span><span>● Preview environment</span><a href="https://github.com/marvenpiadri/dollareus" target="_blank" rel="noreferrer">Developer docs ↗</a></footer>
        </div>
      </main>
      @if (productEditorOpen()) { <div role="presentation" style="position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#17201680" (click)="closeProductEditor()"><section role="dialog" aria-modal="true" aria-labelledby="product-editor-title" style="width:min(100%,520px);padding:28px;background:white;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 80px #0002" (click)="$event.stopPropagation()"><div style="display:flex;justify-content:space-between;align-items:start;gap:16px"><div><p class="eyebrow">PRODUCT CATALOG</p><h2 id="product-editor-title" style="margin:0 0 8px;font-size:24px">{{ editingProduct() ? 'Edit product' : 'Add a product' }}</h2><p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.6">{{ editingProduct() ? 'Update product details and its default variant price/SKU. Editing additional variants and product images is not available yet.' : 'Create a draft product in your database. Publishing and product images are not available yet.' }}</p></div><button type="button" aria-label="Close product editor" (click)="closeProductEditor()" style="border:0;background:none;font-size:24px;color:#64748b">×</button></div><form style="display:grid;gap:13px" (submit)="saveProduct($event)"><label style="display:grid;gap:6px;font-size:14px">Product name<input name="name" required maxlength="180" [value]="editingProduct()?.name ?? ''" placeholder="e.g. Handmade ceramic bowl" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">Product URL slug<input name="slug" required maxlength="180" pattern="[a-z0-9]+(-[a-z0-9]+)*" [value]="editingProduct()?.slug ?? ''" placeholder="handmade-ceramic-bowl" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">Description<textarea name="description" maxlength="10000" rows="3" placeholder="Describe your product" style="padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical">{{ editingProduct()?.description ?? '' }}</textarea></label>@if (editingProduct()) { <label style="display:grid;gap:6px;font-size:14px">Status<select name="status" [value]="editingProduct()?.status === 'Active' ? 'active' : editingProduct()?.status === 'Archived' ? 'archived' : 'draft'" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label> }<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label style="display:grid;gap:6px;font-size:14px">Price ({{ editingProduct()?.currency ?? storeCurrency() }})<input name="price" type="number" min="0" step="0.01" required [value]="editingProduct() ? ((editingProduct()?.priceMinor ?? 0) / 100).toFixed(2) : '0.00'" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label><label style="display:grid;gap:6px;font-size:14px">SKU (optional)<input name="sku" maxlength="100" [value]="editingProduct()?.sku === '—' ? '' : editingProduct()?.sku ?? ''" placeholder="SKU-001" style="height:42px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px"></label></div>@if (productSaveError()) { <p role="alert" style="margin:0;color:#a44737;font-size:14px">{{ productSaveError() }}</p> }<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px"><button type="button" class="button secondary" (click)="closeProductEditor()">Cancel</button><button type="submit" class="button primary" [disabled]="productSaveBusy()">{{ productSaveBusy() ? 'Saving…' : editingProduct() ? 'Save changes' : 'Save draft product' }}</button></div></form></section></div> }
      @if (toast()) { <div class="toast" role="status"><span>✓</span>{{ toast() }}<button type="button" aria-label="Dismiss" (click)="toast.set('')">×</button></div> }
    </div>
    }
  `,
  styles: [`
    :host{display:block;min-height:100vh;color:#0f172a}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.shell{min-height:100vh;background:#f8fafc}.sidebar{position:fixed;inset:0 auto 0 0;width:245px;padding:23px 14px 13px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:5}.brand{display:flex;align-items:center;gap:10px;padding:0 8px 25px;color:#0f172a;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.8px}.brand-mark{display:grid;place-items:center;width:37px;height:37px;border-radius:11px;background:#f0fdf4;color:#238636;font-size:23px}.brand small{display:block;margin-top:4px;font-size:10px;letter-spacing:1.4px;color:#64748b}.store-switch{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;text-align:left;margin-bottom:27px}.store-avatar,.user-avatar{display:grid;place-items:center;width:33px;height:33px;border-radius:9px;background:#f0fdf4;color:#238636;font-weight:750}.store-switch>span:nth-child(2),.user>span:nth-child(2){display:flex;flex:1;flex-direction:column;gap:4px}.store-switch b,.user b{font-size:13px}.store-switch small,.user small{font-size:11px;color:#64748b}.chevron{color:#64748b}.nav-heading{margin:0 0 8px;padding:0 11px;font-size:11px;letter-spacing:1.1px;color:#64748b;font-weight:750}.nav-item{display:flex;align-items:center;gap:11px;width:100%;min-height:42px;height:auto;margin:2px 0;padding:0 11px;border:0;border-radius:7px;background:transparent;text-align:left;color:#475569;font-size:13px}.nav-item:hover,.nav-item.active{background:#f0fdf4;color:#39623b}.nav-item.active{font-weight:750}.nav-symbol{width:18px;text-align:center;font-size:16px}.count{margin-left:auto;padding:3px 6px;background:#dcfce7;border-radius:4px;font-size:11px}.channels-heading{margin-top:25px}.sidebar-bottom{margin-top:auto}.help-card{padding:13px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:13px}.help-card>span{display:grid;place-items:center;width:26px;height:26px;margin-bottom:9px;background:#dcfce7;border-radius:8px;color:#238636}.help-card b{font-size:13px}.help-card p{font-size:12px;line-height:1.55;color:#64748b;margin:6px 0 10px}.help-card button{padding:0;border:0;background:none;color:#238636;font-size:12px;font-weight:700}.user{position:relative;display:flex;align-items:center;gap:9px;padding:12px 4px 0;border-top:1px solid #e2e8f0}.user-avatar{border-radius:50%;font-size:11px}.user>button{border:0;background:none;color:#8d9589;font-size:19px}.main{min-height:100vh;margin-left:245px}.topbar{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 34px;background:#ffffffef;border-bottom:1px solid #e2e8f0;backdrop-filter:blur(10px)}.breadcrumbs{display:flex;gap:10px;align-items:center;font-size:12px;color:#939a90}.breadcrumbs b{color:#40483d}.top-actions{display:flex;align-items:center;gap:13px}.global-search,.product-search{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#858d82}.global-search{width:245px}.global-search input,.product-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;font-size:12px;color:#0f172a}.global-search input::placeholder,.product-search input::placeholder{color:#a0a69d}.global-search kbd{padding:3px 5px;border:1px solid #e2e8f0;border-radius:4px;background:white;color:#9aa095;font-size:10px;white-space:nowrap}.icon-button{position:relative;width:33px;height:33px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#687066;font-size:19px}.icon-button i{position:absolute;right:7px;top:6px;width:5px;height:5px;background:#d98c60;border-radius:50%}.demo-pill{font-size:11px;color:#858d82;white-space:nowrap}.demo-pill i{display:inline-block;width:6px;height:6px;margin-right:5px;background:#238636;border-radius:50%}.content{max-width:1600px;margin:auto;padding:30px 34px 18px}.welcome{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.eyebrow{font-size:11px;letter-spacing:1.15px;color:#838b7f;font-weight:750;margin:0}.welcome h1{margin:10px 0 7px;font-size:25px;letter-spacing:-1px;line-height:1.2}.subtitle{margin:0;color:#64748b;font-size:13px}.actions{display:flex;gap:8px}.button{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 12px;border:1px solid #e1e6dc;border-radius:8px;font-size:12px;font-weight:650;white-space:nowrap}.secondary{background:white;color:#4f584c}.primary{background:#238636;color:white;border-color:#238636}.primary:hover{background:#1f6f2c}.setup-banner{display:flex;align-items:center;gap:12px;padding:13px 16px;margin-bottom:18px;border:1px solid #bbf7d0;border-radius:10px;background:#f0f6ed}.banner-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;background:#e0ecd9;color:#4d784a;font-size:24px}.banner-copy{flex:1;min-width:0}.banner-copy b{font-size:13px;color:#365538}.banner-copy p{margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.5}.progress{font-size:11px;color:#687e62;white-space:nowrap}.progress i{display:inline-block;width:38px;height:4px;margin-right:5px;border-radius:4px;background:linear-gradient(to right,#238636 40%,#dce7d7 40%)}.setup-banner>button{border:0;background:none;color:#238636;font-size:12px;font-weight:750;white-space:nowrap}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:18px}.metric,.panel{min-width:0;border:1px solid #e2e8f0;border-radius:10px;background:white;box-shadow:0 2px 6px #24351f04}.metric{padding:15px 15px 12px}.metric-top{display:flex;align-items:center;justify-content:space-between;color:#788074;font-size:12px}.metric-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;font-size:17px}.green{background:#edf5e9;color:#238636}.purple{background:#f1edfa;color:#8976bd}.peach{background:#fbefe7;color:#bd8560}.amber{background:#fcf4df;color:#bb9441}.metric>strong{display:flex;align-items:center;gap:7px;margin:12px 0;font-size:22px;letter-spacing:-.7px;white-space:nowrap}.metric em{padding:4px 5px;border-radius:4px;background:#edf6e9;color:#238636;font-size:10px;letter-spacing:0;font-style:normal}.metric strong small{font-size:11px;letter-spacing:0;color:#a0a69d;font-weight:500}.metric footer{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:25px;padding-top:9px;border-top:1px solid #f0f2ed;color:#a0a69d;font-size:10px}.metric footer button,.panel-heading>button,.panel-footer button{padding:0;border:0;background:none;color:#238636;font-size:11px;font-weight:700;white-space:nowrap}.spark{font-size:16px;letter-spacing:1px;line-height:1}.green-spark{color:#9dbd94}.purple-spark{color:#c4b5e2}.two-column{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(280px,1fr);gap:15px;margin-bottom:18px}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 17px 14px}.panel-heading h2{margin:0;font-size:14px;font-weight:750}.panel-heading p{margin:5px 0 0;color:#939a90;font-size:11px}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}thead{background:#f8fafc}th{height:32px;padding:0 10px;border-top:1px solid #f0f2ee;border-bottom:1px solid #f0f2ee;color:#9ba197;font-size:10px;letter-spacing:.7px;font-weight:750}td{height:49px;padding:0 10px;border-bottom:1px solid #f0f2ee;color:#475569;font-size:11px}th:first-child,td:first-child{padding-left:17px}.order-id{color:#238636;font-weight:750}.total{color:#3f483d;font-weight:700}.channel-dot{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#84a67b}.channel-dot.mageus{background:#a18cc9}.channel-dot.pos{background:#d4a06d}.status{display:inline-block;padding:5px 7px;border-radius:5px;font-size:10px;font-weight:650}.status.paid{background:#edf5e9;color:#238636}.status.processing{background:#f0edfa;color:#8976b7}.status.pending{background:#fbf2df;color:#a98737}.status.draft{background:#f1f2ef;color:#8e9589}.panel-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 17px;border-top:1px solid #eff1ed;color:#9aa096;font-size:10px}.channel-row{display:flex;align-items:center;gap:9px;padding:11px 16px;border-bottom:1px solid #f0f2ed}.channel-icon{display:grid;place-items:center;width:32px;height:32px;border:1px solid #e2e8f0;border-radius:8px;color:#657b5c;font-size:16px;flex:none}.mageus-icon{background:#f2eff9;color:#6d6392;font-weight:800}.qr-icon{background:#eff5ed}.channel-row>span:nth-child(2){display:flex;flex:1;flex-direction:column;gap:4px}.channel-row b{font-size:11px;color:#4a5247}.channel-row small{font-size:10px;color:#9ba197}.channel-row em{font-size:10px;font-style:normal;white-space:nowrap}.connected{color:#238636}.channel-row>button{padding:5px 8px;border:1px solid #e2e8f0;border-radius:5px;background:white;color:#5a7654;font-size:10px;font-weight:700}.add-channel{display:block;width:calc(100% - 32px);height:31px;margin:11px 16px 14px;border:1px dashed #cbd5e1;border-radius:7px;background:#ffffff;color:#687b61;font-size:11px}.product-panel{margin-bottom:0}.product-heading{padding-bottom:14px}.product-actions{display:flex;align-items:center;gap:8px}.product-search{width:175px;height:32px}.small{height:32px;padding:0 10px;font-size:11px}.filters{display:flex;gap:17px;align-items:center;padding:0 17px;border-bottom:1px solid #eef0eb;overflow-x:auto}.filters button{position:relative;display:flex;align-items:center;gap:6px;height:38px;padding:0;border:0;background:none;color:#8c9488;font-size:11px;white-space:nowrap}.filters button.selected{color:#426e3f;font-weight:750}.filters button.selected:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#58834f}.filters button span{padding:3px 5px;border-radius:4px;background:#f0f2ed;color:#8d9588;font-size:10px}.filters button.selected span{background:#e9f2e5;color:#57804d}.products-table th{height:35px}.products-table td{height:57px}.product-cell{display:flex;align-items:center;gap:9px}.product-cell>span:nth-child(2){display:flex;flex-direction:column;gap:4px}.product-cell b{font-size:11px;color:#41483e}.product-cell small{font-size:10px;color:#a0a69d}.product-art{display:grid;place-items:center;width:34px;height:34px;border-radius:8px;font-size:11px;font-weight:750;flex:none}.clay{background:#f1e6dc;color:#a2795d}.sage{background:#e5eee1;color:#65835b}.sand{background:#f3ecda;color:#9c8756}.blue{background:#e2eaf1;color:#68869f}.olive{background:#e9eadc;color:#7d8050}.muted{color:#64748b}.low{color:#b78a40;font-weight:700}.empty{color:#c07965}.more{border:0;background:none;color:#92998e;font-size:18px}.empty-state{text-align:center;color:#838b80}.empty-state button{border:0;background:none;color:#4f7849;font-size:11px;font-weight:700}.page-footer{display:flex;justify-content:space-between;gap:10px;padding:19px 2px 3px;color:#a0a69c;font-size:10px}.page-footer a{color:#818a7d;text-decoration:none}.customer-form{display:flex;align-items:end;flex-wrap:wrap;gap:10px;padding:16px 17px;border-bottom:1px solid #eef0eb}.customer-form label{display:grid;gap:6px;flex:1;min-width:150px;color:#6f786a;font-size:11px;font-weight:700}.customer-form select{height:42px;min-width:140px;padding:0 10px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;font-size:14px}.shipment-form{align-items:stretch}.shipment-form label{min-width:190px}.shipment-form button{align-self:end;min-height:42px;padding:0 16px}.customer-form input{height:42px;min-width:0;padding:0 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px}.customer-form p{width:100%;margin:0;color:#a44737;font-size:12px}.inline-adjust{display:flex;gap:4px;align-items:center}.inline-adjust input{width:88px;height:36px;padding:0 5px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px}.inline-adjust button{height:36px;padding:0 7px;border:1px solid #cbd5e1;border-radius:5px;background:#edf5e9;color:#238636;font-size:11px;font-weight:700}.toast{position:fixed;right:24px;bottom:24px;z-index:10;display:flex;align-items:center;gap:10px;max-width:min(440px,calc(100vw - 32px));padding:12px 14px;border:1px solid #bbf7d0;border-radius:9px;background:white;box-shadow:0 12px 35px #263b201c;color:#485345;font-size:12px;line-height:1.5}.toast>span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#edf5e9;color:#238636}.toast button{margin-left:4px;border:0;background:none;color:#92998e;font-size:18px}@media(max-width:1200px){.sidebar{width:220px}.main{margin-left:220px}.content{padding:25px 23px 16px}.topbar{padding:0 23px}.metrics{gap:9px}.metric{padding:12px}.metric>strong{font-size:20px}.two-column{grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr)}}@media(max-width:950px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.two-column{grid-template-columns:1fr}.welcome h1{font-size:22px}}@media(max-width:700px){.sidebar{position:static;width:auto;height:auto;padding:11px 13px 8px;border-right:0;border-bottom:1px solid #e2e8f0}.brand{padding:0 3px 10px;font-size:19px}.brand-mark{width:33px;height:33px}.store-switch,.nav-heading,.nav-item,.sidebar-bottom{display:none}.main{margin-left:0}.topbar{position:static;height:60px;padding:0 14px}.global-search{width:35px;padding:0 8px;border:0;background:transparent}.global-search input,.global-search kbd,.demo-pill{display:none}.top-actions{gap:7px}.content{padding:21px 13px 15px}.welcome{align-items:flex-start;flex-direction:column;gap:14px}.welcome h1{font-size:22px}.actions{width:100%}.actions .button{flex:1}.setup-banner{flex-wrap:wrap;padding:11px}.banner-copy{flex:1;width:calc(100% - 50px)}.progress{margin-left:45px}.metrics{gap:8px}.metric{padding:11px 10px}.metric>strong{font-size:18px;flex-wrap:wrap;gap:4px}.metric footer{font-size:10px}.spark{display:none}.panel-heading{padding:14px 12px}.panel-footer{padding:10px 12px}.filters{padding:0 12px;gap:12px}.product-heading{align-items:flex-start;flex-direction:column}.product-actions{width:100%}.product-search{flex:1;width:auto}.page-footer{flex-wrap:wrap}.page-footer a{margin-left:auto}}@media(max-width:380px){.metrics{grid-template-columns:1fr 1fr}.metric>strong{font-size:16px}.filters{gap:10px}.filters button{font-size:10px}}
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
          tone: 'sage'
        };
      }));
      const [orderRows, customerRows, inventoryRows] = await Promise.all([
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/orders'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/customers'),
        this.apiRequest('/api/v1/organizations/' + encodeURIComponent(organization.id) + '/inventory')
      ]);
      this.orders.set((Array.isArray(orderRows) ? orderRows : []).map((order: any): OrderRow => ({
        id: '#' + String(order.orderNumber), resourceId: String(order.id), customer: String(order.customerEmail ?? 'Guest checkout'),
        channel: 'Online store', totalMinor: Number(order.totalMinor ?? 0), currency: String(order.currency ?? store.defaultCurrency ?? 'MAD'),
        status: String(order.status ?? 'pending') as OrderRow['status'], paymentStatus: String(order.effectivePaymentStatus ?? order.paymentStatus ?? 'unpaid')
      })));
      this.customers.set((Array.isArray(customerRows) ? customerRows : []).map((customer: any): CustomerRow => ({
        id: String(customer.id), displayName: String(customer.displayName ?? [customer.firstName, customer.lastName].filter(Boolean).join(' ')),
        email: typeof customer.email === 'string' ? customer.email : null, phone: typeof customer.phone === 'string' ? customer.phone : null
      })));
      this.inventory.set(Array.isArray(inventoryRows) ? inventoryRows as InventoryRow[] : []);
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
    {label:'Overview',symbol:'▦'},{label:'Orders',symbol:'▤'},{label:'Products',symbol:'◇'},{label:'Customers',symbol:'♙'},{label:'Inventory',symbol:'▱'}
  ];
  protected readonly channelNav: {label: NavItem; symbol: string}[] = [{label:'Online store',symbol:'▣'},{label:'Integrations',symbol:'⌘'}];
  protected readonly filters: ('All' | ProductStatus)[] = ['All','Active','Draft','Archived'];
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly orders = signal<OrderRow[]>([]);
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly inventory = signal<InventoryRow[]>([]);
  protected readonly customerFormOpen = signal(false);
  protected readonly customerSaveBusy = signal(false);
  protected readonly customerSaveError = signal('');
  protected readonly inventoryBusy = signal(false);
  protected readonly inventoryError = signal('');
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
        this.shipmentStage.set(latest.stage);
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
  protected pageDescription(): string { return this.activeNav() === 'Products' ? 'Manage your catalog, prices and product availability.' : this.activeNav() === 'Orders' ? 'Review orders and their saved item snapshots.' : this.activeNav() === 'Customers' ? 'Keep customer contact details and notes together.' : this.activeNav() === 'Inventory' ? 'Track stock by location and reorder threshold.' : 'Configure your business workspace and connected channels.'; }
  protected selectNav(item: NavItem): void { this.activeNav.set(item); if (!['Overview','Products','Orders','Customers','Inventory'].includes(item)) this.notify(item + ' is planned for a future milestone.'); }
  protected addProduct(): void { this.activeNav.set('Products'); this.editingProduct.set(null); this.productSaveError.set(''); this.productEditorOpen.set(true); }
  protected editProduct(product: ProductRow): void { this.editingProduct.set(product); this.productSaveError.set(''); this.productEditorOpen.set(true); }
  protected closeProductEditor(): void { if (!this.productSaveBusy()) { this.productEditorOpen.set(false); this.editingProduct.set(null); } }
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
