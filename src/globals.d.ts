declare module 'jsqr' {
  export interface QRCodePoint {
    x: number;
    y: number;
  }
  export interface QRCodeLocation {
    topLeftCorner: QRCodePoint;
    topRightCorner: QRCodePoint;
    bottomRightCorner: QRCodePoint;
    bottomLeftCorner: QRCodePoint;
    topLeftFinderPattern: QRCodePoint;
    topRightFinderPattern: QRCodePoint;
    bottomLeftFinderPattern: QRCodePoint;
    bottomRightAlignmentPattern?: QRCodePoint;
  }
  export interface QRCode {
    binaryData: number[];
    data: string;
    location: QRCodeLocation;
    chunks: unknown[];
    version: number;
  }
  export interface Options {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: Options
  ): QRCode | null;
}

interface BarcodeDetectorFormat {
  rawValue: string;
  format: string;
  cornerPoints: { x: number; y: number }[];
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorFormat[]>;
}
