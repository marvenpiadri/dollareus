import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { OrderRow, ProductRow } from '../../shared/models/commerce.models';
import { MetricCard, Panel, StatusBadge, EmptyState } from '../../shared/components';

type OverviewDestination = 'Orders' | 'Products' | 'Integrations' | 'API & channels' | 'POS' | 'QR Studio' | 'Inventory';

@Component({
  selector: 'dlr-overview-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MetricCard, Panel, StatusBadge, EmptyState],
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

  protected readonly totalRevenue = computed(() => {
    const validOrders = this.orders();
    if (!validOrders.length) return '—';
    const sum = validOrders
      .filter(o => o.status === 'confirmed' || (o as any).status === 'completed' || (o as any).paymentStatus === 'paid')
      .reduce((acc, o) => acc + (o.totalMinor || 0), 0);
    const currency = validOrders[0]?.currency || 'MAD';
    return this.money(sum, currency);
  });

  protected readonly averageOrderValue = computed(() => {
    const list = this.orders();
    if (!list.length) return '—';
    const sum = list.reduce((acc, o) => acc + (o.totalMinor || 0), 0);
    const currency = list[0]?.currency || 'MAD';
    return this.money(Math.round(sum / list.length), currency);
  });

  protected money(minor: number, currency: string): string {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }
}
