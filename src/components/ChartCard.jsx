import { memo } from "react";

/** Card frame for a chart: title, big headline value, legend with live values. */
function ChartCard({ title, headline, legend = [], children }) {
  return (
    <section className="card chart-card">
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {headline != null && <div className="headline">{headline}</div>}
        </div>
        <ul className="legend">
          {legend.map((l) => (
            <li key={l.label}>
              <i style={{ background: `var(${l.color})` }} />
              <span>{l.label}</span>
              {l.value != null && <b>{l.value}</b>}
            </li>
          ))}
        </ul>
      </header>
      {children}
    </section>
  );
}

export default memo(ChartCard);
