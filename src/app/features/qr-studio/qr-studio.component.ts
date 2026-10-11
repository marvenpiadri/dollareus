import { Component, OnDestroy, signal } from '@angular/core';

type QrEncoder = { toDataURL(text: string, options?: Record<string, unknown>): Promise<string>; toString(text: string, options?: Record<string, unknown>): Promise<string> };
type QrFrame = 'none' | 'bottom-label' | 'top-label';
function qrParam(name: string, fallback: string): string { return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) ?? fallback : fallback; }
function xmlText(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;'); }
declare global { var QRCode: QrEncoder | undefined; }

@Component({
  selector: 'dlr-qr-studio',
  standalone: true,
  templateUrl: './qr-studio.component.html',
  styleUrl: './qr-studio.component.css'
})
export class QrStudioComponent implements OnDestroy {
  protected readonly content = signal(qrParam('content', 'https://example.com'));
  protected readonly dark = signal(qrParam('dark', '#0f172a'));
  protected readonly light = signal(qrParam('light', '#ffffff'));
  protected readonly accent = signal(qrParam('accent', '#238636'));
  protected readonly brandName = signal(qrParam('brand', ''));
  protected readonly frame = signal<QrFrame>(qrParam('frame', 'none') as QrFrame);
  protected readonly label = signal(qrParam('label', 'Scan to view menu'));
  protected readonly logoUrl = signal(qrParam('logo', ''));
  protected readonly level = signal('H');
  protected readonly size = signal('640');
  protected readonly qrDataUrl = signal('');
  protected readonly svgDataUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  ngOnDestroy(): void { if (this.svgDataUrl().startsWith('blob:')) URL.revokeObjectURL(this.svgDataUrl()); }
  protected setExample(value: string): void { this.content.set(value); this.error.set(''); }
  private composeSvg(qrSvg: string, size: number, frame: QrFrame, brand: string, label: string, logoUrl: string): string {
    const extra = frame === 'none' ? 0 : 88;
    const totalHeight = size + extra;
    const qrY = frame === 'top-label' ? extra : 0;
    const inner = qrSvg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1] ?? '';
    const text = (value: string, y: number, fontSize: number, weight: number) => value ? `<text x="${size / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${this.accent()}">${xmlText(value)}</text>` : '';
    let heading = '';
    if (frame !== 'none') {
      if (frame === 'top-label') heading = text(brand, 31, 17, 700) + text(label, 59, 12, 500);
      else heading = text(brand, size + 29, 17, 700) + text(label, size + 56, 12, 500);
    }
    const logo = logoUrl ? `<rect x="${size / 2 - 34}" y="${qrY + size / 2 - 34}" width="68" height="68" rx="12" fill="${this.light()}"/><image href="${xmlText(logoUrl)}" x="${size / 2 - 28}" y="${qrY + size / 2 - 28}" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}"><rect width="100%" height="100%" fill="${this.light()}"/><svg x="0" y="${qrY}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">${inner}</svg>${logo}${heading}</svg>`;
  }
  private async composePng(qrPng: string, size: number, frame: QrFrame, brand: string, label: string, logoUrl: string): Promise<string> {
    if ((frame === 'none' && !logoUrl) || (!brand.trim() && !label.trim() && !logoUrl)) return qrPng;
    const extra = frame === 'none' ? 0 : 88;
    const totalHeight = size + extra;
    const qrY = frame === 'top-label' ? extra : 0;
    const image = new Image();
    image.src = qrPng;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not compose QR image.')); });
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = totalHeight;
    const context = canvas.getContext('2d');
    if (!context) return qrPng;
    context.fillStyle = this.light(); context.fillRect(0, 0, size, totalHeight);
    context.drawImage(image, 0, qrY, size, size);
    if (logoUrl) {
      try {
        const logoImage = new Image(); logoImage.crossOrigin = 'anonymous'; logoImage.src = logoUrl;
        await new Promise<void>((resolve, reject) => { logoImage.onload = () => resolve(); logoImage.onerror = () => reject(new Error('Logo could not be loaded.')); });
        context.fillStyle = this.light(); context.beginPath(); context.roundRect(size / 2 - 34, qrY + size / 2 - 34, 68, 68, 12); context.fill();
        context.drawImage(logoImage, size / 2 - 28, qrY + size / 2 - 28, 56, 56);
      } catch { /* The SVG retains the logo URL; keep PNG export usable when its host disallows cross-origin image access. */ }
    }
    if (frame !== 'none') {
      context.fillStyle = this.accent(); context.textAlign = 'center';
      if (frame === 'top-label') {
        if (brand.trim()) { context.font = '700 17px Arial, sans-serif'; context.fillText(brand.trim(), size / 2, 31, size - 24); }
        if (label.trim()) { context.font = '500 12px Arial, sans-serif'; context.fillText(label.trim(), size / 2, 59, size - 24); }
      } else {
        if (brand.trim()) { context.font = '700 17px Arial, sans-serif'; context.fillText(brand.trim(), size / 2, size + 29, size - 24); }
        if (label.trim()) { context.font = '500 12px Arial, sans-serif'; context.fillText(label.trim(), size / 2, size + 56, size - 24); }
      }
    }
    return canvas.toDataURL('image/png');
  }
  protected async generate(): Promise<void> {
    const value = this.content().trim();
    if (!value) { this.error.set('Enter a link or text first.'); return; }
    if (value.length > 2500) { this.error.set('Keep QR content under 2,500 characters.'); return; }
    const encoder = globalThis.QRCode;
    if (!encoder) { this.error.set('The QR encoder could not load. Check your connection and refresh this page.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      const width = Number(this.size());
      const frame = this.frame();
      const brandName = this.brandName().trim();
      const label = this.label().trim();
      const options = { width, margin: 3, errorCorrectionLevel: this.level(), color: { dark: this.dark(), light: this.light() } };
      const [qrPng, qrSvg] = await Promise.all([
        encoder.toDataURL(value, options),
        encoder.toString(value, { ...options, type: 'svg' })
      ]);
      const logoUrl = this.logoUrl().trim();
      const safeLogoUrl = logoUrl.startsWith('https://') ? logoUrl : '';
      const png = await this.composePng(qrPng, width, frame, brandName, label, safeLogoUrl);
      const svg = this.composeSvg(qrSvg, width, frame, brandName, label, safeLogoUrl);
      this.qrDataUrl.set(png);
      if (this.svgDataUrl().startsWith('blob:')) URL.revokeObjectURL(this.svgDataUrl());
      this.svgDataUrl.set(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })));
    } catch { this.error.set('Could not generate this QR code. Try shorter content or darker colors.'); }
    finally { this.busy.set(false); }
  }
}
