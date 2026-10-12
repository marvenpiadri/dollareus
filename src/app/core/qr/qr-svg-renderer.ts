import { QrDesign } from './qr-design.model';
import { QrMatrixResult, QrModuleType } from './qr-matrix';

export interface SvgRenderOptions {
  cellSize?: number;
  standalone?: boolean;
}

export class QrSvgRenderer {
  /**
   * Renders a standalone, high-fidelity vector SVG string from a QR matrix and design.
   */
  static render(matrix: QrMatrixResult, design: QrDesign, options: SvgRenderOptions = {}): string {
    const cellSize = options.cellSize || 10;
    const quietZone = design.quietZone;
    const matrixSize = matrix.size;
    const qrGridSize = matrixSize + quietZone * 2;
    const qrPixelSize = qrGridSize * cellSize;

    // Calculate dimensions based on frame configuration
    let totalWidth = qrPixelSize;
    let totalHeight = qrPixelSize;
    let qrOffsetX = 0;
    let qrOffsetY = 0;

    const hasFrame = design.frame && design.frame.type !== 'none';
    const frameType = hasFrame ? design.frame.type : 'none';

    if (frameType === 'simple-border') {
      const padding = cellSize * 2;
      totalWidth += padding * 2;
      totalHeight += padding * 2;
      qrOffsetX = padding;
      qrOffsetY = padding;
    } else if (frameType === 'badge-bottom') {
      const padding = cellSize * 2;
      const bannerHeight = cellSize * 4.5;
      totalWidth += padding * 2;
      totalHeight += padding * 2 + bannerHeight;
      qrOffsetX = padding;
      qrOffsetY = padding;
    } else if (frameType === 'badge-top') {
      const padding = cellSize * 2;
      const bannerHeight = cellSize * 4.5;
      totalWidth += padding * 2;
      totalHeight += padding * 2 + bannerHeight;
      qrOffsetX = padding;
      qrOffsetY = padding + bannerHeight;
    } else if (frameType === 'phone') {
      const padX = cellSize * 2.5;
      const padTop = cellSize * 4;
      const padBottom = cellSize * 3.5;
      totalWidth += padX * 2;
      totalHeight += padTop + padBottom;
      qrOffsetX = padX;
      qrOffsetY = padTop;
    } else if (frameType === 'ticket') {
      const padding = cellSize * 2.5;
      const tagHeight = cellSize * 4;
      totalWidth += padding * 2;
      totalHeight += padding * 2 + tagHeight;
      qrOffsetX = padding;
      qrOffsetY = padding;
    }

    // Logo clearance computation
    const logoEnabled = design.logo && design.logo.enabled && !!design.logo.dataUrl;
    let logoBounds: {
      minCellX: number;
      maxCellX: number;
      minCellY: number;
      maxCellY: number;
      centerX: number;
      centerY: number;
      widthPx: number;
      heightPx: number;
      paddingPx: number;
    } | null = null;

    if (logoEnabled) {
      const qrInnerPixelSize = matrixSize * cellSize;
      const rawLogoPx = qrInnerPixelSize * Math.min(0.28, Math.max(0.1, design.logo.sizeRatio));
      const paddingPx = (design.logo.padding ?? 1) * cellSize;
      const totalLogoBoxPx = rawLogoPx + paddingPx * 2;

      const centerPxX = qrOffsetX + (quietZone + matrixSize / 2) * cellSize;
      const centerPxY = qrOffsetY + (quietZone + matrixSize / 2) * cellSize;

      const minCell = Math.floor((matrixSize / 2) - (totalLogoBoxPx / (2 * cellSize)));
      const maxCell = Math.ceil((matrixSize / 2) + (totalLogoBoxPx / (2 * cellSize)));

      logoBounds = {
        minCellX: minCell,
        maxCellX: maxCell,
        minCellY: minCell,
        maxCellY: maxCell,
        centerX: centerPxX,
        centerY: centerPxY,
        widthPx: rawLogoPx,
        heightPx: rawLogoPx,
        paddingPx,
      };
    }

    // Generate SVG Elements
    const defs: string[] = [];
    const elements: string[] = [];

    // Unique gradient ID
    const gradId = `qr-grad-${Math.random().toString(36).substring(2, 9)}`;
    let mainFill = design.foreground;

    if (design.useGradient) {
      const rad = (design.gradientAngle * Math.PI) / 180;
      const x1 = Math.round(50 - Math.cos(rad) * 50);
      const y1 = Math.round(50 - Math.sin(rad) * 50);
      const x2 = Math.round(50 + Math.cos(rad) * 50);
      const y2 = Math.round(50 + Math.sin(rad) * 50);
      defs.push(`
        <linearGradient id="${gradId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="${design.foreground}" />
          <stop offset="100%" stop-color="${design.gradientColor2 || design.foreground}" />
        </linearGradient>
      `);
      mainFill = `url(#${gradId})`;
    }

    // 1. Overall Background (if not transparent)
    if (design.background && design.background !== 'transparent') {
      elements.push(
        `<rect width="${totalWidth}" height="${totalHeight}" fill="${design.background}" rx="${hasFrame ? cellSize : 0}" />`
      );
    }

    // 2. Decorative Frame (Back / Border layer)
    if (hasFrame) {
      this.renderFrameLayer(elements, design, totalWidth, totalHeight, cellSize, frameType, 'back');
    }

    // 3. QR Data Modules
    const moduleElements: string[] = [];
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        const type = matrix.getType(c, r);

        // Finder pattern cells are handled separately by custom eye renderer
        if (
          type === QrModuleType.FINDER_OUTER ||
          type === QrModuleType.FINDER_INNER ||
          type === QrModuleType.FINDER_SEPARATOR
        ) {
          continue;
        }

        if (!matrix.isDark(c, r)) continue;

        // Skip if covered by logo clear zone
        if (
          logoBounds &&
          c >= logoBounds.minCellX &&
          c <= logoBounds.maxCellX &&
          r >= logoBounds.minCellY &&
          r <= logoBounds.maxCellY
        ) {
          continue;
        }

        const cellX = qrOffsetX + (quietZone + c) * cellSize;
        const cellY = qrOffsetY + (quietZone + r) * cellSize;

        moduleElements.push(this.renderModule(cellX, cellY, cellSize, design.moduleStyle, c, r, matrix));
      }
    }

    // Append modules grouped by main fill
    elements.push(`<g fill="${mainFill}">${moduleElements.join('\n')}</g>`);

    // 4. Custom Finder Pattern Eyes (Top-Left, Top-Right, Bottom-Left)
    const finderCoords = [
      { col: 0, row: 0 },
      { col: matrixSize - 7, row: 0 },
      { col: 0, row: matrixSize - 7 },
    ];

    const eyeFrameFill = design.customEyeColors ? design.eyeFrameColor : mainFill;
    const eyePupilFill = design.customEyeColors ? design.eyePupilColor : mainFill;

    finderCoords.forEach(({ col, row }, index) => {
      const eyeX = qrOffsetX + (quietZone + col) * cellSize;
      const eyeY = qrOffsetY + (quietZone + row) * cellSize;
      elements.push(
        this.renderEye(
          eyeX,
          eyeY,
          cellSize,
          design.eyeFrameStyle,
          design.eyePupilStyle,
          eyeFrameFill,
          eyePupilFill,
          index
        )
      );
    });

    // 5. Logo Layer
    if (logoBounds && design.logo.dataUrl) {
      elements.push(this.renderLogo(logoBounds, design.logo));
    }

    // 6. Frame Foreground & Text Layer
    if (hasFrame) {
      this.renderFrameLayer(elements, design, totalWidth, totalHeight, cellSize, frameType, 'front');
    }

    // Build Final Standalone SVG Markup
    const defsBlock = defs.length ? `<defs>${defs.join('\n')}</defs>` : '';
    const svgTag = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}" shape-rendering="geometricPrecision">${defsBlock}${elements.join('\n')}</svg>`;

    return svgTag;
  }

  private static renderModule(
    x: number,
    y: number,
    size: number,
    style: string,
    c: number,
    r: number,
    matrix: QrMatrixResult
  ): string {
    switch (style) {
      case 'rounded': {
        const radius = Math.round(size * 0.35);
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" ry="${radius}" />`;
      }

      case 'dots': {
        const cx = x + size / 2;
        const cy = y + size / 2;
        const cr = (size / 2) * 0.88;
        return `<circle cx="${cx}" cy="${cy}" r="${cr}" />`;
      }

      case 'smooth': {
        // Connected smooth modules
        const top = r > 0 && matrix.isDark(c, r - 1);
        const bottom = r < matrix.size - 1 && matrix.isDark(c, r + 1);
        const left = c > 0 && matrix.isDark(c - 1, r);
        const right = c < matrix.size - 1 && matrix.isDark(c + 1, r);

        const rad = size * 0.45;
        const rtl = !top && !left ? rad : 0;
        const rtr = !top && !right ? rad : 0;
        const rbr = !bottom && !right ? rad : 0;
        const rbl = !bottom && !left ? rad : 0;

        return `<path d="
          M ${x + rtl} ${y}
          L ${x + size - rtr} ${y}
          ${rtr ? `Q ${x + size} ${y} ${x + size} ${y + rtr}` : ''}
          L ${x + size} ${y + size - rbr}
          ${rbr ? `Q ${x + size} ${y + size} ${x + size - rbr} ${y + size}` : ''}
          L ${x + rbl} ${y + size}
          ${rbl ? `Q ${x} ${y + size} ${x} ${y + size - rbl}` : ''}
          L ${x} ${y + rtl}
          ${rtl ? `Q ${x} ${y} ${x + rtl} ${y}` : ''}
          Z
        " />`;
      }

      case 'class': {
        // Diamond cut module
        const mid = size / 2;
        return `<polygon points="${x + mid},${y} ${x + size},${y + mid} ${x + mid},${y + size} ${x},${y + mid}" />`;
      }

      case 'square':
      default:
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" />`;
    }
  }

  private static renderEye(
    x: number,
    y: number,
    cellSize: number,
    frameStyle: string,
    pupilStyle: string,
    frameFill: string,
    pupilFill: string,
    eyeIndex: number
  ): string {
    const eyeSize = 7 * cellSize;
    const innerSize = 5 * cellSize;
    const pupilSize = 3 * cellSize;

    const frameParts: string[] = [];
    const pupilParts: string[] = [];

    // Outer 7x7 Frame with hollow 5x5 center
    switch (frameStyle) {
      case 'rounded': {
        const outerR = 1.8 * cellSize;
        const innerR = 1.0 * cellSize;
        frameParts.push(`
          <path fill="${frameFill}" fill-rule="evenodd" d="
            M ${x + outerR} ${y}
            h ${eyeSize - 2 * outerR}
            a ${outerR} ${outerR} 0 0 1 ${outerR} ${outerR}
            v ${eyeSize - 2 * outerR}
            a ${outerR} ${outerR} 0 0 1 -${outerR} ${outerR}
            h -${eyeSize - 2 * outerR}
            a ${outerR} ${outerR} 0 0 1 -${outerR} -${outerR}
            v -${eyeSize - 2 * outerR}
            a ${outerR} ${outerR} 0 0 1 ${outerR} -${outerR}
            z
            M ${x + cellSize + innerR} ${y + cellSize}
            h ${innerSize - 2 * innerR}
            a ${innerR} ${innerR} 0 0 1 ${innerR} ${innerR}
            v ${innerSize - 2 * innerR}
            a ${innerR} ${innerR} 0 0 1 -${innerR} ${innerR}
            h -${innerSize - 2 * innerR}
            a ${innerR} ${innerR} 0 0 1 -${innerR} -${innerR}
            v -${innerSize - 2 * innerR}
            a ${innerR} ${innerR} 0 0 1 ${innerR} -${innerR}
            z
          " />
        `);
        break;
      }

      case 'circle': {
        const cx = x + eyeSize / 2;
        const cy = y + eyeSize / 2;
        const rOuter = eyeSize / 2;
        const rInner = innerSize / 2;
        frameParts.push(`
          <path fill="${frameFill}" fill-rule="evenodd" d="
            M ${cx} ${cy - rOuter}
            A ${rOuter} ${rOuter} 0 1 0 ${cx} ${cy + rOuter}
            A ${rOuter} ${rOuter} 0 1 0 ${cx} ${cy - rOuter}
            Z
            M ${cx} ${cy - rInner}
            A ${rInner} ${rInner} 0 1 1 ${cx} ${cy + rInner}
            A ${rInner} ${rInner} 0 1 1 ${cx} ${cy - rInner}
            Z
          " />
        `);
        break;
      }

      case 'leaf': {
        // Asymmetric organic leaf rounded frame
        const rBig = 3 * cellSize;
        frameParts.push(`
          <path fill="${frameFill}" fill-rule="evenodd" d="
            M ${x + rBig} ${y}
            h ${eyeSize - rBig}
            v ${eyeSize - rBig}
            a ${rBig} ${rBig} 0 0 1 -${rBig} ${rBig}
            h -${eyeSize - rBig}
            v -${eyeSize - rBig}
            a ${rBig} ${rBig} 0 0 1 ${rBig} -${rBig}
            z
            M ${x + cellSize} ${y + cellSize}
            h ${innerSize}
            v ${innerSize}
            h -${innerSize}
            z
          " />
        `);
        break;
      }

      case 'square':
      default: {
        frameParts.push(`
          <path fill="${frameFill}" fill-rule="evenodd" d="
            M ${x} ${y}
            h ${eyeSize}
            v ${eyeSize}
            h -${eyeSize}
            z
            M ${x + cellSize} ${y + cellSize}
            h ${innerSize}
            v ${innerSize}
            h -${innerSize}
            z
          " />
        `);
        break;
      }
    }

    // Inner 3x3 Pupil / Eyeball
    const pupilX = x + 2 * cellSize;
    const pupilY = y + 2 * cellSize;

    switch (pupilStyle) {
      case 'rounded': {
        const pr = 0.9 * cellSize;
        pupilParts.push(
          `<rect fill="${pupilFill}" x="${pupilX}" y="${pupilY}" width="${pupilSize}" height="${pupilSize}" rx="${pr}" ry="${pr}" />`
        );
        break;
      }

      case 'circle': {
        const pcx = pupilX + pupilSize / 2;
        const pcy = pupilY + pupilSize / 2;
        const pr = pupilSize / 2;
        pupilParts.push(`<circle fill="${pupilFill}" cx="${pcx}" cy="${pcy}" r="${pr}" />`);
        break;
      }

      case 'diamond': {
        const pcx = pupilX + pupilSize / 2;
        const pcy = pupilY + pupilSize / 2;
        pupilParts.push(`
          <polygon fill="${pupilFill}" points="
            ${pcx},${pupilY}
            ${pupilX + pupilSize},${pcy}
            ${pcx},${pupilY + pupilSize}
            ${pupilX},${pcy}
          " />
        `);
        break;
      }

      case 'square':
      default: {
        pupilParts.push(
          `<rect fill="${pupilFill}" x="${pupilX}" y="${pupilY}" width="${pupilSize}" height="${pupilSize}" />`
        );
        break;
      }
    }

    return `<g class="qr-finder-eye-${eyeIndex}">${frameParts.join('')}${pupilParts.join('')}</g>`;
  }

  private static renderLogo(
    bounds: {
      centerX: number;
      centerY: number;
      widthPx: number;
      heightPx: number;
      paddingPx: number;
    },
    logo: QrDesign['logo']
  ): string {
    const totalBoxW = bounds.widthPx + bounds.paddingPx * 2;
    const totalBoxH = bounds.heightPx + bounds.paddingPx * 2;
    const boxX = bounds.centerX - totalBoxW / 2;
    const boxY = bounds.centerY - totalBoxH / 2;

    const parts: string[] = [];

    // Background shield / shape for logo
    if (logo.shape !== 'none') {
      const bgColor = logo.bgColor || '#ffffff';
      if (logo.shape === 'circle') {
        const r = totalBoxW / 2;
        parts.push(
          `<circle cx="${bounds.centerX}" cy="${bounds.centerY}" r="${r}" fill="${bgColor}" />`
        );
      } else if (logo.shape === 'rounded') {
        const rx = totalBoxW * 0.22;
        parts.push(
          `<rect x="${boxX}" y="${boxY}" width="${totalBoxW}" height="${totalBoxH}" rx="${rx}" ry="${rx}" fill="${bgColor}" />`
        );
      } else {
        parts.push(
          `<rect x="${boxX}" y="${boxY}" width="${totalBoxW}" height="${totalBoxH}" fill="${bgColor}" />`
        );
      }
    }

    // Embed Image (supports base64 data URLs & SVG)
    const imgX = bounds.centerX - bounds.widthPx / 2;
    const imgY = bounds.centerY - bounds.heightPx / 2;

    parts.push(`
      <image
        x="${imgX}"
        y="${imgY}"
        width="${bounds.widthPx}"
        height="${bounds.heightPx}"
        href="${logo.dataUrl}"
        preserveAspectRatio="xMidYMid meet"
      />
    `);

    return `<g class="qr-logo-container">${parts.join('\n')}</g>`;
  }

  private static renderFrameLayer(
    elements: string[],
    design: QrDesign,
    width: number,
    height: number,
    cellSize: number,
    frameType: string,
    layer: 'back' | 'front'
  ): void {
    const frameColor = design.frame.color || '#0f172a';
    const textColor = design.frame.textColor || '#ffffff';
    const textLabel = (design.frame.text || 'SCAN ME').toUpperCase();
    const fontFamily = design.frame.fontFamily || 'Plus Jakarta Sans, sans-serif';

    if (layer === 'back') {
      switch (frameType) {
        case 'simple-border':
          elements.push(
            `<rect x="${cellSize / 2}" y="${cellSize / 2}" width="${width - cellSize}" height="${height - cellSize}" fill="none" stroke="${frameColor}" stroke-width="${cellSize * 0.5}" rx="${cellSize * 1.5}" />`
          );
          break;

        case 'badge-bottom':
          elements.push(`
            <rect x="0" y="0" width="${width}" height="${height}" rx="${cellSize * 1.5}" fill="none" stroke="${frameColor}" stroke-width="${cellSize * 0.5}" />
            <path d="
              M 0 ${height - cellSize * 5}
              h ${width}
              v ${cellSize * 5 - cellSize * 1.5}
              a ${cellSize * 1.5} ${cellSize * 1.5} 0 0 1 -${cellSize * 1.5} ${cellSize * 1.5}
              h -${width - cellSize * 3}
              a ${cellSize * 1.5} ${cellSize * 1.5} 0 0 1 -${cellSize * 1.5} -${cellSize * 1.5}
              z
            " fill="${frameColor}" />
          `);
          break;

        case 'badge-top':
          elements.push(`
            <rect x="0" y="0" width="${width}" height="${height}" rx="${cellSize * 1.5}" fill="none" stroke="${frameColor}" stroke-width="${cellSize * 0.5}" />
            <path d="
              M 0 ${cellSize * 1.5}
              a ${cellSize * 1.5} ${cellSize * 1.5} 0 0 1 ${cellSize * 1.5} -${cellSize * 1.5}
              h ${width - cellSize * 3}
              a ${cellSize * 1.5} ${cellSize * 1.5} 0 0 1 ${cellSize * 1.5} ${cellSize * 1.5}
              v ${cellSize * 3.5}
              h -${width}
              z
            " fill="${frameColor}" />
          `);
          break;

        case 'phone':
          // Phone mockup frame
          elements.push(`
            <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${cellSize * 3.5}" fill="none" stroke="${frameColor}" stroke-width="${cellSize * 0.6}" />
            <!-- Speaker notch -->
            <rect x="${width / 2 - cellSize * 2}" y="${cellSize * 1.4}" width="${cellSize * 4}" height="${cellSize * 0.5}" rx="${cellSize * 0.25}" fill="${frameColor}" />
            <!-- Camera dot -->
            <circle cx="${width / 2 + cellSize * 3}" cy="${cellSize * 1.65}" r="${cellSize * 0.3}" fill="${frameColor}" opacity="0.6" />
            <!-- Home Bar Indicator -->
            <rect x="${width / 2 - cellSize * 4}" y="${height - cellSize * 1.6}" width="${cellSize * 8}" height="${cellSize * 0.4}" rx="${cellSize * 0.2}" fill="${frameColor}" opacity="0.7" />
          `);
          break;

        case 'ticket': {
          // Perforated coupon frame
          const notchR = cellSize * 1.2;
          const notchY = height - cellSize * 4.5;
          elements.push(`
            <path fill="none" stroke="${frameColor}" stroke-width="${cellSize * 0.4}" d="
              M ${cellSize} ${cellSize}
              h ${width - cellSize * 2}
              v ${notchY - cellSize - notchR}
              a ${notchR} ${notchR} 0 0 0 0 ${notchR * 2}
              v ${height - notchY - notchR - cellSize}
              h -${width - cellSize * 2}
              v -${height - notchY - notchR - cellSize}
              a ${notchR} ${notchR} 0 0 0 0 -${notchR * 2}
              z
            " />
            <!-- Dashed tear line -->
            <line x1="${cellSize * 2}" y1="${notchY}" x2="${width - cellSize * 2}" y2="${notchY}" stroke="${frameColor}" stroke-dasharray="${cellSize * 0.5},${cellSize * 0.5}" stroke-width="${cellSize * 0.25}" opacity="0.6" />
          `);
          break;
        }
      }
    }

    if (layer === 'front') {
      const fontSize = Math.round(cellSize * 1.7);
      if (frameType === 'badge-bottom') {
        const textY = height - cellSize * 2.2;
        elements.push(`
          <text
            x="${width / 2}"
            y="${textY}"
            fill="${textColor}"
            font-family="${fontFamily}"
            font-size="${fontSize}"
            font-weight="700"
            letter-spacing="1.5px"
            text-anchor="middle"
            dominant-baseline="central"
          >${textLabel}</text>
        `);
      } else if (frameType === 'badge-top') {
        const textY = cellSize * 2.6;
        elements.push(`
          <text
            x="${width / 2}"
            y="${textY}"
            fill="${textColor}"
            font-family="${fontFamily}"
            font-size="${fontSize}"
            font-weight="700"
            letter-spacing="1.5px"
            text-anchor="middle"
            dominant-baseline="central"
          >${textLabel}</text>
        `);
      } else if (frameType === 'ticket') {
        const textY = height - cellSize * 2.2;
        elements.push(`
          <text
            x="${width / 2}"
            y="${textY}"
            fill="${frameColor}"
            font-family="${fontFamily}"
            font-size="${fontSize}"
            font-weight="700"
            letter-spacing="2px"
            text-anchor="middle"
            dominant-baseline="central"
          >${textLabel}</text>
        `);
      }
    }
  }
}
