import { Component, input, output } from '@angular/core';
import { CustomerRow } from '../../shared/models/commerce.models';

@Component({
  selector: 'dlr-customer-management',
  standalone: true,
  templateUrl: './customer-management.component.html',
  styleUrl: './customer-management.component.css'
})
export class CustomerManagementComponent {
  readonly customers = input.required<CustomerRow[]>();
  readonly customerFormOpen = input(false);
  readonly customerSaveBusy = input(false);
  readonly customerSaveError = input('');
  readonly toggleRequested = output<void>();
  readonly createRequested = output<Event>();
}
