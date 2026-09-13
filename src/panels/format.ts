// Number formatting for readouts. SI prefixes, tabular digits, no locale surprises.

const PREFIXES: [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

/** 0.0000048 W -> "4.80 µW" */
export function fmtSI(value: number, unit: string, digits = 3): string {
  if (!isFinite(value)) return `0 ${unit}`;
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  for (const [scale, prefix] of PREFIXES) {
    if (abs >= scale * 0.9995) {
      const v = value / scale;
      const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(v))) + 1);
      const dec = Math.max(0, digits - intDigits);
      return `${v.toFixed(dec)} ${prefix}${unit}`;
    }
  }
  return `${value.toExponential(2)} ${unit}`;
}

/** 37896 -> "37,896" */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtHz(hz: number, dec = 2): string {
  return `${hz.toFixed(dec)} Hz`;
}

/** seconds -> "1:23.4", or "5:03:22" past an hour, or "3d 05:03:22" past a day */
export function fmtClock(seconds: number): string {
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const hms = `${d ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return d ? `${d}d ${hms}` : hms;
}
