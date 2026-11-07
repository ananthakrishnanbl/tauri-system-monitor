import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [sysData, setData] = useState(null);

  useEffect(() => {
    console.log("STARTED");
    invoke("get_system_info").then((data) => {
      setData(data);
      console.log("RECEIVED", data);
    }).catch(console.error);

    return () => { console.log("OVER"); };
  }, []);

  if (!sysData) return <p>Loading...</p>;

  return (
    <div>
      <p><b>OS:</b> {sysData.os_name}</p>
      <p><b>Kernel:</b> {sysData.kernel_version}</p>
      <p><b>Version:</b> {sysData.os_version}</p>
      <p><b>CPU:</b> {sysData.cpu_brand} ({sysData.cpu_cores} cores)</p>

      <h3>Disks</h3>
      <ul>
        {sysData.disks.map((d) => (
          <li key={d.mount_point}>
            {d.mount_point} | {d.used_gb.toFixed(1)} / {d.total_gb.toFixed(1)} GB
          </li>
        ))}
      </ul>
    </div>
  );
}