import { Component, signal } from '@angular/core';
import { DEFAULT_QR_DESIGN, QrDesign, ModuleStyle, EyeFrameStyle, EyePupilStyle } from '../../core/qr/qr-design.model';
import { QrCanvasRenderer } from '../../core/qr/qr-canvas-renderer';
import { QrMatrixGenerator, QrEccLevel } from '../../core/qr/qr-matrix';
import { QrSvgRenderer } from '../../core/qr/qr-svg-renderer';
import { QrValidator, ScanabilityReport } from '../../core/qr/qr-validator';
type QrFrame = 'none' | 'bottom-label' | 'top-label';
function qrParam(name: string, fallback: string): string { return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) ?? fallback : fallback; }
@Component({ selector: 'dlr-qr-studio', standalone: true, templateUrl: './qr-studio.component.html', styleUrl: './qr-studio.component.css' })
export class QrStudioComponent {
  protected readonly content = signal(qrParam('content', 'https://example.com'));
  protected readonly dark = signal(qrParam('dark', '#0f172a'));
  protected readonly light = signal(qrParam('light', '#ffffff'));
  protected readonly accent = signal(qrParam('accent', '#238636'));
  protected readonly brandName = signal(qrParam('brand', ''));
  protected readonly frame = signal<QrFrame>(qrParam('frame', 'none') as QrFrame);
  protected readonly label = signal(qrParam('label', 'Scan to view menu'));
  protected readonly logoUrl = signal(qrParam('logo', ''));
  protected readonly level = signal<QrEccLevel>('H');
  protected readonly moduleStyle = signal<ModuleStyle>('rounded');
  protected readonly eyeFrameStyle = signal<EyeFrameStyle>('rounded');
  protected readonly eyePupilStyle = signal<EyePupilStyle>('rounded');
  protected readonly useGradient = signal(false);
  protected readonly gradientAngle = signal(45);
  protected readonly quietZone = signal(4);
  protected readonly size = signal('640');
  protected readonly qrDataUrl = signal('');
  protected readonly svgDataUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly scanability = signal<ScanabilityReport | null>(null);
  protected setExample(value: string): void { this.content.set(value); this.error.set(''); }
  private makeDesign(): QrDesign {
    const logo = this.logoUrl().trim();
    return { ...DEFAULT_QR_DESIGN, foreground: this.dark(), background: this.light(), useGradient: this.useGradient(), gradientAngle: this.gradientAngle(), gradientColor2: this.accent(), moduleStyle: this.moduleStyle(), eyeFrameStyle: this.eyeFrameStyle(), eyePupilStyle: this.eyePupilStyle(), quietZone: this.quietZone(), eccLevel: logo ? 'H' : this.level(),
      logo: { ...DEFAULT_QR_DESIGN.logo, enabled: Boolean(logo), dataUrl: logo, name: logo ? 'Business logo' : '', sizeRatio: 0.18, padding: 1, bgColor: this.light(), shape: 'rounded' },
      frame: { ...DEFAULT_QR_DESIGN.frame, type: this.frame() === 'top-label' ? 'badge-top' : this.frame() === 'bottom-label' ? 'badge-bottom' : 'none', text: this.label().trim() || this.brandName().trim() || 'SCAN ME', color: this.accent(), textColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
    };
  }
  protected async generate(): Promise<void> {
    const value = this.content().trim();
    if (!value) { this.error.set('Enter a link or text first.'); return; }
    if (value.length > 2500) { this.error.set('Keep QR content under 2,500 characters.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      const design = this.makeDesign(); const matrix = QrMatrixGenerator.generate(value, design.eccLevel);
      const svg = QrSvgRenderer.render(matrix, design, { cellSize: 10 }); const report = QrValidator.evaluate(matrix, design, value.length);
      const pngBlob = await QrCanvasRenderer.renderSvgToPngBlob(svg, Number(this.size()));
      const pngDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not prepare PNG download.')); reader.onerror = () => reject(new Error('Could not prepare PNG download.')); reader.readAsDataURL(pngBlob); });
      this.svgDataUrl.set('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)); this.qrDataUrl.set(pngDataUrl); this.scanability.set(report);
      if (report.status === 'critical') this.error.set('This design may not scan reliably. Increase contrast or remove the logo before printing.');
    } catch (error) { this.qrDataUrl.set(''); this.svgDataUrl.set(''); this.error.set(error instanceof Error ? error.message : 'QR generation failed. Please try a shorter value or simpler design.'); }
    finally { this.busy.set(false); }
  }
}