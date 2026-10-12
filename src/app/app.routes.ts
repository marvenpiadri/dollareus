import { Routes } from '@angular/router';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { PublicHomeComponent } from './features/public-home/public-home.component';
import { QrStudioComponent } from './features/qr-studio/qr-studio.component';
import { PublicMenuComponent } from './features/restaurants/public-menu/public-menu.component';
import { WorkspaceComponent } from './features/workspace/workspace.component';
import { PublicStorefrontComponent } from './features/storefront/public-storefront.component';
import { PublicCatalogComponent } from './features/storefront/public-catalog.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PublicHomeComponent },
  { path: 'qr', component: QrStudioComponent },
  { path: 'login', component: AuthPageComponent },
  { path: 'signup', component: AuthPageComponent },
  { path: 'menu', component: PublicMenuComponent },
  { path: ':storeHandle/:locationSlug/menu', component: PublicMenuComponent },
  { path: ':storeHandle/:locationSlug/products/:productSlug', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/category/:categorySlug', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/catalog', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/products', component: PublicCatalogComponent },
  { path: ':storeHandle/:locationSlug/services', component: PublicStorefrontComponent },
  { path: ':storeHandle/:locationSlug', component: PublicStorefrontComponent },
  { path: ':storeSlug/menu', component: PublicMenuComponent },
  { path: 'app', component: WorkspaceComponent },
  { path: '**', redirectTo: '' }
];
