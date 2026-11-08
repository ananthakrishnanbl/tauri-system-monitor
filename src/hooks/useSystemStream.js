import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";

export const HISTORY = 60; // seconds of history kept for the charts

const blank = () => new Array(HISTORY).fill(null);
const push = (arr, v) => {
  const next = arr.slice(1);
  next.push(v);
  return next;
};

const initial = {
  status: "connecting", // connecting | live | stopped | error
  error: null,
  fast: null,
  procs: [],
  history: { cpu: blank(), ram: blank(), swap: blank(), down: blank(), up: blank() },
};

/**
 * Starts the Rust stream, keeps rolling history for charts, and cleans up on unmount.
 * Stale channels are ignored so a restart can never double-feed the UI.
 */
export function useSystemStream() {
  const [state, setState] = useState(initial);
  const tokenRef = useRef(null); // identifies the active stream
  const loopRef = useRef(Promise.resolve()); // resolves when the Rust loop has exited

  const apply = useCallback((msg) => {
    if (msg.type === "Fast") {
      setState((s) => ({
        ...s,
        status: "live",
        error: null,
        fast: msg,
        history: {
          cpu: push(s.history.cpu, msg.cpu_usage),
          ram: push(s.history.ram, msg.ram_usage.percent),
          swap: push(s.history.swap, msg.swap_usage.percent),
          down: push(s.history.down, msg.net_info.download_speed),
          up: push(s.history.up, msg.net_info.upload_speed),
        },
      }));
    } else if (msg.type === "Slow") {
      setState((s) => ({ ...s, procs: msg.proc_data }));
    }
  }, []);

  const start = useCallback(async () => {
    const token = {};
    tokenRef.current = token;
    setState((s) => ({ ...s, status: "connecting", error: null }));

    // Wait for any previous Rust loop to exit before asking for a new one.
    await loopRef.current;
    if (tokenRef.current !== token) return;

    const channel = new Channel();
    channel.onmessage = (msg) => {
      if (tokenRef.current === token) apply(msg);
    };

    const run = invoke("stream_data", { streamChannel: channel });
    loopRef.current = run.catch(() => {});
    try {
      await run;
      if (tokenRef.current === token) setState((s) => ({ ...s, status: "stopped" }));
    } catch (e) {
      if (tokenRef.current === token) {
        setState((s) => ({ ...s, status: "error", error: String(e) }));
      }
    }
  }, [apply]);

  const stop = useCallback(async () => {
    tokenRef.current = null;
    setState((s) => ({ ...s, status: "stopped" }));
    try {
      await invoke("stream_stop");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    start();
    return () => {
      tokenRef.current = null;
      invoke("stream_stop").catch(() => {});
    };
  }, [start]);

  return { ...state, start, stop };
}
