import { Component, input, output } from '@angular/core';

type WorkspaceNavItem = 'Overview' | 'Orders' | 'POS' | 'Products' | 'Menus' | 'QR Studio' | 'Customers' | 'Inventory' | 'API & channels' | 'Integrations' | 'Settings';

@Component({
  selector: 'dlr-workspace-shell',
  standalone: true,
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.css'
})
export class WorkspaceShellComponent {
  readonly activeNav = input.required<WorkspaceNavItem>();
  readonly primaryNav = input.required<{ label: WorkspaceNavItem; symbol: string }[]>();
  readonly channelNav = input.required<{ label: WorkspaceNavItem; symbol: string }[]>();
  readonly storeName = input('');
  readonly storeSlug = input('');
  readonly ordersCount = input(0);
  readonly search = input('');
  readonly toast = input('');

  readonly navRequested = output<WorkspaceNavItem>();
  readonly notifyRequested = output<string>();
  readonly signOutRequested = output<void>();
  readonly searchChangeRequested = output<string>();
  readonly dismissToastRequested = output<void>();
}
