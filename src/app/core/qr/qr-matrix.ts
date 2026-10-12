/**
 * Standalone QR Code Matrix Generator in TypeScript
 * Implements ISO/IEC 18004 QR Code standard.
 * Supports Versions 1 to 40, Error Correction Levels L, M, Q, H.
 * Classifies modules to enable custom eye shapes, styling, and logo clearance.
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

export enum QrModuleType {
  DATA = 'data',
  FINDER_OUTER = 'finder_outer',
  FINDER_INNER = 'finder_inner',
  FINDER_SEPARATOR = 'finder_separator',
  ALIGNMENT = 'alignment',
  TIMING = 'timing',
  FORMAT = 'format',
  VERSION = 'version',
  QUIET_ZONE = 'quiet_zone',
}

export interface QrModule {
  x: number;
  y: number;
  isDark: boolean;
  type: QrModuleType;
  finderIndex?: 0 | 1 | 2; // 0: Top-Left, 1: Top-Right, 2: Bottom-Left
}

export interface QrMatrixResult {
  size: number;
  version: number;
  eccLevel: QrEccLevel;
  mask: number;
  modules: boolean[][];
  moduleTypes: QrModuleType[][];
  finderPatterns: { x: number; y: number; size: number }[];
  isDark(x: number, y: number): boolean;
  getType(x: number, y: number): QrModuleType;
}

// Galois Field GF(2^8) math for Reed-Solomon Error Correction
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function reedSolomonComputeDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree + 1);
  result[0] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = result.length - 1; j >= 0; j--) {
      result[j] = gfMultiply(result[j], root);
      if (j > 0) result[j] ^= result[j - 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const degree = divisor.length - 1;
  const result = new Uint8Array(degree);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMultiply(divisor[i + 1], factor);
    }
  }
  return result;
}

// ECC constants per version and level: [totalCodewords, eccCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
// Standard ECC table for versions 1 to 40
const ECC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, number[]> = {
  L: [
    7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
    28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
    28, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEccLevel, number[]> = {
  L: [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
    23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

// Alignment pattern base coordinates for versions 1 to 40
function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

// Total raw data codewords capacity
function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number, ecc: QrEccLevel): number {
  const total = Math.floor(getNumRawDataModules(version) / 8);
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version - 1];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version - 1];
  return total - eccPerBlock * numBlocks;
}

/**
 * Encodes a string (UTF-8 byte mode) into bit segments.
 */
function encodeTextToBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

class BitBuffer {
  private buffer: number[] = [];
  public length = 0;

