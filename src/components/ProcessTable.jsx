import { memo, useCallback, useMemo, useState } from "react";
import { fmtBytes } from "../utils/format";
import KillDialog from "./KillDialog";

const COLS = [
  { key: "name", label: "Name", num: false },
  { key: "pid", label: "PID", num: true },
  { key: "cpu", label: "CPU", num: true },
  { key: "mem_usage", label: "Memory", num: true },
];

const Row = memo(function Row({ p, onKill }) {
  return (
    <tr>
      <td className="proc-name" title={p.name}>{p.name}</td>
      <td className="num muted">{p.pid}</td>
      <td className="num">{p.cpu.toFixed(1)}%</td>
      <td className="num">{fmtBytes(p.mem_usage)}</td>
      <td className="num">
        <button className="link-btn" onClick={() => onKill(p)} aria-label={`End ${p.name}`}>
          End
        </button>
      </td>
    </tr>
  );
});

/** `cores` normalises per-process CPU (which can exceed 100%) to a 0–100% scale. */
function ProcessTable({ procs, cores = 1 }) {
  const [sort, setSort] = useState({ key: "mem_usage", dir: "desc" });
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState(null);

  const closeDialog = useCallback(() => setTarget(null), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = procs
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q))
      .map((p) => ({ ...p, cpu: p.cpu_usage / Math.max(cores, 1) }));
    const { key, dir } = sort;
    const m = dir === "asc" ? 1 : -1;
    list.sort((a, b) =>
      key === "name" ? m * a.name.localeCompare(b.name) : m * (a[key] - b[key])
    );
    return list;
  }, [procs, cores, sort, query]);

  const toggle = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );

  return (
    <section className="card">
      <header className="card-head">
        <h2>Processes <span className="muted">· top {procs.length} by memory</span></h2>
        <input
          className="search"
          type="search"
          placeholder="Filter by name or PID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? "num" : ""}
                  aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort.key === c.key && <span>{sort.dir === "asc" ? " ▲" : " ▼"}</span>}
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Row key={p.pid} p={p} onKill={setTarget} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted empty">
                  {procs.length ? "No matches." : "Waiting for data…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {target && <KillDialog target={target} procs={procs} onClose={closeDialog} />}
    </section>
  );
}

export default memo(ProcessTable);
