import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  getContentTypeDefinition,
  QrContentType,
  QrContentTypeDefinition,
  QrFieldDefinition,
  QrPayloadData,
} from '../../core/qr/qr-payloads';
import { QrDraftStore } from '../../core/qr/qr-draft.store';

@Component({
  selector: 'app-qr-content-page',
  templateUrl: './qr-content-page.html',
  styleUrl: './qr-content-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrContentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draftStore = inject(QrDraftStore);

  readonly definition = signal<QrContentTypeDefinition>(getContentTypeDefinition('website'));
  readonly data = signal<QrPayloadData>({});
  readonly submitted = signal(false);
  readonly mode = signal<'static' | 'dynamic'>('static');

  constructor() {
    const type = this.route.snapshot.paramMap.get('type') as QrContentType | null;
    const definition = type ? getContentTypeDefinition(type) : getContentTypeDefinition('website');
    this.definition.set(definition);
    this.data.set({ ...definition.defaultData });
    if (!definition.capabilities.static && definition.capabilities.dynamic) this.mode.set('dynamic');
  }

  update(key: string, value: string | number | boolean): void {
    this.data.update((current) => ({ ...current, [key]: value }));
    this.submitted.set(false);
  }

  fieldHasError(field: QrFieldDefinition): boolean {
    if (!this.submitted() || !field.required) return false;
    const value = this.data()[field.key];
    return value === undefined || value === null || String(value).trim() === '';
  }

  setMode(mode: 'static' | 'dynamic'): void {
    if (mode === 'static' && !this.definition().capabilities.static) return;
    if (mode === 'dynamic' && !this.definition().capabilities.dynamic) return;
    this.mode.set(mode);
  }

  continue(): void {
    this.submitted.set(true);
    const missing = this.definition().fields.some((field) => this.fieldHasError(field));
    if (missing) return;

    this.draftStore.set(this.definition().id, this.data(), this.mode());
    void this.router.navigate(['/qr']);
  }

  back(): void {
    void this.router.navigate(['/qr/create']);
  }
}