  put(num: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Finds the minimum QR version (1-40) needed for the payload and ECC level.
 */
export function findMinimumVersion(text: string, ecc: QrEccLevel): number {
  const dataBytes = encodeTextToBytes(text);
  const byteCount = dataBytes.length;

  for (let ver = 1; ver <= 40; ver++) {
    const charCountBits = ver <= 9 ? 8 : 16;
    const totalDataBits = 4 + charCountBits + byteCount * 8;
    const capacityBits = getNumDataCodewords(ver, ecc) * 8;
    if (totalDataBits <= capacityBits) {
      return ver;
    }
  }
  throw new Error(`Data is too large to fit in a QR Code at ECC level ${ecc}`);
}

/**
 * Main QR Matrix builder class
 */
export class QrMatrixGenerator {
  /**
   * Generates a fully compliant QR Code matrix with module tagging
   */
  static generate(text: string, requestedEcc: QrEccLevel = 'M'): QrMatrixResult {
    const version = findMinimumVersion(text, requestedEcc);
    const size = version * 4 + 17;

    // 1. Prepare bit stream (Byte Mode = 0100)
    const dataBytes = encodeTextToBytes(text);
    const charCountBits = version <= 9 ? 8 : 16;
    const bb = new BitBuffer();
    bb.put(0b0100, 4); // Byte mode indicator
    bb.put(dataBytes.length, charCountBits);
    for (const b of dataBytes) {
      bb.put(b, 8);
    }

    // Capacity in bytes
    const dataCapacityBytes = getNumDataCodewords(version, requestedEcc);
    const capacityBits = dataCapacityBytes * 8;

    // Terminator (up to 4 zeroes)
    const terminatorBits = Math.min(4, capacityBits - bb.length);
    bb.put(0, terminatorBits);

    // Byte align
    if (bb.length % 8 !== 0) {
      bb.put(0, 8 - (bb.length % 8));
    }

    // Pad bytes 0xEC, 0x11
    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bb.length < capacityBits) {
      bb.put(padBytes[padIndex % 2], 8);
      padIndex++;
    }

    const dataCodewords = bb.getBytes();

    // 2. Error Correction Codewords computation with interleaving
    const allCodewords = QrMatrixGenerator.createBlocks(version, requestedEcc, dataCodewords);

    // 3. Grid allocation & function patterns placement
    const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    const moduleTypes: QrModuleType[][] = Array.from({ length: size }, () => Array(size).fill(QrModuleType.DATA));

    // Place Finder Patterns (7x7 at 3 corners)
    const finderCoords = [
      { x: 0, y: 0, idx: 0 },
      { x: size - 7, y: 0, idx: 1 },
      { x: 0, y: size - 7, idx: 2 },
    ];

    for (const { x, y } of finderCoords) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const gr = y + r;
          const gc = x + c;
          if (gr >= 0 && gr < size && gc >= 0 && gc < size) {
            isFunction[gr][gc] = true;
            if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
              const isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
              grid[gr][gc] = isDark;
              if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
                moduleTypes[gr][gc] = QrModuleType.FINDER_INNER;
              } else {
                moduleTypes[gr][gc] = QrModuleType.FINDER_OUTER;
              }
            } else {
              grid[gr][gc] = false;
              moduleTypes[gr][gc] = QrModuleType.FINDER_SEPARATOR;
            }
          }
        }
      }
    }

    // Alignment patterns (for version >= 2)
    const alignPositions = getAlignmentPatternPositions(version);
    for (const r of alignPositions) {
      for (const c of alignPositions) {
        // Skip if overlaps finder patterns
        if (
          (r === 6 && c === 6) ||
          (r === 6 && c === size - 7) ||
          (r === size - 7 && c === 6)
        ) {
          continue;
        }

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const gr = r + dr;
            const gc = c + dc;
            isFunction[gr][gc] = true;
            const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            grid[gr][gc] = isDark;
            moduleTypes[gr][gc] = QrModuleType.ALIGNMENT;
          }
        }
      }
    }

    // Timing patterns
    for (let i = 0; i < size; i++) {
      if (!isFunction[6][i]) {
        isFunction[6][i] = true;
        grid[6][i] = i % 2 === 0;
        moduleTypes[6][i] = QrModuleType.TIMING;
      }
      if (!isFunction[i][6]) {
        isFunction[i][6] = true;
        grid[i][6] = i % 2 === 0;
        moduleTypes[i][6] = QrModuleType.TIMING;
      }
    }

    // Dark module (always at x = 8, y = 4 * version + 9)
    const darkY = 4 * version + 9;
    grid[darkY][8] = true;
    isFunction[darkY][8] = true;
    moduleTypes[darkY][8] = QrModuleType.FORMAT;

    // Reserve Format Information areas
    for (let i = 0; i < 9; i++) {
      if (i < size) {
        isFunction[8][i] = true;
        isFunction[i][8] = true;
        moduleTypes[8][i] = QrModuleType.FORMAT;
        moduleTypes[i][8] = QrModuleType.FORMAT;
      }
    }
    for (let i = 0; i < 8; i++) {
      isFunction[8][size - 1 - i] = true;
      isFunction[size - 1 - i][8] = true;
      moduleTypes[8][size - 1 - i] = QrModuleType.FORMAT;
      moduleTypes[size - 1 - i][8] = QrModuleType.FORMAT;
    }

    // Reserve Version Information areas for version >= 7
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          isFunction[size - 11 + j][i] = true;
          isFunction[i][size - 11 + j] = true;
          moduleTypes[size - 11 + j][i] = QrModuleType.VERSION;
          moduleTypes[i][size - 11 + j] = QrModuleType.VERSION;
        }
      }
    }

    // 4. Place Data Codewords (zigzag traversal)
    let bitIndex = 0;
    const totalDataBits = allCodewords.length * 8;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // skip vertical timing column
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;

          if (!isFunction[y][x]) {
            let bit = false;
            if (bitIndex < totalDataBits) {
              const byteVal = allCodewords[Math.floor(bitIndex / 8)];
              bit = ((byteVal >>> (7 - (bitIndex % 8))) & 1) === 1;
              bitIndex++;
            }
            grid[y][x] = bit;
            moduleTypes[y][x] = QrModuleType.DATA;
          }
        }
      }
    }

    // 5. Select Best Mask (0 to 7) based on penalty score
    let bestMask = 0;
    let minPenalty = Infinity;
    let bestGrid: boolean[][] = grid;

    for (let mask = 0; mask < 8; mask++) {
      const candidateGrid = grid.map((row) => [...row]);
      QrMatrixGenerator.applyMask(candidateGrid, isFunction, mask, size);
      QrMatrixGenerator.writeFormatInfo(candidateGrid, requestedEcc, mask, size);
      if (version >= 7) {
        QrMatrixGenerator.writeVersionInfo(candidateGrid, version, size);
      }
      const penalty = QrMatrixGenerator.calculatePenalty(candidateGrid, size);
      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestMask = mask;
        bestGrid = candidateGrid;
      }
    }

    return {
      size,
      version,
      eccLevel: requestedEcc,
      mask: bestMask,
      modules: bestGrid,
      moduleTypes,
      finderPatterns: [
        { x: 0, y: 0, size: 7 },
        { x: size - 7, y: 0, size: 7 },
        { x: 0, y: size - 7, size: 7 },
      ],
      isDark(x: number, y: number): boolean {
        if (x < 0 || x >= size || y < 0 || y >= size) return false;
        return bestGrid[y][x];
      },
      getType(x: number, y: number): QrModuleType {
        if (x < 0 || x >= size || y < 0 || y >= size) return QrModuleType.QUIET_ZONE;
        return moduleTypes[y][x];
      },
    };
  }

  private static createBlocks(
    version: number,
    ecc: QrEccLevel,
    dataCodewords: Uint8Array
  ): Uint8Array {
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version - 1];
    const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version - 1];
    const totalDataCodewords = getNumDataCodewords(version, ecc);
    const shortBlockLen = Math.floor(totalDataCodewords / numBlocks);
    const numShortBlocks = numBlocks - (totalDataCodewords % numBlocks);

    const divisor = reedSolomonComputeDivisor(eccPerBlock);
    const dataBlocks: Uint8Array[] = [];
    const eccBlocks: Uint8Array[] = [];

    let offset = 0;
    for (let i = 0; i < numBlocks; i++) {
      const blockLen = i < numShortBlocks ? shortBlockLen : shortBlockLen + 1;
      const blockData = dataCodewords.subarray(offset, offset + blockLen);
      offset += blockLen;
      dataBlocks.push(blockData);
      eccBlocks.push(reedSolomonComputeRemainder(blockData, divisor));
    }

    // Interleave data codewords
    const result: number[] = [];
    const maxDataLen = shortBlockLen + 1;
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < numBlocks; b++) {
        if (i < dataBlocks[b].length) {
          result.push(dataBlocks[b][i]);
        }
      }
    }

    // Interleave ECC codewords
    for (let i = 0; i < eccPerBlock; i++) {
      for (let b = 0; b < numBlocks; b++) {
        result.push(eccBlocks[b][i]);
      }
    }

    return new Uint8Array(result);
  }

  private static applyMask(
    grid: boolean[][],
    isFunction: boolean[][],
    mask: number,
    size: number
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2 + (x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2 + (x * y) % 3) % 2) === 0; break;
          case 7: invert = (((x + y) % 2 + (x * y) % 3) % 2) === 0; break;
        }
        if (invert) {
          grid[y][x] = !grid[y][x];
        }
      }
    }
  }

  private static writeFormatInfo(
    grid: boolean[][],
    ecc: QrEccLevel,
    mask: number,
    size: number
  ): void {
    const eccBits: Record<QrEccLevel, number> = {
      L: 0b01,
      M: 0b00,
      Q: 0b11,
      H: 0b10,
    };
    const data = (eccBits[ecc] << 3) | mask;
    // Compute 10 bits of BCH(15, 5) code
    let rem = data << 10;
    const generator = 0x537;
    for (let i = 4; i >= 0; i--) {
      if ((rem & (1 << (i + 10))) !== 0) {
        rem ^= generator << i;
      }
    }
    const format = ((data << 10) | rem) ^ 0x5412; // XOR with mask 101010000010010

    // Place around top-left finder pattern
    for (let i = 0; i < 6; i++) grid[8][i] = ((format >>> i) & 1) === 1;
    grid[8][7] = ((format >>> 6) & 1) === 1;
    grid[8][8] = ((format >>> 7) & 1) === 1;
    grid[7][8] = ((format >>> 8) & 1) === 1;
    for (let i = 9; i < 15; i++) grid[14 - i][8] = ((format >>> i) & 1) === 1;

    // Place second copy around other finder patterns
    for (let i = 0; i < 8; i++) grid[size - 1 - i][8] = ((format >>> i) & 1) === 1;
    for (let i = 8; i < 15; i++) grid[8][size - 15 + i] = ((format >>> i) & 1) === 1;
  }

  private static writeVersionInfo(grid: boolean[][], version: number, size: number): void {
    if (version < 7) return;
    let rem = version << 12;
    const generator = 0x1f25;
    for (let i = 5; i >= 0; i--) {
      if ((rem & (1 << (i + 12))) !== 0) {
        rem ^= generator << i;
      }
    }
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >>> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = (size - 11) + (i % 3);
      grid[row][col] = bit;
      grid[col][row] = bit;
    }
  }

  private static calculatePenalty(grid: boolean[][], size: number): number {
    let penalty = 0;

    // Rule 1: 5 or more consecutive modules of same color in row/col
    for (let y = 0; y < size; y++) {
      let runColor = grid[y][0];
      let runLen = 1;
      for (let x = 1; x < size; x++) {
        if (grid[y][x] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = grid[y][x];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    for (let x = 0; x < size; x++) {
      let runColor = grid[0][x];
      let runLen = 1;
      for (let y = 1; y < size; y++) {
        if (grid[y][x] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = grid[y][x];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    // Rule 2: 2x2 blocks of same color
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = grid[y][x];
        if (
          color === grid[y + 1][x] &&
          color === grid[y][x + 1] &&
          color === grid[y + 1][x + 1]
        ) {
          penalty += 3;
        }
      }
    }

    // Rule 3: 1:1:3:1:1 pattern
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size - 6; x++) {
        if (
          grid[y][x] &&
          !grid[y][x + 1] &&
          grid[y][x + 2] &&
          grid[y][x + 3] &&
          grid[y][x + 4] &&
          !grid[y][x + 5] &&
          grid[y][x + 6]
        ) {
          if (x >= 4 && !grid[y][x - 1] && !grid[y][x - 2] && !grid[y][x - 3] && !grid[y][x - 4]) {
            penalty += 40;
          }
          if (x + 10 < size && !grid[y][x + 7] && !grid[y][x + 8] && !grid[y][x + 9] && !grid[y][x + 10]) {
            penalty += 40;
          }
        }
      }
    }

    // Rule 4: Proportion of dark modules
    let darkCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x]) darkCount++;
      }
    }
    const percent = Math.floor((darkCount * 100) / (size * size));
    const prev5 = Math.abs(percent - 50) - (Math.abs(percent - 50) % 5);
    penalty += (prev5 / 5) * 10;

    return penalty;
  }
}
