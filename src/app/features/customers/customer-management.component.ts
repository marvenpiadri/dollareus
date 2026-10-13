import { Component, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
import { CustomerRow } from '../../shared/models/commerce.models';

import { Panel, EmptyState } from '../../shared/components';

@Component({
  selector: 'dlr-customer-management',
  imports: [Panel, EmptyState],
  templateUrl: './customer-management.component.html',
  styleUrl: './customer-management.component.css'
})
export class CustomerManagementComponent {
  readonly organizationId = input.required<string>();
  readonly notifyRequested = output<string>();
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly customerFormOpen = signal(false);
  protected readonly customerSaveBusy = signal(false);
  protected readonly customerSaveError = signal('');

  constructor(private readonly apiClient: ApiClientService) {
    effect(() => {
      const organizationId = this.organizationId();
      if (organizationId) void this.loadCustomers();
    });
  }

  private async loadCustomers(): Promise<void> {
    this.customerSaveError.set('');
    try {
      const rows = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/customers');
      this.customers.set((Array.isArray(rows) ? rows : []).map((customer: any): CustomerRow => ({
        id: String(customer.id),
        displayName: String(customer.displayName ?? [customer.firstName, customer.lastName].filter(Boolean).join(' ')),
        email: typeof customer.email === 'string' ? customer.email : null,
        phone: typeof customer.phone === 'string' ? customer.phone : null
      })));
    } catch (error) {
      this.customerSaveError.set(error instanceof Error ? error.message : 'Could not load customers.');
    }
  }

  protected async createCustomer(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const displayName = String(values.get('displayName') ?? '').trim() || null;
    const email = String(values.get('email') ?? '').trim() || null;
    const phone = String(values.get('phone') ?? '').trim() || null;
    if (!displayName && !email && !phone) { this.customerSaveError.set('Enter a name, email or phone number.'); return; }
    this.customerSaveBusy.set(true); this.customerSaveError.set('');
    try {
      const customer = await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/customers', {
        method: 'POST', body: JSON.stringify({ displayName, email, phone, metadata: {} })
      });
      this.customers.update(rows => [{ id: String(customer.id), displayName: String(customer.displayName ?? ''), email: customer.email ?? null, phone: customer.phone ?? null }, ...rows]);
      this.customerFormOpen.set(false);
      form.reset();
      this.notifyRequested.emit('Customer saved to your database.');
    } catch (error) {
      this.customerSaveError.set(error instanceof Error ? error.message : 'Could not save this customer.');
    } finally {
      this.customerSaveBusy.set(false);
    }
  }

  protected toggleCustomerForm(): void {
    this.customerFormOpen.update(value => !value);
  }
}
