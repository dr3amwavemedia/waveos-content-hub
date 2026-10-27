// Pixel-level equivalent of the CSS filter chain used for photo adjustments.
// Safari/WebKit accepts CanvasRenderingContext2D.filter but ignores it when drawing,
// so the shared renderer applies these same Filter Effects formulas to pixels there.

export type PhotoFilterParams = {
  brightness: number; // percent, 100 = unchanged
  contrast: number; // percent, 100 = unchanged
  saturation: number; // percent, 100 = unchanged
  sepia: number; // 0..1
  hueRotate: number; // degrees
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function saturateMatrix(s: number) {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function sepiaMatrix(amount: number) {
  const a = 1 - Math.max(0, Math.min(1, amount));
  return [
    0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
    0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
    0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
  ];
}

function hueMatrix(deg: number) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

export function isIdentityPhotoFilter(p: PhotoFilterParams) {
  return p.brightness === 100 && p.contrast === 100 && p.saturation === 100 && p.sepia === 0 && p.hueRotate === 0;
}

/** Applies brightness → contrast → saturate → sepia → hue-rotate in place (RGBA, 0–255), clamping after each step like CSS. */
export function applyPhotoFilterPixels(data: Uint8ClampedArray | number[], p: PhotoFilterParams) {
  if (isIdentityPhotoFilter(p)) return data;
  const b = p.brightness / 100, k = p.contrast / 100;
  const sat = p.saturation === 100 ? null : saturateMatrix(p.saturation / 100);
  const sep = p.sepia > 0 ? sepiaMatrix(p.sepia) : null;
  const hue = p.hueRotate !== 0 ? hueMatrix(p.hueRotate) : null;
  const mats = [sat, sep, hue].filter((m): m is number[] => m !== null);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255, g = data[i + 1] / 255, bl = data[i + 2] / 255;
    if (b !== 1) { r = clamp01(r * b); g = clamp01(g * b); bl = clamp01(bl * b); }
    if (k !== 1) { r = clamp01((r - 0.5) * k + 0.5); g = clamp01((g - 0.5) * k + 0.5); bl = clamp01((bl - 0.5) * k + 0.5); }
    for (const m of mats) {
      const nr = m[0] * r + m[1] * g + m[2] * bl, ng = m[3] * r + m[4] * g + m[5] * bl, nb = m[6] * r + m[7] * g + m[8] * bl;
      r = clamp01(nr); g = clamp01(ng); bl = clamp01(nb);
    }
    data[i] = Math.round(r * 255); data[i + 1] = Math.round(g * 255); data[i + 2] = Math.round(bl * 255);
  }
  return data;
}

export function photoFilterCss(p: PhotoFilterParams) {
  return `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%) sepia(${p.sepia}) hue-rotate(${p.hueRotate}deg)`;
}
