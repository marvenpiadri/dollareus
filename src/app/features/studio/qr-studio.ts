import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

import {
  DEFAULT_QR_DESIGN,
  EyeFrameStyle,
  EyePupilStyle,
  FrameType,
  LogoShape,
  ModuleStyle,
  QrDesign,
} from '../../core/qr/qr-design.model';
import { QrEccLevel, QrMatrixGenerator, QrMatrixResult } from '../../core/qr/qr-matrix';
import {
  getContentTypeDefinition,
  QR_CONTENT_TYPES,
  QrContentType,
  QrContentTypeDefinition,
  QrPayloadData,
} from '../../core/qr/qr-payloads';
import { QrSvgRenderer } from '../../core/qr/qr-svg-renderer';
import { QrCanvasRenderer } from '../../core/qr/qr-canvas-renderer';
import { QrValidator, ScanabilityReport } from '../../core/qr/qr-validator';
import { ProjectRepository } from '../../core/storage/project-repository';
import { QrProject } from '../../core/models/project.model';
import { QrScannerService } from '../../core/scanner/qr-scanner.service';
import { QrDraftStore } from '../../core/qr/qr-draft.store';
import { QrMode } from '../../core/qr/qr-payloads';

@Component({
  selector: 'app-qr-studio',
  imports: [CommonModule, FormsModule],
  templateUrl: './qr-studio.html',
  styleUrl: './qr-studio.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrStudio {
  private sanitizer = inject(DomSanitizer);
  private projectRepo = inject(ProjectRepository);
  private scannerService = inject(QrScannerService);
  private route = inject(ActivatedRoute);
  private draftStore = inject(QrDraftStore);
  readonly mode = signal<QrMode>('static');

  // Content Types definitions
  readonly contentTypes = QR_CONTENT_TYPES;

  // Active Project & Content State
  readonly projectId = signal<string | null>(null);
  readonly projectName = signal<string>('My QR Code');
  readonly selectedType = signal<QrContentType>('website');
  readonly contentData = signal<QrPayloadData>({
    url: 'https://qr.x-facture.com',
  });

  // Design State
  readonly design = signal<QrDesign>({ ...DEFAULT_QR_DESIGN });

  // UI Workspace State
  readonly activeTab = signal<'modules' | 'eyes' | 'colors' | 'logo' | 'frame' | 'reliability'>('modules');
  readonly previewBg = signal<'white' | 'dark' | 'checker' | 'mockup'>('white');
  readonly previewZoom = signal<number>(1.0);
  readonly pngResolution = signal<number>(2048);

  // Status & Feedback Signals
  readonly copyFeedback = signal<boolean>(false);
  readonly saveFeedback = signal<boolean>(false);
  readonly isTestingScan = signal<boolean>(false);
  readonly testScanMessage = signal<{ text: string; success: boolean } | null>(null);

  // Computed raw payload
  readonly currentDefinition = computed<QrContentTypeDefinition>(() =>
    getContentTypeDefinition(this.selectedType())
  );

  readonly rawPayload = computed<string>(() => {
    const def = this.currentDefinition();
    return def.serialize(this.contentData());
  });

  // Computed Matrix Generation
  readonly matrix = computed<QrMatrixResult>(() => {
    return QrMatrixGenerator.generate(this.rawPayload(), this.design().eccLevel);
  });

  // Computed Pure Vector SVG String
  readonly svgMarkup = computed<string>(() => {
    return QrSvgRenderer.render(this.matrix(), this.design(), { cellSize: 10 });
  });

  // Safe HTML for preview
  readonly safeSvg = computed<SafeHtml>(() => {
    return this.sanitizer.bypassSecurityTrustHtml(this.svgMarkup());
  });

  // Computed Scanability Protection Report
  readonly scanability = computed<ScanabilityReport>(() => {
    return QrValidator.evaluate(this.matrix(), this.design(), this.rawPayload().length);
  });

  // Color Swatches
  readonly colorPresets = [
    '#17151f',
    '#000000',
    '#7c5cfc',
    '#4f46e5',
    '#0f766e',
    '#b42318',
    '#b45309',
    '#0f4c81',
  ];

  constructor() {
    // Load saved projects first, then accept a one-time handoff from Dollareus QR management.
    this.route.queryParams.subscribe((params) => {
      const id = params['project'];
      if (id) {
        void this.loadProjectById(id);
        return;
      }

      const rawContent = typeof params['content'] === 'string' ? params['content'].trim() : '';
      if (rawContent) {
        const isUrl = /^https?:\/\//i.test(rawContent);
        this.selectedType.set(isUrl ? 'website' : 'text');
        this.contentData.set(isUrl ? { url: rawContent } : { text: rawContent });

        const foreground = this.normalizeHex(String(params['dark'] ?? ''));
        const background = this.normalizeHex(String(params['light'] ?? ''));
        const accent = this.normalizeHex(String(params['accent'] ?? ''));
        const requestedFrame = String(params['frame'] ?? 'none');
        const frameType: FrameType = requestedFrame === 'top-label' ? 'badge-top' : requestedFrame === 'bottom-label' ? 'badge-bottom' : 'none';
        const label = String(params['label'] ?? params['brand'] ?? 'SCAN ME').slice(0, 80);
        const rawLogo = String(params['logo'] ?? '');
        const logoUrl = /^https:\/\//i.test(rawLogo) ? rawLogo : '';

        this.design.update((design) => ({
          ...design,
          foreground: foreground ?? design.foreground,
          background: background ?? design.background,
          gradientColor2: accent ?? design.gradientColor2,
          frame: { ...design.frame, type: frameType, text: label, color: accent ?? design.frame.color },
          logo: { ...design.logo, enabled: Boolean(logoUrl), dataUrl: logoUrl, name: logoUrl ? 'Store logo' : '' }
        }));
        return;
      }

      const draft = this.draftStore.current();
      if (draft) {
        this.selectedType.set(draft.type);
        this.mode.set(draft.mode);
        this.contentData.set({ ...draft.data });
        this.draftStore.clear();
      }
    });
  }

  private async loadProjectById(id: string) {
    const p = await this.projectRepo.getProject(id);
    if (p) {
      this.projectId.set(p.id);
      this.projectName.set(p.name);
      this.selectedType.set(p.contentType);
      this.contentData.set({ ...p.contentData });
      this.design.set({ ...p.design });
    }
  }

  // Content type switches
  selectType(type: QrContentType): void {
    this.selectedType.set(type);
    const def = getContentTypeDefinition(type);
    this.contentData.set({ ...def.defaultData });
    this.testScanMessage.set(null);
  }

  updateField(key: string, value: string | number | boolean): void {
    this.contentData.update((prev) => ({
      ...prev,
      [key]: value,
    }));
    this.testScanMessage.set(null);
  }

  // Design Mutators
  setModuleStyle(style: ModuleStyle): void {
    this.design.update((d) => ({ ...d, moduleStyle: style }));
  }

  setEyeFrameStyle(style: EyeFrameStyle): void {
    this.design.update((d) => ({ ...d, eyeFrameStyle: style }));
  }

  setEyePupilStyle(style: EyePupilStyle): void {
    this.design.update((d) => ({ ...d, eyePupilStyle: style }));
  }

  setForegroundColor(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, foreground: normalized }));
  }

  setBackgroundColor(color: string): void {
    if (color === 'transparent') {
      this.design.update((d) => ({ ...d, background: 'transparent' }));
      return;
    }
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, background: normalized }));
  }

  setGradientColor2(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, gradientColor2: normalized }));
  }

  setEyeFrameColor(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, eyeFrameColor: normalized }));
  }

  setEyePupilColor(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, eyePupilColor: normalized }));
  }

  setFrameColor(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, frame: { ...d.frame, color: normalized } }));
  }

  setFrameTextColor(color: string): void {
    const normalized = this.normalizeHex(color);
    if (!normalized) return;
    this.design.update((d) => ({ ...d, frame: { ...d.frame, textColor: normalized } }));
  }

  isValidHex(color: string): boolean {
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
  }

  private normalizeHex(color: string): string | null {
    const value = color.trim();
    if (!this.isValidHex(value)) return null;
    if (value.length === 4) {
      return '#' + [...value.slice(1)].map((char) => char + char).join('').toLowerCase();
    }
    return value.toLowerCase();
  }

  toggleTransparentBg(): void {
    this.design.update((d) => ({
      ...d,
      background: d.background === 'transparent' ? '#ffffff' : 'transparent',
    }));
  }

  toggleGradient(use: boolean): void {
    this.design.update((d) => ({ ...d, useGradient: use }));
  }


  setGradientAngle(angle: number): void {
    this.design.update((d) => ({ ...d, gradientAngle: angle }));
  }

  toggleCustomEyeColors(use: boolean): void {
    this.design.update((d) => ({ ...d, customEyeColors: use }));
  }


  setFrameType(type: FrameType): void {
    this.design.update((d) => ({
      ...d,
      frame: { ...d.frame, type },
    }));
  }

  setFrameText(text: string): void {
    this.design.update((d) => ({
      ...d,
      frame: { ...d.frame, text },
    }));
  }


  setQuietZone(zone: number): void {
    this.design.update((d) => ({ ...d, quietZone: zone }));
  }

  setEccLevel(ecc: QrEccLevel): void {
    this.design.update((d) => ({ ...d, eccLevel: ecc }));
  }

  // Logo handlers
  onLogoUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        this.design.update((d) => ({
          ...d,
          // Auto-boost error correction to High (H: 30%) when logo is added for safe scanning
          eccLevel: 'H',
          logo: {
            ...d.logo,
            enabled: true,
            dataUrl,
            name: file.name,
          },
        }));
      };
      reader.readAsDataURL(file);
    }
  }

  removeLogo(): void {
    this.design.update((d) => ({
      ...d,
      logo: {
        ...d.logo,
        enabled: false,
        dataUrl: '',
        name: '',
      },
    }));
  }

  setLogoSize(sizeRatio: number): void {
    this.design.update((d) => ({
      ...d,
      logo: { ...d.logo, sizeRatio },
    }));
  }

  setLogoPadding(padding: number): void {
    this.design.update((d) => ({
      ...d,
      logo: { ...d.logo, padding },
    }));
  }

  setLogoShape(shape: LogoShape): void {
    this.design.update((d) => ({
      ...d,
      logo: { ...d.logo, shape },
    }));
  }

  // Scanability auto-fixes
  handleAutoFix(action: string): void {
    switch (action) {
      case 'reset-contrast':
        this.design.update((d) => ({
          ...d,
          foreground: '#17151f',
          background: '#ffffff',
        }));
        break;
      case 'boost-ecc':
        this.design.update((d) => ({ ...d, eccLevel: 'H' }));
        break;
      case 'fix-quiet-zone':
        this.design.update((d) => ({ ...d, quietZone: 4 }));
        break;
    }
  }

  // Export handlers
  downloadSvg(): void {
    const filename = `${this.sanitizeFilename(this.projectName())}.svg`;
    QrCanvasRenderer.downloadSvg(this.svgMarkup(), filename);
  }

  async copySvg(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(this.svgMarkup());
      this.copyFeedback.set(true);
      setTimeout(() => this.copyFeedback.set(false), 2200);
    }
  }

  async downloadPng(): Promise<void> {
    const filename = `${this.sanitizeFilename(this.projectName())}.png`;
    const res = this.pngResolution();
    const blob = await QrCanvasRenderer.renderSvgToPngBlob(this.svgMarkup(), res);
    QrCanvasRenderer.downloadBlob(blob, filename);
  }

  async saveProject(): Promise<void> {
    const existing = this.projectId() ? await this.projectRepo.getProject(this.projectId()!) : null;
    const now = Date.now();
    const project: QrProject = {
      id: this.projectId() || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'proj_' + Math.random().toString(36).slice(2, 10)),
      name: this.projectName().trim() || 'Untitled QR',
      contentType: this.selectedType(),
      contentData: { ...this.contentData() },
      rawPayload: this.rawPayload(),
      design: { ...this.design() },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.projectRepo.saveProject(project);
    this.projectId.set(project.id);
    this.saveFeedback.set(true);
    setTimeout(() => this.saveFeedback.set(false), 2200);
  }

  // Live in-app decoder validation
  async testScanGeneratedCode(): Promise<void> {
    this.isTestingScan.set(true);
    try {
      const blob = await QrCanvasRenderer.renderSvgToPngBlob(this.svgMarkup(), 800);
      const result = await this.scannerService.scanImageFile(blob);

      if (result && result.raw) {
        this.testScanMessage.set({
          text: `Scan Verified! Camera decoder detected payload: "${result.raw.slice(0, 48)}${result.raw.length > 48 ? '...' : ''}"`,
          success: true,
        });
      } else {
        this.testScanMessage.set({
          text: 'Warning: Simulated camera scan failed to decode. Check contrast or reduce logo size.',
          success: false,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.testScanMessage.set({
        text: `Validation error: ${msg}`,
        success: false,
      });
    } finally {
      this.isTestingScan.set(false);
    }
  }

  private sanitizeFilename(name: string): string {
    return (name || 'qr-code').trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
  }
}
