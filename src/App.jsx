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

  // Series arrays only change identity when history changes.
  const cpuSeries = useMemo(
    () => [{ label: "CPU", color: "--blue", data: history.cpu }],
    [history.cpu]
  );
  const memSeries = useMemo(
    () => [
      { label: "RAM", color: "--green", data: history.ram },
      { label: "Swap", color: "--amber", data: history.swap, fill: false },
    ],
    [history.ram, history.swap]
  );
  const netSeries = useMemo(
    () => [
      { label: "Download", color: "--violet", data: history.down },
      { label: "Upload", color: "--orange", data: history.up },
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
          color="--blue"
        />
        <StatTile
          label="Memory"
          value={fmtPct(ram?.percent)}
          sub={ram ? `${fmtGb(ram.used_gb)} of ${fmtGb(ram.total_gb)}` : "—"}
          percent={ram?.percent}
          color="--green"
        />
        <StatTile
          label="Swap"
          value={fmtPct(swap?.percent)}
          sub={swap ? (swap.total_gb ? `${fmtGb(swap.used_gb)} of ${fmtGb(swap.total_gb)}` : "Not configured") : "—"}
          percent={swap?.percent}
          color="--amber"
        />
        <StatTile
          label="Network"
          value={`↓ ${fmtRate(net?.download_speed ?? 0)}`}
          sub={`↑ ${fmtRate(net?.upload_speed ?? 0)}`}
        />
      </div>

      <div className="grid-2">
        <ChartCard
          title="CPU usage"
          headline={fmtPct(cpu)}
          legend={[{ label: "Total", color: "--blue" }]}
        >
          <AreaChart series={cpuSeries} yMax={100} formatY={pctAxis} formatTip={fmtPct} label="CPU usage over the last minute" />
        </ChartCard>

        <ChartCard
          title="Memory"
          headline={ram ? `${fmtGb(ram.used_gb)} used` : "—"}
          legend={[
            { label: "RAM", color: "--green", value: fmtPct(ram?.percent, 0) },
            { label: "Swap", color: "--amber", value: fmtPct(swap?.percent, 0) },
          ]}
        >
          <AreaChart series={memSeries} yMax={100} formatY={pctAxis} formatTip={fmtPct} label="Memory usage over the last minute" />
        </ChartCard>
      </div>

      <ChartCard
        title="Network"
        headline={net ? `${fmtBytes(net.total_received)} received · ${fmtBytes(net.total_sent)} sent` : "—"}
        legend={[
          { label: "Download", color: "--violet", value: fmtRate(net?.download_speed ?? 0) },
          { label: "Upload", color: "--orange", value: fmtRate(net?.upload_speed ?? 0) },
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
