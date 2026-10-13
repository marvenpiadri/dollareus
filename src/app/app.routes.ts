import { Routes } from '@angular/router';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { PublicHomeComponent } from './features/public-home/public-home.component';
import { QrStudioComponent } from './features/qr-studio/qr-studio.component';
import { QrStudio } from './features/studio/qr-studio';
import { PublicMenuComponent } from './features/restaurants/public-menu/public-menu.component';
import { WorkspaceComponent } from './features/workspace/workspace.component';
import { PublicStorefrontComponent } from './features/storefront/public-storefront.component';
import { PublicCatalogComponent } from './features/storefront/public-catalog.component';
import { QrCreatePage } from './features/create/qr-create-page';
import { QrContentPage } from './features/create/qr-content-page';
import { QrProjectsView } from './features/projects/qr-projects-view';
import { QrScannerView } from './features/scanner/qr-scanner-view';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PublicHomeComponent },
  { path: 'qr/basic', component: QrStudioComponent },
  { path: 'qr', component: QrStudio },
  { path: 'qr/create', component: QrCreatePage, title: 'Create a QR Code | Dollareus' },
  { path: 'qr/create/:type', component: QrContentPage, title: 'QR Content | Dollareus' },
  { path: 'qr/projects', component: QrProjectsView, title: 'Saved QR Projects | Dollareus' },
  { path: 'qr/scan', component: QrScannerView, title: 'QR Scanner | Dollareus' },
  { path: 'login', component: AuthPageComponent },
  { path: 'signup', component: AuthPageComponent },
  { path: 'menu', component: PublicMenuComponent },
  { path: ':storeHandle/:locationSlug/menu', component: PublicMenuComponent },
  { path: ':storeHandle/:locationSlug/products/category/:categorySlug', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/products/:productSlug', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/catalog', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/products', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/services', component: PublicStorefrontComponent },
  // Keep the one-segment store menu route ahead of the generic two-segment
  // storefront route, otherwise /:storeSlug/menu is misread as handle/location.
  { path: ':storeSlug/menu', component: PublicMenuComponent },
  { path: ':storeHandle/:locationSlug', component: PublicStorefrontComponent },
  { path: 'app', component: WorkspaceComponent },
  { path: '**', redirectTo: '' }
];
