// Shared canvas plumbing: device pixel ratio, resize, palette from tokens, fonts.

export interface Palette {
  ink: string;
  bench: string;
  filament: string;
  copper: string;
  patina: string;
  steel: string;
  fault: string;
}

let palette: Palette | null = null;
export function getPalette(): Palette {
  if (palette) return palette;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  palette = { ink: v('--ink'), bench: v('--bench'), filament: v('--filament'), copper: v('--copper'), patina: v('--patina'), steel: v('--steel'), fault: v('--fault') };
  return palette;
}

export const MONO = "'Departure Mono', monospace";
export const SERIF = "'Basteleur', serif";

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS pixel size */
  w: number;
  h: number;
  dpr: number;
  /** true when the element is on screen */
  visible: boolean;
}

/** Set up a canvas that follows its CSS size. onResize is called after each size change. */
export function setupCanvas(canvas: HTMLCanvasElement, onResize?: (s: Surface) => void): Surface {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const s: Surface = { canvas, ctx, w: 0, h: 0, dpr: 1, visible: false };
  const apply = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    s.w = w; s.h = h; s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.(s);
  };
  apply();
  new ResizeObserver(apply).observe(canvas);
  new IntersectionObserver((es) => { for (const e of es) s.visible = e.isIntersecting; }, { rootMargin: '200px' }).observe(canvas);
  return s;
}

export function withAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** hairline axis with tick labels along the bottom and left */
export function axes(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, pal: Palette) {
  ctx.strokeStyle = withAlpha(pal.steel, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y0 + 0.5);
  ctx.lineTo(x0 + 0.5, y1 + 0.5);
  ctx.lineTo(x1 + 0.5, y1 + 0.5);
  ctx.stroke();
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, pal: Palette, align: CanvasTextAlign = 'left', color = pal.steel) {
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

/** nice tick values for a range */
export function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
