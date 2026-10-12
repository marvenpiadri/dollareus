import { Injectable } from '@angular/core';
import jsQR from 'jsqr';

export interface DecodedPayloadInfo {
  type: 'url' | 'wifi' | 'vcard' | 'email' | 'phone' | 'sms' | 'event' | 'text';
  title: string;
  actionLabel: string;
  actionUrl?: string;
  parsedDetails?: Record<string, string>;
}

export interface ScanResult {
  raw: string;
  info: DecodedPayloadInfo;
  timestamp: number;
  corners?: { x: number; y: number }[];
}

@Injectable({
  providedIn: 'root',
})
export class QrScannerService {
  private hasNativeBarcodeDetector: boolean | null = null;
  private barcodeDetectorInstance: BarcodeDetector | null = null;

  constructor() {
    this.checkNativeSupport();
  }

  private async checkNativeSupport(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (this.hasNativeBarcodeDetector !== null) return this.hasNativeBarcodeDetector;

    try {
      if ('BarcodeDetector' in window) {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats && formats.includes('qr_code')) {
          this.barcodeDetectorInstance = new BarcodeDetector({ formats: ['qr_code'] });
          this.hasNativeBarcodeDetector = true;
          return true;
        }
      }
    } catch {
      // Fallback to jsQR
    }

