import { DatePipe } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import { FulfillmentStage, OrderRow, ShipmentDetails } from '../../shared/models/commerce.models';

import { Panel, StatusBadge, EmptyState } from '../../shared/components';

@Component({
  selector: 'dlr-order-management',
  imports: [DatePipe, Panel, StatusBadge, EmptyState],
  templateUrl: './order-management.component.html',
  styleUrl: './order-management.component.css'
})
export class OrderManagementComponent {
  readonly organizationId = input.required<string>();
  readonly orders = input.required<OrderRow[]>();
  readonly ordersChange = output<OrderRow[]>();
  readonly notifyRequested = output<string>();

  readonly orderActionBusyId = signal('');
  readonly orderActionError = signal('');
  readonly selectedPaymentOrder = signal<OrderRow | null>(null);
  readonly paymentDetails = signal<any | null>(null);
  readonly paymentDetailsBusy = signal(false);
  readonly paymentSaveBusy = signal(false);
  readonly paymentMethod = signal('cash');
  readonly paymentAmount = signal('');
  readonly paymentReference = signal('');
  readonly paymentNote = signal('');
  readonly paymentRecordStatus = signal('succeeded');
  readonly selectedRefundOrder = signal<OrderRow | null>(null);
  readonly refundDetails = signal<{ refunds: any[]; payments: any[]; totalMinor: number; currency: string } | null>(null);
  readonly refundBusy = signal(false);
  readonly refundSaveBusy = signal(false);
  readonly refundPaymentId = signal('');
  readonly refundAmount = signal('');
  readonly refundReason = signal('');
  readonly selectedShipmentOrder = signal<OrderRow | null>(null);
  readonly shipmentDetails = signal<{ orderId: string; fulfillments: ShipmentDetails[] } | null>(null);
  readonly shipmentBusy = signal(false);
  readonly shipmentSaveBusy = signal(false);
  readonly shipmentStage = signal<FulfillmentStage>('preparing');
  readonly shipmentCarrier = signal('');
  readonly shipmentTrackingNumber = signal('');
  readonly shipmentTrackingUrl = signal('');
  readonly shipmentEstimatedDate = signal('');
  readonly shipmentNotes = signal('');

  constructor(private readonly apiClient: ApiClientService) {}

  private updateOrderRows(update: (rows: OrderRow[]) => OrderRow[]): void {
    this.ordersChange.emit(update(this.orders()));
  }

  protected closePayment(): void { this.selectedPaymentOrder.set(null); this.paymentDetails.set(null); }
  protected closeShipment(): void { this.selectedShipmentOrder.set(null); this.shipmentDetails.set(null); }
  protected closeRefund(): void { this.selectedRefundOrder.set(null); this.refundDetails.set(null); }

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
      this.updateOrderRows(rows => rows.map(row => row.resourceId === order.resourceId ? { ...row, paymentStatus: String(result.paymentStatus ?? row.paymentStatus) } : row));
      this.paymentAmount.set('');
      this.paymentReference.set('');
      this.paymentNote.set('');
      await this.refreshPaymentDetails(order);
      this.notifyRequested.emit(this.paymentRecordStatus() === 'pending' ? 'Expected payment recorded.' : 'Offline payment recorded and audited.');
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
      this.updateOrderRows(rows => rows.map(row => row.resourceId === order.resourceId ? { ...row, paymentStatus: String(result.paymentStatus ?? row.paymentStatus) } : row));
      await this.refreshPaymentDetails(order);
      this.notifyRequested.emit(status === 'succeeded' ? 'Payment manually confirmed as received.' : 'Pending payment record cancelled.');
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
      this.updateOrderRows(rows => rows.map(row => row.resourceId === order.resourceId ? {
        ...row,
        paymentStatus: String(result.paymentStatus ?? row.paymentStatus),
        status: result.paymentStatus === 'refunded' ? 'refunded' : row.status
      } : row));
      this.refundAmount.set('');
      this.refundReason.set('');
      await this.refreshRefundDetails(order);
      this.notifyRequested.emit('Manual refund recorded and audited. No payment-provider transfer was initiated.');
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
      this.notifyRequested.emit('Shipment details saved and audited.');
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
      this.updateOrderRows((rows) => rows.map((row) => row.resourceId === order.resourceId ? { ...row, status: String(updated.status ?? status) as OrderRow['status'] } : row));
      this.notifyRequested.emit('Order status updated and audited.');
    } catch (error) { this.orderActionError.set(error instanceof Error ? error.message : 'Could not update order status.'); }
    finally { this.orderActionBusyId.set(''); }
  }

}