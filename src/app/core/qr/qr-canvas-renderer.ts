/**
 * High-Resolution PNG exporter for QR codes
 * Converts pure vector SVG string to pixel-perfect raster PNG Blob or DataURL
 */
export class QrCanvasRenderer {
  /**
   * Renders SVG string to PNG Blob at desired pixel resolution (e.g. 1024, 2048, 4096)
   */
  static async renderSvgToPngBlob(svgString: string, targetSize = 2048): Promise<Blob> {
    if (typeof window === 'undefined') {
      throw new Error('Canvas rendering is only supported in browser environment');
    }

    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const aspect = img.height / (img.width || 1);
          canvas.width = targetSize;
          canvas.height = Math.round(targetSize * aspect);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to get 2D canvas context'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (pngBlob) => {
              URL.revokeObjectURL(url);
              if (pngBlob) {
                resolve(pngBlob);
              } else {
                reject(new Error('Failed to create PNG blob'));
              }
            },
            'image/png',
            1.0
          );
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG into image element'));
      };

      img.src = url;
    });
  }

  /**
   * Triggers browser download for a Blob
   */
  static downloadBlob(blob: Blob, filename: string): void {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Triggers browser download for an SVG text string
   */
  static downloadSvg(svgString: string, filename: string): void {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    this.downloadBlob(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`);
  }
}
