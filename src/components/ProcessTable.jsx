import { memo, useMemo, useState } from "react";
import { fmtBytes } from "../utils/format";

const COLS = [
  { key: "name", label: "Name", num: false },
  { key: "pid", label: "PID", num: true },
  { key: "cpu", label: "CPU", num: true },
  { key: "mem_usage", label: "Memory", num: true },
];

const Row = memo(function Row({ p, maxMem }) {
  return (
    <tr>
      <td className="proc-name" title={p.name}>{p.name}</td>
      <td className="num muted">{p.pid}</td>
      <td className="num">{p.cpu.toFixed(1)}%</td>
      <td className="num mem-cell">
        <span className="mem-bar" style={{ width: `${(p.mem_usage / maxMem) * 100}%` }} />
        <span className="mem-text">{fmtBytes(p.mem_usage)}</span>
      </td>
    </tr>
  );
});

/** `cores` normalises per-process CPU (which can exceed 100%) to a 0–100% scale. */
function ProcessTable({ procs, cores = 1 }) {
  const [sort, setSort] = useState({ key: "mem_usage", dir: "desc" });
  const [query, setQuery] = useState("");

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

  const maxMem = useMemo(() => Math.max(1, ...procs.map((p) => p.mem_usage)), [procs]);

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
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Row key={p.pid} p={p} maxMem={maxMem} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted empty">
                  {procs.length ? "No matches." : "Waiting for data…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(ProcessTable);
