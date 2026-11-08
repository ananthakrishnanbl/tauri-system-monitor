import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Kill flow:
 *   1. choose  -> pick "Ask it to quit" (SIGTERM) or "Force quit" (SIGKILL), then confirm
 *   2. waiting -> closes itself when the PID leaves the process list;
 *                 if it is still there after the next update, say so and
 *                 (after a polite attempt) offer to escalate to force.
 * The backend decides what is protected; its error text is shown as-is.
 */
export default function KillDialog({ target, procs, onClose }) {
  const ref = useRef(null);
  const procsRef = useRef(procs);
  const sentAtRef = useRef(null); // the procs snapshot at the moment we sent

  const [mode, setMode] = useState("graceful"); // graceful | force (selected / last sent)
  const [phase, setPhase] = useState("choose"); // choose | waiting
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  procsRef.current = procs;
  const alive = procs.some((p) => p.pid === target.pid);
  // true once a fresh process update arrived after sending and the PID is still listed
  const stillRunning = phase === "waiting" && alive && procs !== sentAtRef.current;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (phase === "waiting" && !alive) onClose();
  }, [phase, alive, onClose]);

  const send = useCallback(
    async (force) => {
      setBusy(true);
      setError(null);
      try {
        await invoke("pkill_process", { pid: target.pid, force });
        sentAtRef.current = procsRef.current;
        setMode(force ? "force" : "graceful");
        setPhase("waiting");
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [target.pid]
  );

  const isForce = mode === "force";

  return (
    <dialog ref={ref} onClose={onClose} className="dialog">
      <h3>{phase === "choose" ? "End process" : stillRunning ? "Still running" : "Waiting for exit…"}</h3>
      <p className="dialog-target">
        {target.name} <span className="muted">PID {target.pid}</span>
      </p>

      {phase === "choose" && (
        <fieldset className="options">
          <legend className="sr-only">How should it be ended?</legend>
          <label className="option">
            <input
              type="radio"
              name="kill-mode"
              checked={mode === "graceful"}
              onChange={() => setMode("graceful")}
            />
            <div>
              <b>Ask it to quit</b>
              <span>Lets the app save and close cleanly. It may ignore the request.</span>
            </div>
          </label>
          <label className="option danger">
            <input
              type="radio"
              name="kill-mode"
              checked={mode === "force"}
              onChange={() => setMode("force")}
            />
            <div>
              <b>Force quit</b>
              <span>Stops it immediately. Unsaved work is lost.</span>
            </div>
          </label>
        </fieldset>
      )}

      {phase === "waiting" && (
        <p className="muted">
          {!stillRunning
            ? "Request sent. Checking whether it exited…"
            : isForce
            ? "It is still listed after a force quit. It may belong to another user or be protected by the system; try running this app with higher permissions."
            : "It did not exit. You can force it to stop (unsaved work is lost)."}
        </p>
      )}

      {error && <p className="dialog-error" role="alert">{error}</p>}

      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          {phase === "choose" ? "Cancel" : "Close"}
        </button>
        {phase === "choose" && (
          <button
            className={`btn ${isForce ? "btn-danger" : ""}`}
            disabled={busy}
            onClick={() => send(isForce)}
          >
            {isForce ? "Force quit" : "End process"}
          </button>
        )}
        {phase === "waiting" && !isForce && (
          <button className="btn btn-danger" disabled={busy} onClick={() => send(true)}>
            Force quit
          </button>
        )}
      </div>
    </dialog>
  );
}