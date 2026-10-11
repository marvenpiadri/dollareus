import { Component, input, output } from '@angular/core';
import { EntryPointRow } from '../../shared/models/commerce.models';

type StoreExperience = 'commerce' | 'menu' | 'catalog' | 'services';
type QrTargetPath = '/' | '/menu' | '/catalog' | '/services';
type QrFrame = 'none' | 'bottom-label' | 'top-label';

@Component({
  selector: 'dlr-qr-management',
  standalone: true,
  templateUrl: './qr-management.component.html',
  styleUrl: './qr-management.component.css'
})
export class QrManagementComponent {
  readonly storePublished = input(false);
  readonly storeExperience = input<StoreExperience>('commerce');
  readonly qrBusy = input(false);
  readonly qrError = input('');
  readonly qrBrandName = input('');
  readonly storeName = input('');
  readonly qrTargetPath = input<QrTargetPath>('/menu');
  readonly qrForeground = input('#123456');
  readonly qrBackground = input('#ffffff');
  readonly qrAccent = input('#238636');
  readonly qrFrame = input<QrFrame>('bottom-label');
  readonly qrLabel = input('');
  readonly qrLogoUrl = input('');
  readonly entryPoints = input<EntryPointRow[]>([]);
  readonly selectedQrId = input('');

  readonly storeExperienceChangeRequested = output<StoreExperience>();
  readonly toggleStorefrontPublishingRequested = output<void>();
  readonly createQrEntryPointRequested = output<Event>();
  readonly qrBrandNameChangeRequested = output<string>();
  readonly qrTargetPathChangeRequested = output<QrTargetPath>();
  readonly qrForegroundChangeRequested = output<string>();
  readonly qrBackgroundChangeRequested = output<string>();
  readonly qrAccentChangeRequested = output<string>();
  readonly qrFrameChangeRequested = output<QrFrame>();
  readonly qrLabelChangeRequested = output<string>();
  readonly qrLogoUrlChangeRequested = output<string>();
  readonly editQrEntryPointRequested = output<EntryPointRow>();
  readonly toggleQrEntryPointRequested = output<EntryPointRow>();
  readonly saveQrBrandingRequested = output<Event>();
  readonly cancelQrEditRequested = output<void>();

  protected qrGeneratorUrl(point: EntryPointRow): string {
    const params = new URLSearchParams({
      content: point.targetUrl ?? '',
      dark: point.branding?.foregroundColor ?? '#123456',
      light: point.branding?.backgroundColor ?? '#ffffff',
      accent: point.branding?.accentColor ?? '#238636',
      brand: point.branding?.brandName ?? this.storeName(),
      frame: point.branding?.frame ?? 'bottom-label',
      label: point.branding?.label ?? 'Scan to view menu',
      logo: point.branding?.logoUrl ?? ''
    });
    return '/qr?' + params.toString();
  }
}
