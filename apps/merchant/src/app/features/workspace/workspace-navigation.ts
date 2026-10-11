export type NavItem =
  | 'Overview'
  | 'Orders'
  | 'POS'
  | 'Products'
  | 'Menus'
  | 'QR Studio'
  | 'Customers'
  | 'Inventory'
  | 'API & channels'
  | 'Integrations'
  | 'Settings';

export interface WorkspaceNavigationItem {
  label: NavItem;
  symbol: string;
}

export const PRIMARY_NAVIGATION: WorkspaceNavigationItem[] = [
  { label: 'Overview', symbol: '▦' },
  { label: 'Orders', symbol: '▤' },
  { label: 'POS', symbol: '▣' },
  { label: 'Products', symbol: '◇' },
  { label: 'Menus', symbol: '☷' },
  { label: 'QR Studio', symbol: '▦' },
  { label: 'Customers', symbol: '♙' },
  { label: 'Inventory', symbol: '▱' }
];

export const CHANNEL_NAVIGATION: WorkspaceNavigationItem[] = [
  { label: 'API & channels', symbol: '⌘' },
  { label: 'Integrations', symbol: '⌘' }
];
