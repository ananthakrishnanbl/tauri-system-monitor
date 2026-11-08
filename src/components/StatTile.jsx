import { memo } from "react";

/** KPI tile with optional progress bar. `percent` is 0–100. */
function StatTile({ label, value, sub, percent, color = "--accent" }) {
  const p = percent == null ? null : Math.min(100, Math.max(0, percent));
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-sub">{sub}</div>
      {p != null && (
        <div className="bar" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
          <div className="bar-fill" style={{ width: `${p}%`, background: `var(${color})` }} />
        </div>
      )}
    </div>
  );
}

export default memo(StatTile);
