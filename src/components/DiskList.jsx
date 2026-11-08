import { memo } from "react";
import { fmtGb } from "../utils/format";

function DiskList({ disks = [] }) {
  return (
    <section className="card">
      <h2>Disks</h2>
      {disks.length === 0 && <p className="muted">No disks reported.</p>}
      <ul className="disks">
        {disks.map((d) => {
          const pct = d.total_gb ? (d.used_gb / d.total_gb) * 100 : 0;
          const color = pct > 90 ? "--red" : pct > 75 ? "--amber" : "--blue";
          return (
            <li key={`${d.name}|${d.mount_point}`}>
              <div className="disk-top">
                <span className="disk-name" title={d.mount_point}>
                  {d.mount_point || d.name}
                </span>
                <span className="muted">
                  {fmtGb(d.used_gb, 0)} / {fmtGb(d.total_gb, 0)}
                </span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${pct}%`, background: `var(${color})` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(DiskList);
