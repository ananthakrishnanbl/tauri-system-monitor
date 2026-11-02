import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const HISTORY = 60;

const fin = (n) => (Number.isFinite(n) ? n : 0); // NaN/Infinity arrive as null over JSON
const fmtGb = (n) => fin(n).toFixed(2);
const fmtPct = (n) => fin(n).toFixed(1);
const fmtBytes = (b) => {
  if (!b) return "0 MB";
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
};
const level = (p) => (p >= 85 ? "high" : p >= 60 ? "mid" : "low");
const push = (arr, v) => [...arr.slice(-(HISTORY - 1)), v];

/* ---------- Charts (plain SVG, no gradients) ---------- */

function AreaChart({ data, max = 100, tone = "accent" }) {
  const W = 100;
  const H = 40;
  const pts = useMemo(() => {
    const padded = Array(Math.max(0, HISTORY - data.length))
      .fill(null)
      .concat(data);
    return padded.map((v, i) => {
      const x = (i / (HISTORY - 1)) * W;
      const y = v === null ? null : H - (Math.min(v, max) / max) * H;
      return [x, y];
    });
  }, [data, max]);

  const valid = pts.filter((p) => p[1] !== null);
  const line = valid.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const area =
    valid.length > 1
      ? `${valid[0][0]},${H} ${line} ${valid[valid.length - 1][0]},${H}`
      : "";

  return (
    <svg
      className={`chart tone-${tone}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="chart-grid" />
      ))}
      {area && <polygon points={area} className="chart-area" />}
      {line && (
        <polyline
          points={line}
          className="chart-line"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function Ring({ value, tone }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg className={`ring tone-${tone}`} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} className="ring-track" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="ring-value"
        strokeDasharray={c}
        strokeDashoffset={c - (v / 100) * c}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" className="ring-text">
        {Math.round(v)}%
      </text>
    </svg>
  );
}

function StatCard({ title, value, sub, percent, history, tone }) {
  return (
    <section className="card stat">
      <header className="card-head">
        <span className="card-title">{title}</span>
        <span className={`badge badge-${level(percent)}`}>{level(percent)}</span>
      </header>
      <div className="stat-body">
        <Ring value={percent} tone={tone} />
        <div className="stat-numbers">
          <div className="stat-value">{value}</div>
          <div className="stat-sub">{sub}</div>
        </div>
      </div>
      <AreaChart data={history} tone={tone} />
    </section>
  );
}

/* ---------- Window controls ---------- */

function TitleBar() {
  const win = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-name" data-tauri-drag-region>
        <span className="dot" />
        System Monitor
      </div>
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [ram, setRam] = useState({ used_gb: 0, total_gb: 0, percent: 0 });
  const [swap, setSwap] = useState({ used_gb: 0, total_gb: 0, percent: 0 });
  const [cpu, setCpu] = useState(0);
  const [procs, setProcs] = useState([]);
  const [info, setInfo] = useState(null);

  const [ramHist, setRamHist] = useState([]);
  const [swapHist, setSwapHist] = useState([]);
  const [cpuHist, setCpuHist] = useState([]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "memory", dir: "desc" });
  const [error, setError] = useState("");

  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    // Single stream: backend sends { ram, swap, proc, cpu } every tick.
    const channel = new Channel();
    channel.onmessage = (d) => {
      if (!alive.current || !d) return;

      const ramNext = {
        used_gb: fin(d.ram?.used_gb),
        total_gb: fin(d.ram?.total_gb),
        percent: fin(d.ram?.percent),
      };
      const swapNext = {
        used_gb: fin(d.swap?.used_gb),
        total_gb: fin(d.swap?.total_gb),
        percent: fin(d.swap?.percent),
      };
      const cpuNext = fin(d.cpu);

      setRam(ramNext);
      setSwap(swapNext);
      setCpu(cpuNext);
      setProcs(Array.isArray(d.proc) ? d.proc : []);

      setRamHist((h) => push(h, ramNext.percent));
      setSwapHist((h) => push(h, swapNext.percent));
      setCpuHist((h) => push(h, cpuNext));
    };

    invoke("stream_info", { onStream: channel }).catch((e) =>
      setError(`stream_info: ${e}`)
    );

    invoke("get_system_info")
      .then(setInfo)
      .catch((e) => setError(`get_system_info: ${e}`));

    return () => {
      alive.current = false;
      invoke("stop_stream");
    };
  }, []);

  const visibleProcs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = procs.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q)
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
    });
  }, [procs, query, sort]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );

  const arrow = (key) =>
    sort.key === key ? (sort.dir === "asc" ? " \u2191" : " \u2193") : "";

  const maxMem = Math.max(1, ...procs.map((p) => p.memory));

  return (
    <div className="window">
      <TitleBar />

      <main className="content">
        {error && <div className="error">{error}</div>}

        <div className="grid">
          <StatCard
            title="CPU"
            value={`${Math.round(cpu)}%`}
            sub={info ? `${info.cpu_cores} cores` : "Global usage"}
            percent={cpu}
            history={cpuHist}
            tone="blue"
          />
          <StatCard
            title="Memory"
            value={`${fmtGb(ram.used_gb)} GB`}
            sub={`of ${fmtGb(ram.total_gb)} GB`}
            percent={ram.percent}
            history={ramHist}
            tone="green"
          />
          <StatCard
            title="Swap"
            value={`${fmtGb(swap.used_gb)} GB`}
            sub={`of ${fmtGb(swap.total_gb)} GB`}
            percent={swap.percent}
            history={swapHist}
            tone="amber"
          />
          <section className="card sysinfo">
            <header className="card-head">
              <span className="card-title">System</span>
            </header>
            <dl>
              <div>
                <dt>OS</dt>
                <dd>{info?.sys_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{info?.os_v ?? "—"}</dd>
              </div>
              <div>
                <dt>Kernel</dt>
                <dd>{info?.kernel_v ?? "—"}</dd>
              </div>
              <div>
                <dt>Cores</dt>
                <dd>{info?.cpu_cores ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="card procs">
          <header className="card-head">
            <span className="card-title">
              Processes <span className="muted">· top {procs.length}</span>
            </span>
            <input
              className="search"
              placeholder="Search name or PID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </header>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort("pid")} className="w-pid">
                    PID{arrow("pid")}
                  </th>
                  <th onClick={() => toggleSort("name")}>Name{arrow("name")}</th>
                  <th onClick={() => toggleSort("cpu")} className="num w-cpu">
                    CPU{arrow("cpu")}
                  </th>
                  <th onClick={() => toggleSort("memory")} className="w-mem">
                    Memory{arrow("memory")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleProcs.map((p) => (
                  <tr key={p.pid}>
                    <td className="mono muted">{p.pid}</td>
                    <td className="name" title={p.name}>
                      {p.name}
                    </td>
                    <td className="num mono">{fmtPct(p.cpu)}%</td>
                    <td>
                      <div className="mem-cell">
                        <span className="mono">{fmtBytes(p.memory)}</span>
                        <div className="bar">
                          <div
                            className="bar-fill"
                            style={{ width: `${(p.memory / maxMem) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleProcs.length === 0 && (
                  <tr>
                    <td colSpan="4" className="empty">
                      {procs.length ? "No matching processes" : "Waiting for data…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}