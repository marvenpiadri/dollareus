import { QrEccLevel } from './qr-matrix';

export type ModuleStyle = 'square' | 'rounded' | 'dots' | 'smooth' | 'class';
export type EyeFrameStyle = 'square' | 'rounded' | 'circle' | 'leaf';
export type EyePupilStyle = 'square' | 'rounded' | 'circle' | 'diamond';
export type FrameType = 'none' | 'simple-border' | 'badge-top' | 'badge-bottom' | 'phone' | 'ticket';
export type LogoShape = 'none' | 'circle' | 'rounded' | 'square';

export interface QrLogoConfig {
  enabled: boolean;
  dataUrl: string; // Base64 data URL or SVG XML data
  name?: string;
  sizeRatio: number; // 0.1 to 0.28 (10% to 28% of total QR size)
  padding: number; // in modules, e.g. 1
  shape: LogoShape;
  bgColor: string; // default '#ffffff'
}

export interface QrFrameConfig {
  type: FrameType;
  text: string;
  color: string;
  textColor: string;
  fontFamily: string;
}

export interface QrDesign {
  foreground: string;
  background: string; // hex color or 'transparent'
  useGradient: boolean;
  gradientColor2: string;
  gradientAngle: number; // degrees, e.g. 45

  moduleStyle: ModuleStyle;
  eyeFrameStyle: EyeFrameStyle;
  eyePupilStyle: EyePupilStyle;

  customEyeColors: boolean;
  eyeFrameColor: string;
  eyePupilColor: string;

  quietZone: number; // modules, default 4
  eccLevel: QrEccLevel; // default 'M', auto-boosted to 'H' when logo enabled

  logo: QrLogoConfig;
  frame: QrFrameConfig;
}

export const DEFAULT_QR_DESIGN: QrDesign = {
  foreground: '#17151f',
  background: '#ffffff',
  useGradient: false,
  gradientColor2: '#7c5cfc',
  gradientAngle: 45,

  moduleStyle: 'square',
  eyeFrameStyle: 'square',
  eyePupilStyle: 'square',

  customEyeColors: false,
  eyeFrameColor: '#17151f',
  eyePupilColor: '#17151f',

  quietZone: 3,
  eccLevel: 'M',

  logo: {
    enabled: false,
    dataUrl: '',
    name: '',
    sizeRatio: 0.2,
    padding: 1,
    shape: 'rounded',
    bgColor: '#ffffff',
  },

  frame: {
    type: 'none',
    text: 'SCAN ME',
    color: '#17151f',
    textColor: '#ffffff',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
};
