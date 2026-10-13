import { Component, HostListener, input, output, signal } from '@angular/core';

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
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  constructor() {
    let savedTheme: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        savedTheme = localStorage.getItem('dollareus:theme');
        this.collapsed.set(localStorage.getItem('dollareus:sidebar-collapsed') === 'true');
      }
    } catch {
      // Preferences still work for the current session when storage is unavailable.
    }

    if (typeof document !== 'undefined') {
      const prefersDark = savedTheme ? savedTheme === 'dark' : document.documentElement.dataset['theme'] === 'dark';
      this.dark.set(prefersDark);
      const theme = prefersDark ? 'dark' : 'light';
      document.documentElement.dataset['theme'] = theme;
      document.documentElement.classList.toggle('theme-dark', prefersDark);
      document.documentElement.classList.toggle('theme-light', !prefersDark);
      document.body?.classList.toggle('theme-dark', prefersDark);
      document.body?.classList.toggle('theme-light', !prefersDark);
    }
  }

  toggleCollapsed(): void {
    this.collapsed.update(value => !value);
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('dollareus:sidebar-collapsed', String(this.collapsed())); } catch { /* Keep the preference for this session. */ }
  }

  navigate(label: WorkspaceNavItem): void { this.navRequested.emit(label); this.mobileOpen.set(false); }

  @HostListener('document:keydown', ['$event'])
  handleSearchShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (typeof document !== 'undefined') document.getElementById('workspace-search')?.focus();
    }
    if (event.key === 'Escape' && this.mobileOpen()) this.mobileOpen.set(false);
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
