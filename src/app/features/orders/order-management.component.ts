import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FulfillmentStage, OrderRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-order-management',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './order-management.component.html',
  styleUrl: './order-management.component.css'
})
export class OrderManagementComponent {
  readonly orders = input.required<OrderRow[]>();
  readonly orderActionError = input('');
  readonly orderActionBusyId = input('');
  readonly selectedPaymentOrder = input<OrderRow | null>(null);
  readonly paymentDetails = input<any | null>(null);
  readonly paymentDetailsBusy = input(false);
  readonly paymentSaveBusy = input(false);
  readonly paymentMethod = input('cash');
  readonly paymentAmount = input('');
  readonly paymentReference = input('');
  readonly paymentNote = input('');
  readonly paymentRecordStatus = input('succeeded');
  readonly selectedShipmentOrder = input<OrderRow | null>(null);
  readonly shipmentDetails = input<any | null>(null);
  readonly shipmentBusy = input(false);
  readonly shipmentSaveBusy = input(false);
  readonly shipmentStage = input<FulfillmentStage>('preparing');
  readonly shipmentCarrier = input('');
  readonly shipmentTrackingNumber = input('');
  readonly shipmentTrackingUrl = input('');
  readonly shipmentEstimatedDate = input('');
  readonly shipmentNotes = input('');
  readonly selectedRefundOrder = input<OrderRow | null>(null);
  readonly refundDetails = input<any | null>(null);
  readonly refundBusy = input(false);
  readonly refundSaveBusy = input(false);
  readonly refundPaymentId = input('');
  readonly refundAmount = input('');
  readonly refundReason = input('');

  readonly updateOrderStatusRequested = output<{ order: OrderRow; status: string }>();
  readonly openPaymentTrackerRequested = output<OrderRow>();
  readonly openShipmentTrackerRequested = output<OrderRow>();
  readonly openRefundTrackerRequested = output<OrderRow>();
  readonly closePaymentRequested = output<void>();
  readonly recordManualPaymentRequested = output<Event>();
  readonly paymentMethodChangeRequested = output<string>();
  readonly paymentAmountChangeRequested = output<string>();
  readonly paymentReferenceChangeRequested = output<string>();
  readonly paymentNoteChangeRequested = output<string>();
  readonly paymentRecordStatusChangeRequested = output<string>();
  readonly finalizeManualPaymentRequested = output<{ paymentId: string; status: 'succeeded' | 'cancelled' }>();
  readonly closeShipmentRequested = output<void>();
  readonly saveShipmentRequested = output<Event>();
  readonly shipmentStageChangeRequested = output<FulfillmentStage>();
  readonly shipmentCarrierChangeRequested = output<string>();
  readonly shipmentTrackingNumberChangeRequested = output<string>();
  readonly shipmentTrackingUrlChangeRequested = output<string>();
  readonly shipmentEstimatedDateChangeRequested = output<string>();
  readonly shipmentNotesChangeRequested = output<string>();
  readonly closeRefundRequested = output<void>();
  readonly recordRefundRequested = output<Event>();
  readonly refundPaymentIdChangeRequested = output<string>();
  readonly refundAmountChangeRequested = output<string>();
  readonly refundReasonChangeRequested = output<string>();

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
