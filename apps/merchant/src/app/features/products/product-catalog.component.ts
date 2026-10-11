import { Component, input, output } from '@angular/core';
import { CategoryRow, ProductRow, ProductStatus } from '../../shared/models/commerce.models';

type ProductFilter = 'All' | ProductStatus;

@Component({
  selector: 'dlr-product-catalog',
  standalone: true,
  templateUrl: './product-catalog.component.html',
  styleUrl: './product-catalog.component.css'
})
export class ProductCatalogComponent {
  readonly products = input.required<ProductRow[]>();
  readonly filteredProducts = input.required<ProductRow[]>();
  readonly categories = input.required<CategoryRow[]>();
  readonly productFilter = input<ProductFilter>('All');
  readonly search = input('');
  readonly productEditorOpen = input(false);
  readonly editingProduct = input<ProductRow | null>(null);
  readonly productSaveBusy = input(false);
  readonly productSaveError = input('');
  readonly imageUploadBusy = input(false);
  readonly imageUploadError = input('');
  readonly imageUploadNote = input('');
  readonly imageAltText = input('');
  readonly imageMaxWidth = input(1200);
  readonly imageMaxHeight = input(1200);
  readonly storeCurrency = input('MAD');

  readonly searchChangeRequested = output<string>();
  readonly addProductRequested = output<void>();
  readonly productFilterChangeRequested = output<ProductFilter>();
  readonly editProductRequested = output<ProductRow>();
  readonly clearFiltersRequested = output<void>();
  readonly selectNavRequested = output<'Products'>();
  readonly closeProductEditorRequested = output<void>();
  readonly saveProductRequested = output<Event>();
  readonly uploadProductImageRequested = output<Event>();
  readonly imageMaxWidthChangeRequested = output<number>();
  readonly imageMaxHeightChangeRequested = output<number>();
  readonly imageAltTextChangeRequested = output<string>();

  protected filterCount(filter: ProductFilter): number {
    return filter === 'All' ? this.products().length : this.products().filter(product => product.status === filter).length;
  }
  protected productCategoryName(product: ProductRow): string {
    const names = (product.categoryIds ?? []).map(id => this.categories().find(category => category.id === id)?.name).filter((name): name is string => Boolean(name));
    return names.join(', ') || 'Uncategorized';
  }
  protected hasActiveCategories(): boolean {
    return this.categories().some(category => category.status === 'active');
  }
  protected money(minor: number, currency: string): string {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
  }
}
