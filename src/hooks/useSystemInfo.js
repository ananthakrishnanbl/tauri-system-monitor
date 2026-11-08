import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** One-off static info (OS, CPU, disks). */
export function useSystemInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    invoke("get_system_info")
      .then((d) => alive && setInfo(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return { info, error };
}
