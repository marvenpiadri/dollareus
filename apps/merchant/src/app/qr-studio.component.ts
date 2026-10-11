import { Component, OnDestroy, signal } from '@angular/core';

type QrEncoder = { toDataURL(text: string, options?: Record<string, unknown>): Promise<string>; toString(text: string, options?: Record<string, unknown>): Promise<string> };
type QrFrame = 'none' | 'bottom-label' | 'top-label';
function qrParam(name: string, fallback: string): string { return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) ?? fallback : fallback; }
function xmlText(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;'); }
declare global { var QRCode: QrEncoder | undefined; }

@Component({
  selector: 'dlr-qr-studio',
  standalone: true,
  template: `
    <main class="page"><header><a class="brand" href="/"><span class="mark">d.</span><span>dollareus<small>COMMERCE WORKSPACE</small></span></a><nav><a href="/">Home</a><a href="/login">Merchant sign in</a></nav></header>
      <section class="intro"><a class="back" href="/">← Back to home</a><p class="eyebrow">FREE TOOL · NO ACCOUNT REQUIRED</p><h1>QR Studio<span>.</span></h1><p>Create a QR code for a website, message, contact details or any text. Generate it in your browser and download it when you're ready.</p></section>
      <section class="workspace"><div class="editor"><div class="step">01 <span>CONTENT</span></div><h2>What should your QR code open?</h2><label for="content">Link or text</label><textarea id="content" rows="5" maxlength="2500" [value]="content()" (input)="content.set($any($event.target).value)" placeholder="https://yourwebsite.com"></textarea><div class="presets"><button type="button" (click)="setExample('https://example.com')">Website</button><button type="button" (click)="setExample('WIFI:T:WPA;S:Your Wi-Fi;P:password;;')">Wi-Fi</button><button type="button" (click)="setExample('mailto:hello@example.com')">Email</button><button type="button" (click)="setExample('BEGIN:VCARD\nVERSION:3.0\nFN:Your Name\nTEL:+123456789\nEND:VCARD')">Contact</button></div><div class="step second">02 <span>BRANDING &amp; STYLE</span></div><div class="colors"><label>QR color<input type="color" [value]="dark()" (input)="dark.set($any($event.target).value)"></label><label>Background<input type="color" [value]="light()" (input)="light.set($any($event.target).value)"></label><label>Brand accent<input type="color" [value]="accent()" (input)="accent.set($any($event.target).value)"></label><label>Error correction<select [value]="level()" (change)="level.set($any($event.target).value)"><option value="M">Balanced</option><option value="Q">High</option><option value="H">Maximum</option><option value="L">Compact</option></select></label><label>Export size<select [value]="size()" (change)="size.set($any($event.target).value)"><option value="256">256 px</option><option value="512">512 px</option><option value="640">640 px</option><option value="1024">1024 px</option></select></label><label>Brand name<input maxlength="120" [value]="brandName()" (input)="brandName.set($any($event.target).value)" placeholder="Your business"></label><label>Frame<select [value]="frame()" (change)="frame.set($any($event.target).value)"><option value="none">No frame</option><option value="bottom-label">Label below</option><option value="top-label">Label above</option></select></label><label>Printed label<input maxlength="80" [value]="label()" (input)="label.set($any($event.target).value)" placeholder="Scan to view menu"></label></div><button class="generate" type="button" [disabled]="busy() || !content().trim()" (click)="generate()">{{ busy() ? 'Generating…' : 'Generate QR code ↗' }}</button>@if(error()){<p class="error" role="alert">{{error()}}</p>}<p class="privacy">Your QR content stays in this browser. It isn't uploaded to Dollareus.</p></div>
      <aside class="preview"><div class="preview-head"><span>LIVE PREVIEW</span><span class="ready">● {{ qrDataUrl() ? 'READY' : 'WAITING FOR CONTENT' }}</span></div><div class="canvas">@if(qrDataUrl()){<img [src]="qrDataUrl()" alt="Generated QR code preview">} @else {<div class="placeholder"><span>▦</span><b>Your QR code appears here</b><small>Enter a link or text, then generate.</small></div>}</div><h3>{{ qrDataUrl() ? 'Your QR code is ready' : 'Ready when you are' }}</h3><p>{{ qrDataUrl() ? 'Scan it with a phone to test before sharing or printing.' : 'Choose your content and customize the colors.' }}</p><div class="downloads"><a class="download" [class.disabled]="!qrDataUrl()" [attr.href]="qrDataUrl() || null" [attr.download]="qrDataUrl() ? 'dollareus-qr.png' : null" (click)="!qrDataUrl() && $event.preventDefault()">↓ &nbsp; PNG</a><a class="download secondary-download" [class.disabled]="!svgDataUrl()" [attr.href]="svgDataUrl() || null" [attr.download]="svgDataUrl() ? 'dollareus-qr.svg' : null" (click)="!svgDataUrl() && $event.preventDefault()">↓ &nbsp; SVG</a></div><a class="text-link" href="/signup">Need store, product and sales tools? Create an account →</a></aside></section><footer><span>© 2026 Dollareus</span><span>QR Studio is free and doesn't require an account.</span><a href="/">Back to Dollareus</a></footer></main>`,
  styles: [`
    :host{display:block;min-height:100vh;background:#f8fafc;color:#0f172a;font-family:'DM Sans',sans-serif}*{box-sizing:border-box}.page{min-height:100vh;font-size:16px}header{height:82px;padding:0 max(24px,calc((100vw - 1120px)/2));display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e2e8f0}.brand{display:flex;align-items:center;gap:10px;color:#0f172a;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.7px}.mark{display:grid;place-items:center;width:37px;height:37px;border-radius:11px;background:#f0fdf4;color:#238636;font-size:23px}.brand small{display:block;margin-top:4px;font-size:10px;letter-spacing:1.3px;color:#64748b}nav{display:flex;gap:24px}nav a{color:#475569;text-decoration:none;font-size:13px;font-weight:650}.intro{max-width:1020px;margin:auto;padding:49px 24px 28px}.back{display:inline-block;margin-bottom:25px;color:#64748b;text-decoration:none;font-size:12px}.eyebrow{margin:0 0 12px;color:#238636;font-size:11px;font-weight:800;letter-spacing:1.4px}.intro h1{margin:0;font-family:Manrope,sans-serif;font-size:clamp(36px,5vw,52px);letter-spacing:-2px}.intro h1 span{color:#238636}.intro>p:last-child{max-width:590px;margin:14px 0 0;color:#64748b;font-size:15px;line-height:1.8}.workspace{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:20px;max-width:1020px;margin:0 auto;padding:0 24px 60px}.editor,.preview{padding:26px;border:1px solid #e2e8f0;border-radius:13px;background:#fff;box-shadow:0 5px 20px #253b1b05}.step{display:flex;align-items:center;gap:10px;color:#238636;font-size:12px;font-weight:800;letter-spacing:1px}.step span{color:#64748b}.editor h2{margin:13px 0 21px;font-size:19px;letter-spacing:-.5px}.editor>label{display:block;margin-bottom:8px;font-size:12px;font-weight:750;color:#475569}textarea{display:block;width:100%;min-height:120px;padding:13px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical;color:#0f172a;font:12px/1.7 'DM Sans',sans-serif;outline:none}textarea:focus{border-color:#238636;box-shadow:0 0 0 3px #dcfce7}.presets{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 24px}.presets button{padding:7px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#64748b;font-size:11px}.second{padding-top:19px;border-top:1px solid #eef0eb}.colors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 22px}.colors label{display:grid;gap:8px;color:#64748b;font-size:11px;font-weight:700}.colors input,.colors select{width:100%;height:35px;padding:3px 5px;border:1px solid #e2e7de;border-radius:6px;background:#fff;color:#4d5749}.colors input{cursor:pointer}.generate{width:100%;height:43px;border:1px solid #238636;border-radius:8px;background:#238636;color:#fff;font-size:13px;font-weight:750}.generate:disabled{opacity:.55;cursor:not-allowed}.privacy{margin:12px 0 0;color:#9ba397;font-size:11px;line-height:1.6}.error{color:#a44737;font-size:12px;line-height:1.5}.preview{display:flex;flex-direction:column;align-items:center;min-height:510px;padding:22px}.preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;font-size:10px;font-weight:800;letter-spacing:.8px;color:#8f978a}.ready{color:#6f9166}.canvas{display:grid;place-items:center;width:min(100%,300px);aspect-ratio:1;margin:34px 0 20px;padding:18px;border:1px solid #eef0eb;border-radius:12px;background:#f8fafc}.canvas img{display:block;width:100%;height:100%;object-fit:contain}.placeholder{display:grid;justify-items:center;gap:11px;text-align:center;color:#9ba397}.placeholder>span{display:grid;place-items:center;width:54px;height:54px;border-radius:12px;background:#f0fdf4;color:#238636;font-size:26px}.placeholder b{font-size:13px;color:#64748b}.placeholder small{font-size:11px}.preview h3{margin:0;font-size:16px}.preview>p{margin:8px 0 18px;text-align:center;color:#64748b;font-size:12px;line-height:1.6}.downloads{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:300px}.download{display:flex;align-items:center;justify-content:center;width:100%;height:41px;border:1px solid #238636;border-radius:7px;background:#238636;color:white;text-decoration:none;font-size:12px;font-weight:750}.secondary-download{background:#fff;color:#238636}.download.disabled{opacity:.4;pointer-events:none}.text-link{margin-top:17px;color:#238636;text-decoration:none;font-size:11px;text-align:center}footer{display:flex;justify-content:space-between;gap:14px;padding:22px max(24px,calc((100vw - 1120px)/2));border-top:1px solid #e2e8f0;color:#64748b;font-size:11px}footer a{color:#64748b;text-decoration:none}@media(max-width:760px){header{height:65px;padding:0 16px}.brand{font-size:18px}nav{gap:13px}nav a{font-size:11px}.workspace{grid-template-columns:1fr;padding:0 14px 40px;gap:13px}.intro{padding:36px 17px 24px}.editor,.preview{padding:20px}.preview{min-height:0}.canvas{width:min(100%,280px);margin:25px 0 17px}.colors{grid-template-columns:1fr 1fr}footer{padding:20px 15px;flex-wrap:wrap}footer span:nth-child(2){width:100%;order:3}}@media(max-width:390px){nav{gap:8px}nav a{font-size:10px}.brand small{font-size:10px}.colors{grid-template-columns:1fr 1fr}.colors label:last-child{grid-column:1/-1}}
  `]
})
export class QrStudioComponent implements OnDestroy {
  protected readonly content = signal(qrParam('content', 'https://example.com'));
  protected readonly dark = signal(qrParam('dark', '#0f172a'));
  protected readonly light = signal(qrParam('light', '#ffffff'));
  protected readonly accent = signal(qrParam('accent', '#238636'));
  protected readonly brandName = signal(qrParam('brand', ''));
  protected readonly frame = signal<QrFrame>(qrParam('frame', 'none') as QrFrame);
  protected readonly label = signal(qrParam('label', 'Scan to view menu'));
  protected readonly level = signal('H');
  protected readonly size = signal('640');
  protected readonly qrDataUrl = signal('');
  protected readonly svgDataUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  ngOnDestroy(): void { if (this.svgDataUrl().startsWith('blob:')) URL.revokeObjectURL(this.svgDataUrl()); }
  protected setExample(value: string): void { this.content.set(value); this.error.set(''); }
  private composeSvg(qrSvg: string, size: number, frame: QrFrame, brand: string, label: string): string {
    const extra = frame === 'none' ? 0 : 88;
    const totalHeight = size + extra;
    const qrY = frame === 'top-label' ? extra : 0;
    const inner = qrSvg.match(/<svg\\b[^>]*>([\\s\\S]*?)<\\/svg>/i)?.[1] ?? '';
    const text = (value: string, y: number, fontSize: number, weight: number) => value ? `<text x="${size / 2}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${this.accent()}">${xmlText(value)}</text>` : '';
    let heading = '';
    if (frame !== 'none') {
      if (frame === 'top-label') heading = text(brand, 31, 17, 700) + text(label, 59, 12, 500);
      else heading = text(brand, size + 29, 17, 700) + text(label, size + 56, 12, 500);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}"><rect width="100%" height="100%" fill="${this.light()}"/><svg x="0" y="${qrY}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">${inner}</svg>${heading}</svg>`;
  }
  private async composePng(qrPng: string, size: number, frame: QrFrame, brand: string, label: string): Promise<string> {
    if (frame === 'none' || (!brand.trim() && !label.trim())) return qrPng;
    const extra = 88;
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
    context.fillStyle = this.accent(); context.textAlign = 'center';
    if (frame === 'top-label') {
      if (brand.trim()) { context.font = '700 17px Arial, sans-serif'; context.fillText(brand.trim(), size / 2, 31, size - 24); }
      if (label.trim()) { context.font = '500 12px Arial, sans-serif'; context.fillText(label.trim(), size / 2, 59, size - 24); }
    } else {
      if (brand.trim()) { context.font = '700 17px Arial, sans-serif'; context.fillText(brand.trim(), size / 2, size + 29, size - 24); }
      if (label.trim()) { context.font = '500 12px Arial, sans-serif'; context.fillText(label.trim(), size / 2, size + 56, size - 24); }
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
      const png = await this.composePng(qrPng, width, frame, brandName, label);
      const svg = this.composeSvg(qrSvg, width, frame, brandName, label);
      this.qrDataUrl.set(png);
      if (this.svgDataUrl().startsWith('blob:')) URL.revokeObjectURL(this.svgDataUrl());
      this.svgDataUrl.set(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })));
    } catch { this.error.set('Could not generate this QR code. Try shorter content or darker colors.'); }
    finally { this.busy.set(false); }
  }
}
