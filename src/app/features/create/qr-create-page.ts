import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { QR_CONTENT_TYPES, QrContentType, QrContentTypeDefinition } from '../../core/qr/qr-payloads';

@Component({
  selector: 'app-qr-create-page',
  templateUrl: './qr-create-page.html',
  styleUrl: './qr-create-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCreatePage {
  private readonly router = inject(Router);

  readonly contentTypes = QR_CONTENT_TYPES;
  readonly categories = ['web', 'contact', 'communication', 'business', 'files', 'social', 'payment', 'utility'] as const;

  choose(type: QrContentType): void {
    void this.router.navigate(['/create', type]);
  }

  categoryLabel(category: QrContentTypeDefinition['category'] | string): string {
    switch (category) {
      case 'web': return 'Web & Links';
      case 'contact': return 'Contact';
      case 'communication': return 'Communication';
      case 'business': return 'Business';
      case 'files': return 'Files & Media';
      case 'social': return 'Social';
      case 'payment': return 'Payments';
      default: return 'Utilities';
    }
  }
}