    this.hasNativeBarcodeDetector = false;
    return false;
  }

  /**
   * Scans a single video frame from an HTMLVideoElement
   */
  async scanVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<ScanResult | null> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return null;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    // Try native BarcodeDetector if available
    if (this.barcodeDetectorInstance) {
      try {
        const barcodes = await this.barcodeDetectorInstance.detect(canvas);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = barcodes[0].rawValue;
          return {
            raw,
            info: this.analyzePayload(raw),
            timestamp: Date.now(),
            corners: barcodes[0].cornerPoints,
          };
        }
      } catch {
        // Fallback to jsQR below
      }
    }

    // High performance fallback using jsQR with attemptBoth for custom styled QR codes
    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data) {
      return {
        raw: code.data,
        info: this.analyzePayload(code.data),
        timestamp: Date.now(),
        corners: [
          code.location.topLeftCorner,
          code.location.topRightCorner,
          code.location.bottomRightCorner,
          code.location.bottomLeftCorner,
        ],
      };
    }

    return null;
  }

  /**
   * Decodes an uploaded image File or Blob (handles photos, screenshots, custom branded codes)
   */
  async scanImageFile(file: File | Blob): Promise<ScanResult | null> {
    if (typeof window === 'undefined') return null;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
              resolve(null);
              return;
            }

            ctx.drawImage(img, 0, 0);

            // 1. Try native BarcodeDetector first
            if (this.barcodeDetectorInstance) {
              try {
                const barcodes = await this.barcodeDetectorInstance.detect(canvas);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  const raw = barcodes[0].rawValue;
                  resolve({
                    raw,
                    info: this.analyzePayload(raw),
                    timestamp: Date.now(),
                    corners: barcodes[0].cornerPoints,
                  });
                  return;
                }
              } catch {
                // Continue to jsQR
              }
            }

            // 2. Try jsQR with normal + inverted attempts
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth',
            });

            // 3. For tough branded codes, try high-contrast boost
            if (!code && (canvas.width > 200 && canvas.height > 200)) {
              // Try scaled down or enhanced contrast
              code = this.attemptEnhancedScan(ctx, canvas.width, canvas.height);
            }

            if (code && code.data) {
              resolve({
                raw: code.data,
                info: this.analyzePayload(code.data),
                timestamp: Date.now(),
                corners: [
                  code.location.topLeftCorner,
                  code.location.topRightCorner,
                  code.location.bottomRightCorner,
                  code.location.bottomLeftCorner,
                ],
              });
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image file'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Preprocessing filter for stylized / branded QR codes with custom colors
   */
  private attemptEnhancedScan(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): ReturnType<typeof jsQR> {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // Convert to high-contrast grayscale
    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Threshold at 128
      const v = avg < 128 ? 0 : 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }

    return jsQR(d, width, height, { inversionAttempts: 'attemptBoth' });
  }

  /**
   * Analyzes raw decoded string and produces rich structured payload preview
   */
  analyzePayload(raw: string): DecodedPayloadInfo {
    const text = (raw || '').trim();

    // 1. Wi-Fi
    if (text.startsWith('WIFI:')) {
      const details: Record<string, string> = {};
      const ssidMatch = text.match(/S:([^;]+)/);
      const typeMatch = text.match(/T:([^;]+)/);
      const passMatch = text.match(/P:([^;]+)/);
      const hiddenMatch = text.match(/H:([^;]+)/);

      if (ssidMatch) details['Network (SSID)'] = ssidMatch[1];
      if (typeMatch) details['Security'] = typeMatch[1];
      if (passMatch) details['Password'] = passMatch[1];
      if (hiddenMatch) details['Hidden Network'] = hiddenMatch[1] === 'true' ? 'Yes' : 'No';

      return {
        type: 'wifi',
        title: `Wi-Fi: ${details['Network (SSID)'] || 'Protected Network'}`,
        actionLabel: 'Copy Password',
        actionUrl: details['Password'],
        parsedDetails: details,
      };
    }

    // 2. vCard Contact
    if (text.includes('BEGIN:VCARD')) {
      const details: Record<string, string> = {};
      const fnMatch = text.match(/FN:(.+)/i);
      const telMatch = text.match(/TEL.*:(.+)/i);
      const emailMatch = text.match(/EMAIL.*:(.+)/i);
      const orgMatch = text.match(/ORG:(.+)/i);
      const titleMatch = text.match(/TITLE:(.+)/i);
      const urlMatch = text.match(/URL:(.+)/i);

      if (fnMatch) details['Full Name'] = fnMatch[1].trim();
      if (orgMatch) details['Organization'] = orgMatch[1].trim();
      if (titleMatch) details['Title'] = titleMatch[1].trim();
      if (telMatch) details['Phone'] = telMatch[1].trim();
      if (emailMatch) details['Email'] = emailMatch[1].trim();
      if (urlMatch) details['Website'] = urlMatch[1].trim();

      const name = details['Full Name'] || 'Contact Card';
      return {
        type: 'vcard',
        title: `vCard: ${name}`,
        actionLabel: details['Phone'] ? 'Call Contact' : 'Copy Contact Details',
        actionUrl: details['Phone'] ? `tel:${details['Phone']}` : undefined,
        parsedDetails: details,
      };
    }

    // 3. URLs
    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
      const fullUrl = /^https?:\/\//i.test(text) ? text : 'https://' + text;
      return {
        type: 'url',
        title: fullUrl,
        actionLabel: 'Open Link',
        actionUrl: fullUrl,
      };
    }

    // 4. Email (mailto: or MATMSG:)
    if (text.toLowerCase().startsWith('mailto:')) {
      const email = text.replace(/^mailto:/i, '').split('?')[0];
      return {
        type: 'email',
        title: `Email: ${email}`,
        actionLabel: 'Draft Email',
        actionUrl: text,
      };
    }

    // 5. Phone (tel:)
    if (text.toLowerCase().startsWith('tel:')) {
      const num = text.replace(/^tel:/i, '');
      return {
        type: 'phone',
        title: `Phone: ${num}`,
        actionLabel: 'Dial Number',
        actionUrl: text,
      };
    }

    // 6. SMS
    if (text.toLowerCase().startsWith('sms:') || text.toLowerCase().startsWith('smsto:')) {
      const clean = text.replace(/^(sms|smsto):/i, '');
      const recipient = clean.split('?')[0];
      return {
        type: 'sms',
        title: `SMS to ${recipient || 'Message'}`,
        actionLabel: 'Open Messages',
        actionUrl: text,
      };
    }

    // 7. Plain text fallback
    return {
      type: 'text',
      title: 'Decoded Plain Text',
      actionLabel: 'Copy Text',
    };
  }
}
