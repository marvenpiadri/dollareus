import { Component, input, output, signal } from '@angular/core';

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
  readonly stores = input<{ id: string; name?: string | null; slug?: string | null; locationSlug?: string | null; locationName?: string | null; city?: string | null }[]>([]);
  readonly selectedStoreId = input('');
  readonly ordersCount = input(0);
  readonly search = input('');
  readonly toast = input('');

  readonly navRequested = output<WorkspaceNavItem>();
  readonly storeChangeRequested = output<string>();
  readonly notifyRequested = output<string>();
  readonly signOutRequested = output<void>();
  readonly searchChangeRequested = output<string>();
  readonly dismissToastRequested = output<void>();
  readonly addStoreRequested = output<void>();
  readonly dark = signal(false);

  constructor() {
    if (typeof document !== 'undefined') this.dark.set(document.documentElement.dataset['theme'] === 'dark');
  }

  toggleTheme(): void {
    this.dark.update(value => !value);
    const theme = this.dark() ? 'dark' : 'light';
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['theme'] = theme;
      document.documentElement.classList.toggle('theme-dark', this.dark());
      document.documentElement.classList.toggle('theme-light', !this.dark());
      document.body?.classList.toggle('theme-dark', this.dark());
      document.body?.classList.toggle('theme-light', !this.dark());
    }
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('dollareus:theme', theme); } catch { /* Theme remains active for this session. */ }
  }
}
