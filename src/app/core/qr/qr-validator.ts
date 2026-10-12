import { QrDesign } from './qr-design.model';
import { QrMatrixResult } from './qr-matrix';

export interface ScanabilityWarning {
  id: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  actionable?: {
    label: string;
    action: string;
  };
}

export interface ScanabilityReport {
  score: number; // 0 - 100
  status: 'excellent' | 'good' | 'warning' | 'critical';
  contrastRatio: number;
  warnings: ScanabilityWarning[];
  logoOcclusionPercent: number;
  maxEccTolerancePercent: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }
  return null;
}

function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const srgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = srgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function calculateContrastRatio(fgHex: string, bgHex: string): number {
  const fgRgb = hexToRgb(fgHex) || { r: 15, g: 23, b: 42 };
  const bgRgb = hexToRgb(bgHex) || { r: 255, g: 255, b: 255 };

  const l1 = getRelativeLuminance(fgRgb);
  const l2 = getRelativeLuminance(bgRgb);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export class QrValidator {
  static evaluate(matrix: QrMatrixResult, design: QrDesign, payloadLength: number): ScanabilityReport {
    const warnings: ScanabilityWarning[] = [];
    let score = 100;

    // 1. Contrast Evaluation
    const isTransparent = design.background === 'transparent';
    let contrastRatio = 21; // default black on white

    if (isTransparent) {
      warnings.push({
        id: 'transparent-bg',
        level: 'info',
        title: 'Transparent Background',
        message: 'Ensure this vector QR is placed against a light, high-contrast surface in your document or print design.',
      });
      // Test against white surface
      contrastRatio = calculateContrastRatio(design.foreground, '#ffffff');
    } else {
      contrastRatio = calculateContrastRatio(design.foreground, design.background);
    }

    if (contrastRatio < 2.5) {
      score -= 40;
      warnings.push({
        id: 'critical-contrast',
        level: 'error',
        title: 'Critical Low Contrast',
        message: `Contrast ratio is only ${contrastRatio.toFixed(1)}:1. Most smartphone cameras will fail to decode this. Please darken foreground or lighten background.`,
        actionable: { label: 'Reset to High Contrast', action: 'reset-contrast' },
      });
    } else if (contrastRatio < 4.5) {
      score -= 20;
      warnings.push({
        id: 'low-contrast',
        level: 'warning',
        title: 'Suboptimal Contrast',
        message: `Contrast ratio is ${contrastRatio.toFixed(1)}:1. Dim lighting conditions may cause scan delays.`,
      });
    }

    // Inverted check (lighter foreground than background)
    if (!isTransparent) {
      const fgRgb = hexToRgb(design.foreground) || { r: 0, g: 0, b: 0 };
      const bgRgb = hexToRgb(design.background) || { r: 255, g: 255, b: 255 };
      if (getRelativeLuminance(fgRgb) > getRelativeLuminance(bgRgb)) {
        score -= 15;
        warnings.push({
          id: 'inverted-colors',
          level: 'warning',
          title: 'Inverted (Dark Mode) QR',
          message: 'Light modules on dark background look sleek, but some legacy camera scanners do not support inverted QR codes.',
        });
      }
    }

    // 2. Quiet Zone Evaluation
    if (design.quietZone < 2) {
      score -= 15;
      warnings.push({
        id: 'quiet-zone-low',
        level: 'warning',
        title: 'Small Quiet Zone',
        message: 'Quiet zone margin is below 2 modules. Increase quiet zone to ensure cameras distinguish the QR from surrounding layout borders.',
        actionable: { label: 'Set Quiet Zone to 4', action: 'fix-quiet-zone' },
      });
    }

    // 3. Logo Occlusion & Error Correction Evaluation
    const eccTolerance: Record<string, number> = {
      L: 7,
      M: 15,
      Q: 25,
      H: 30,
    };
    const maxEccPercent = eccTolerance[matrix.eccLevel] || 15;
    let logoPercent = 0;

    if (design.logo && design.logo.enabled && design.logo.dataUrl) {
      // Area percentage covered by logo and clear box
      const effectiveSize = Math.min(0.28, Math.max(0.1, design.logo.sizeRatio));
      logoPercent = Math.round(effectiveSize * effectiveSize * 100);

      if (matrix.eccLevel !== 'H' && matrix.eccLevel !== 'Q') {
        score -= 15;
        warnings.push({
          id: 'ecc-too-low-for-logo',
          level: 'warning',
          title: 'Boost Error Correction for Logo',
          message: `Current error correction (${matrix.eccLevel} ~${maxEccPercent}%) is low for logos. Switching to High (H: 30%) ensures error-free scanning.`,
          actionable: { label: 'Upgrade to High ECC (H)', action: 'boost-ecc' },
        });
      }

      if (logoPercent > maxEccPercent * 0.8) {
        score -= 25;
        warnings.push({
          id: 'logo-large',
          level: 'warning',
          title: 'Large Logo Area',
          message: `Logo covers approximately ${logoPercent}% of the code area. Consider reducing logo size slider for maximum scan speed.`,
        });
      }
    }

    // 4. Data Density Evaluation
    if (payloadLength > 400) {
      score -= 10;
      warnings.push({
        id: 'dense-payload',
        level: 'info',
        title: 'Dense Data Payload',
        message: `Payload contains ${payloadLength} characters (Version ${matrix.version}). The QR modules will be small and compact. Recommended print size is at least 3.5cm x 3.5cm.`,
      });
    }

    score = Math.max(10, Math.min(100, score));

    const hasErrors = warnings.some((w) => w.level === 'error');
    let status: ScanabilityReport['status'] = 'excellent';
    if (hasErrors || score < 45) status = 'critical';
    else if (score < 70) status = 'warning';
    else if (score < 90) status = 'good';

    return {
      score,
      status,
      contrastRatio,
      warnings,
      logoOcclusionPercent: logoPercent,
      maxEccTolerancePercent: maxEccPercent,
    };
  }
}
