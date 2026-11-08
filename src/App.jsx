import { useMemo } from "react";
import { useSystemStream } from "./hooks/useSystemStream";
import { useSystemInfo } from "./hooks/useSystemInfo";
import Header from "./components/Header";
import StatTile from "./components/StatTile";
import ChartCard from "./components/ChartCard";
import AreaChart from "./components/AreaChart";
import SystemInfoCard from "./components/SystemInfoCard";
import DiskList from "./components/DiskList";
import ProcessTable from "./components/ProcessTable";
import { fmtBytes, fmtGb, fmtPct, fmtRate, niceCeilBytes } from "./utils/format";

const pctAxis = (v) => `${Math.round(v)}%`;
const rateAxis = (v) => fmtRate(v, 0);

export default function App() {
  const { status, error, fast, procs, history, start, stop } = useSystemStream();
  const { info, error: infoError } = useSystemInfo();

  const cpu = fast?.cpu_usage ?? 0;
  const ram = fast?.ram_usage;
  const swap = fast?.swap_usage;
  const net = fast?.net_info;

  // Two-tone palette: accent for the primary series, muted grey for the secondary.
  const cpuSeries = useMemo(
    () => [{ label: "CPU", color: "--accent", data: history.cpu }],
    [history.cpu]
  );
  const memSeries = useMemo(
    () => [
      { label: "RAM", color: "--accent", data: history.ram },
      { label: "Swap", color: "--muted", data: history.swap },
    ],
    [history.ram, history.swap]
  );
  const netSeries = useMemo(
    () => [
      { label: "Down", color: "--accent", data: history.down },
      { label: "Up", color: "--muted", data: history.up },
    ],
    [history.down, history.up]
  );

  return (
    <div className="app">
      <Header status={status} onStart={start} onStop={stop} />

      {status === "error" && (
        <div className="banner" role="alert">
          Stream failed: {error}
          <button className="btn" onClick={start}>Retry</button>
        </div>
      )}

      <div className="tiles">
        <StatTile
          label="CPU"
          value={fmtPct(cpu)}
          sub={info ? `${info.cpu_cores} cores` : "—"}
          percent={cpu}
        />
        <StatTile
          label="Memory"
          value={fmtPct(ram?.percent)}
          sub={ram ? `${fmtGb(ram.used_gb)} of ${fmtGb(ram.total_gb)}` : "—"}
          percent={ram?.percent}
        />
        <StatTile
          label="Swap"
          value={fmtPct(swap?.percent)}
          sub={swap ? (swap.total_gb ? `${fmtGb(swap.used_gb)} of ${fmtGb(swap.total_gb)}` : "Not configured") : "—"}
          percent={swap?.percent}
        />
        <StatTile
          label="Network"
          value={`↓ ${fmtRate(net?.download_speed ?? 0)}`}
          sub={`↑ ${fmtRate(net?.upload_speed ?? 0)}`}
        />
      </div>

      <div className="grid-2">
        <ChartCard title="CPU" legend={[{ label: "Total", color: "--accent" }]}>
          <AreaChart series={cpuSeries} yMax={100} formatY={pctAxis} formatTip={fmtPct} label="CPU usage over the last minute" />
        </ChartCard>

        <ChartCard
          title="Memory"
          legend={[
            { label: "RAM", color: "--accent", value: fmtPct(ram?.percent, 0) },
            { label: "Swap", color: "--muted", value: fmtPct(swap?.percent, 0) },
          ]}
        >
          <AreaChart series={memSeries} yMax={100} formatY={pctAxis} formatTip={fmtPct} label="Memory usage over the last minute" />
        </ChartCard>
      </div>

      <ChartCard
        title="Network"
        headline={net ? `${fmtBytes(net.total_received)} received · ${fmtBytes(net.total_sent)} sent` : null}
        legend={[
          { label: "Down", color: "--accent", value: fmtRate(net?.download_speed ?? 0) },
          { label: "Up", color: "--muted", value: fmtRate(net?.upload_speed ?? 0) },
        ]}
      >
        <AreaChart
          series={netSeries}
          niceFn={niceCeilBytes}
          formatY={rateAxis}
          formatTip={fmtRate}
          label="Network throughput over the last minute"
        />
      </ChartCard>

      <div className="grid-2">
        <SystemInfoCard info={info} error={infoError} />
        <DiskList disks={info?.disks} />
      </div>

      <ProcessTable procs={procs} cores={info?.cpu_cores} />
    </div>
  );
}
