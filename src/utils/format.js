const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function fmtBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const v = bytes / 1024 ** i;
  return `${parseFloat(v.toFixed(i === 0 ? 0 : decimals))} ${UNITS[i]}`;
}

export const fmtRate = (bytesPerSec, decimals = 1) => `${fmtBytes(bytesPerSec, decimals)}/s`;

export const fmtGb = (gb, decimals = 1) => `${(gb ?? 0).toFixed(decimals)} GB`;

export const fmtPct = (v, decimals = 1) => `${(v ?? 0).toFixed(decimals)}%`;

/** Round up to 1 / 2 / 5 × 10^n so axis ticks look clean. */
export function niceCeil(v, min = 1) {
  if (!(v > min)) return min;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Same idea, but in binary units (KB/MB/GB) for byte rates. */
export function niceCeilBytes(v, min = 10 * 1024) {
  if (!(v > min)) return min;
  const k = Math.floor(Math.log(v) / Math.log(1024));
  const unit = 1024 ** k;
  return niceCeil(v / unit) * unit;
}
