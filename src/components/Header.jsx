import { memo } from "react";

const LABELS = {
  connecting: "Connecting",
  live: "Live",
  stopped: "Paused",
  error: "Error",
};

function Header({ status, onStart, onStop }) {
  const running = status === "live" || status === "connecting";
  return (
    <header className="topbar">
      <h1>System Monitor</h1>
      <div className="topbar-right">
        <span className={`pill pill-${status}`}>
          <i /> {LABELS[status]}
        </span>
        <button className="btn" onClick={running ? onStop : onStart}>
          {running ? "Pause" : "Resume"}
        </button>
      </div>
    </header>
  );
}

export default memo(Header);
