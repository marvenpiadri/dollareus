import { Component, computed, effect, input, output, signal } from '@angular/core';
import { ApiClientService } from '../../core/api/api-client.service';
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
  readonly categories = input.required<CategoryRow[]>();
  readonly organizationId = input.required<string>();
  readonly storeId = input.required<string>();
  readonly storeCurrency = input('MAD');
  readonly openEditorRequest = input(0);
  readonly search = input('');
  readonly searchChangeRequested = output<string>();
  readonly selectNavRequested = output<'Products'>();
  readonly notifyRequested = output<string>();
  readonly dataChanged = output<void>();

  protected readonly productFilter = signal<ProductFilter>('All');
  protected readonly productEditorOpen = signal(false);
  protected readonly editingProduct = signal<ProductRow | null>(null);
  protected readonly productSaveBusy = signal(false);
  protected readonly productSaveError = signal('');
  protected readonly imageUploadBusy = signal(false);
  protected readonly imageUploadError = signal('');
  protected readonly imageUploadNote = signal('');
  protected readonly imageAltText = signal('');
  protected readonly pendingProductImage = signal<File | null>(null);
  protected readonly categoryCreatorOpen = signal(false);
  protected readonly categoryNameDraft = signal('');
  protected readonly categoryCreateBusy = signal(false);
  protected readonly categoryCreateError = signal('');
  protected readonly newlySelectedCategoryIds = signal<string[]>([]);
  protected readonly filters: ProductFilter[] = ['All', 'Active', 'Draft', 'Archived'];
  protected readonly filteredProducts = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.productFilter();
    return this.products().filter(product =>
      (!query || [product.name, product.sku, product.category].some(value => value.toLowerCase().includes(query))) &&
      (filter === 'All' || product.status === filter)
    );
  });

  constructor(private readonly apiClient: ApiClientService) {
    let lastRequest = 0;
    effect(() => {
      const request = this.openEditorRequest();
      if (request > lastRequest) {
        lastRequest = request;
        this.editingProduct.set(null);
        this.productSaveError.set('');
        this.productEditorOpen.set(true);
      }
    });
  }

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
  protected clearFilters(): void {
    this.searchChangeRequested.emit('');
    this.productFilter.set('All');
  }
  protected addProduct(): void {
    this.selectNavRequested.emit('Products');
    this.editingProduct.set(null);
    this.productSaveError.set('');
    this.imageUploadError.set('');
    this.imageUploadNote.set('');
    this.pendingProductImage.set(null);
    this.categoryCreatorOpen.set(false);
    this.categoryNameDraft.set('');
    this.categoryCreateError.set('');
    this.newlySelectedCategoryIds.set([]);
    this.productEditorOpen.set(true);
  }
  protected editProduct(product: ProductRow): void {
    this.editingProduct.set(product);
    this.productSaveError.set('');
    this.imageUploadError.set('');
    this.imageUploadNote.set('');
    this.imageAltText.set('');
    this.pendingProductImage.set(null);
    this.categoryCreatorOpen.set(false);
    this.categoryNameDraft.set('');
    this.categoryCreateError.set('');
    this.newlySelectedCategoryIds.set([]);
    this.productEditorOpen.set(true);
  }
  protected closeProductEditor(): void {
    if (!this.productSaveBusy()) {
      this.productEditorOpen.set(false);
      this.editingProduct.set(null);
      this.categoryCreatorOpen.set(false);
      this.newlySelectedCategoryIds.set([]);
    }
  }

  protected selectProductImage(event: Event): void {
    const inputElement = event.currentTarget as HTMLInputElement;
    const file = inputElement.files?.[0] ?? null;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.imageUploadError.set('Choose a JPEG, PNG or WebP image.'); inputElement.value = ''; return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.imageUploadError.set('The original image must be 25 MB or smaller.'); inputElement.value = ''; return;
    }
    this.imageUploadError.set('');
    this.imageUploadNote.set('');
    this.pendingProductImage.set(file);
  }

  protected async uploadProductImage(event: Event): Promise<void> {
    const inputElement = event.currentTarget as HTMLInputElement;
    const file = inputElement.files?.[0];
    const product = this.editingProduct();
    if (!file || !product) return;
    this.imageUploadError.set(''); this.imageUploadNote.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.imageUploadError.set('Choose a JPEG, PNG or WebP image.'); inputElement.value = ''; return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.imageUploadError.set('The original image must be 25 MB or smaller.'); inputElement.value = ''; return;
    }
    this.imageUploadBusy.set(true);
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('This image has too many pixels. Choose a smaller original.'); }
      // Product photography uses a consistent 1:1 square crop throughout the catalog.
      // Center-crop the source, then downscale to a maximum 1200 × 1200 output.
      const cropSide = Math.min(bitmap.width, bitmap.height);
      const cropX = Math.floor((bitmap.width - cropSide) / 2);
      const cropY = Math.floor((bitmap.height - cropSide) / 2);
      const outputSide = Math.min(1200, cropSide);
      const canvas = document.createElement('canvas');
      canvas.width = outputSide; canvas.height = outputSide;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) { bitmap.close(); throw new Error('Your browser could not prepare the image.'); }
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, cropX, cropY, cropSide, cropSide, 0, 0, outputSide, outputSide);
      bitmap.close();
      let optimized: Blob | null = null;
      for (const quality of [0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46, 0.40]) {
        optimized = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (optimized && optimized.size <= 1024 * 1024) break;
      }
      if (!optimized) throw new Error('Your browser could not encode this image as WebP.');
      if (optimized.size > 1024 * 1024) {
        const scaledCanvas = document.createElement('canvas');
        let scaleDown = 0.85;
        while ((optimized?.size ?? Infinity) > 1024 * 1024 && scaleDown >= 0.35) {
          scaledCanvas.width = Math.max(1, Math.floor(canvas.width * scaleDown));
          scaledCanvas.height = Math.max(1, Math.floor(canvas.height * scaleDown));
          const scaledContext = scaledCanvas.getContext('2d', { alpha: false });
          if (!scaledContext) break;
          scaledContext.fillStyle = '#ffffff'; scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
          scaledContext.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
          for (const quality of [0.72, 0.62, 0.52, 0.42]) {
            optimized = await new Promise<Blob | null>(resolve => scaledCanvas.toBlob(resolve, 'image/webp', quality));
            if (optimized && optimized.size <= 1024 * 1024) break;
          }
          if (optimized && optimized.size <= 1024 * 1024) break;
          scaleDown *= 0.85;
        }
        if (optimized && optimized.size <= 1024 * 1024) { canvas.width = scaledCanvas.width; canvas.height = scaledCanvas.height; }
      }
      if (!optimized || optimized.size > 4096 * 1024) throw new Error('This image is still larger than 4096 KB after compression. Reduce its dimensions and try again.');
      const response = await fetch(this.apiClient.url('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/products/' + encodeURIComponent(product.id) + '/media'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'image/webp', 'X-Image-Alt': this.imageAltText().trim(), 'X-Image-Position': '0' },
        body: optimized
      });
      const payload = await response.json().catch(() => ({})) as { data?: { contentUrl?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'The image could not be uploaded.');
      this.imageUploadNote.set('Uploaded ' + canvas.width + ' × ' + canvas.height + ' WebP · ' + (optimized.size / 1024).toFixed(0) + ' KB. Original: ' + (file.size / 1024).toFixed(0) + ' KB.');
      this.dataChanged.emit();
    } catch (error) {
      this.imageUploadError.set(error instanceof Error ? error.message : 'Could not prepare or upload the image.');
    } finally {
      this.imageUploadBusy.set(false); inputElement.value = '';
    }
  }

  private uniqueSlug(name: string, existingSlugs: string[]): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150) || 'product-' + crypto.randomUUID().slice(0, 8);
    const used = new Set(existingSlugs);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = base + '-' + suffix++;
    return slug;
  }

  protected async createCategoryInline(): Promise<void> {
    const name = this.categoryNameDraft().trim();
    if (!name) {
      this.categoryCreateError.set('Enter a category name.');
      return;
    }
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150) || 'category';
    const existing = new Set(this.categories().map(category => category.slug));
    let slug = slugBase;
    let suffix = 2;
    while (existing.has(slug)) slug = slugBase + '-' + suffix++;
    this.categoryCreateBusy.set(true);
    this.categoryCreateError.set('');
    try {
      const created = await this.apiClient.request<{ id: string }>('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/categories', {
        method: 'POST',
        body: JSON.stringify({ storeId: this.storeId(), name, slug, description: null, position: this.categories().length, status: 'active' })
      });
      if (!created?.id) throw new Error('Category was saved, but its details could not be loaded. Refresh categories and try again.');
      this.newlySelectedCategoryIds.set([...new Set([...this.newlySelectedCategoryIds(), created.id])]);
      this.categoryNameDraft.set('');
      this.categoryCreatorOpen.set(false);
      this.dataChanged.emit();
      this.notifyRequested.emit('Category created and selected for this product.');
    } catch (error) {
      this.categoryCreateError.set(error instanceof Error ? error.message : 'Could not create category.');
    } finally {
      this.categoryCreateBusy.set(false);
    }
  }

  protected async saveProduct(event: Event): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(values.get('name') ?? '').trim();
    const editing = this.editingProduct();
    let imageUploadTriggeredRefresh = false;
    const slug = String(values.get('slug') ?? '').trim() || this.uniqueSlug(name, this.products().map(product => product.slug));
    const description = String(values.get('description') ?? '').trim() || null;
    const price = Number(values.get('price'));
    if (!Number.isFinite(price) || price < 0) { this.productSaveError.set('Enter a valid non-negative price.'); return; }
    const sku = String(values.get('sku') ?? '').trim() || null;
    this.productSaveBusy.set(true); this.productSaveError.set('');
    try {
      if (editing) {
        await this.apiClient.request('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/products/' + encodeURIComponent(editing.id), {
          method: 'PATCH',
          body: JSON.stringify({
            name, slug, description, status: String(values.get('status') ?? 'draft'),
            categoryIds: values.getAll('categoryIds').map(String),
            variant: { id: editing.variantId, sku, title: name, amountMinor: Math.round(price * 100), currency: editing.currency }
          })
        });
      } else {
        const variantId = crypto.randomUUID();
        const created = await this.apiClient.request<{ id: string }>('/api/v1/organizations/' + encodeURIComponent(this.organizationId()) + '/products', {
          method: 'POST',
          body: JSON.stringify({
            storeId: this.storeId(), slug, name, description, status: 'draft', kind: 'physical',
            availabilityStatus: 'available', availabilityNote: null, attributes: {}, categoryIds: values.getAll('categoryIds').map(String),
            variants: [{ id: variantId, sku, title: name, options: {}, amountMinor: Math.round(price * 100), currency: this.storeCurrency(), status: 'active', barcode: null, weightGrams: null, metadata: {} }]
          })
        });
        const image = this.pendingProductImage();
        if (image) {
          const createdProduct: ProductRow = {
            id: created.id, name, slug, description, category: '', categoryIds: values.getAll('categoryIds').map(String),
            sku: sku || '—', variantId, priceMinor: Math.round(price * 100), currency: this.storeCurrency(),
            stock: null, status: 'Draft', initials: name.slice(0, 2).toUpperCase(), tone: 'tone-1', imageUrl: null
          };
          this.editingProduct.set(createdProduct);
          await this.uploadProductImage({ currentTarget: { files: [image], value: '' } } as unknown as Event);
          imageUploadTriggeredRefresh = true;
          if (this.imageUploadError()) {
            this.productSaveError.set('Product saved, but its image could not be uploaded: ' + this.imageUploadError());
            this.dataChanged.emit();
            this.notifyRequested.emit('Draft product saved. Image upload needs attention.');
            return;
          }
          this.pendingProductImage.set(null);
        }
      }
      this.productEditorOpen.set(false); this.editingProduct.set(null);
      this.pendingProductImage.set(null);
      if (!imageUploadTriggeredRefresh) this.dataChanged.emit();
      this.notifyRequested.emit(editing ? 'Product changes saved.' : 'Draft product saved to your catalog.');
    } catch (error) {
      this.productSaveError.set(error instanceof Error ? error.message : 'Could not save this product.');
    } finally {
      this.productSaveBusy.set(false);
    }
  }
}
