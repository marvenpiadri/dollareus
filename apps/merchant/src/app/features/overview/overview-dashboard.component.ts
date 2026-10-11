import { Component, input, output } from '@angular/core';
import { OrderRow, ProductRow } from '../../shared/models/commerce.models';

type OverviewDestination = 'Orders' | 'Products' | 'Integrations' | 'API & channels';

@Component({
  selector: 'dlr-overview-dashboard',
  standalone: true,
  templateUrl: './overview-dashboard.component.html',
  styleUrl: './overview-dashboard.component.css'
})
export class OverviewDashboardComponent {
  readonly orders = input.required<OrderRow[]>();
  readonly products = input.required<ProductRow[]>();
  readonly activeCount = input.required<number>();
  readonly lowStockCount = input.required<number>();
  readonly selectNavRequested = output<OverviewDestination>();
  readonly notifyRequested = output<string>();
  readonly qrRequested = output<void>();

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
