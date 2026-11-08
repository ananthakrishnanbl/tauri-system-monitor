import { memo } from "react";

function Row({ k, v }) {
  return (
    <div className="kv">
      <dt>{k}</dt>
      <dd title={v}>{v}</dd>
    </div>
  );
}

function SystemInfoCard({ info, error }) {
  return (
    <section className="card">
      <h2>System</h2>
      {error && <p className="muted">Could not load: {error}</p>}
      {!info && !error && <p className="muted">Loading…</p>}
      {info && (
        <dl>
          <Row k="OS" v={`${info.os_name} ${info.os_version}`} />
          <Row k="Kernel" v={info.kernel_version} />
          <Row k="CPU" v={info.cpu_brand} />
          <Row k="Cores" v={String(info.cpu_cores)} />
        </dl>
      )}
    </section>
  );
}

export default memo(SystemInfoCard);
