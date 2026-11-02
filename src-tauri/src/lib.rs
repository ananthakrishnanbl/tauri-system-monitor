use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{ipc::Channel, Manager, State};
use tokio::{sync::Mutex, time::sleep};
use serde::{Serialize,Deserialize};

struct AppState {
    sys: Mutex<System>,
}

#[derive(Serialize,Deserialize)]
struct MemUsage{
    used_gb: f32,
    total_gb: f32,
    percent: f32
}


#[derive(Serialize, Clone, Deserialize)]
struct ProcInfo{
    pid: u32,
    name: String,
    memory: u64, // bytes (RSS)
    cpu: f32,
}

#[derive(Serialize,Deserialize)]
struct SystemInfo{
    sys_name: String,
    kernel_v :String,
    os_v : String,
    cpu_cores: i32
}

#[derive(Serialize,Deserialize)]
struct Info{
    ram: MemUsage,
    swap: MemUsage,
    proc: Vec<ProcInfo>,
    cpu: i32
}

fn snapshot(sys: &System) -> Vec<ProcInfo> {
    let mut v: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .filter(|(_, p)| p.thread_kind().is_none()) 
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            memory: p.memory(),
            cpu: p.cpu_usage(),
        })
        .collect();
    v.sort_by_key(|p| std::cmp::Reverse(p.memory));
    v.truncate(50); // don't ship 500 processes every tick
    v
}

#[tauri::command]
async fn get_system_info(
    state: State<'_, AppState>
) -> Result<SystemInfo, String> {
    let sys = state.sys.lock().await;
    Ok(SystemInfo {
        sys_name: System::name().unwrap_or_else(|_| "unknown".into()),
        kernel_v: System::kernel_version().unwrap_or_else(|_| "unknown".into()),
        os_v: System::os_version().unwrap_or_else(|_| "unknown".into()),
        cpu_cores: sys.cpus().len() as i32,
    })
}

fn to_gb(bytes: f32)->f32{
    bytes/(1024.0 * 1024.0 * 1024.0)
}

#[tauri::command]
async fn stream_info(
    state: State<'_,AppState>,
    on_stream: Channel<Info>
) -> Result<(),String> {
    loop{
        let payload={
            let mut sys=state.sys.lock().await;
            sys.refresh_memory();
            sys.refresh_cpu_usage();
            sys.refresh_processes(ProcessesToUpdate::All, true);
            let v: Vec<ProcInfo>=snapshot(&sys);
            let u1=sys.used_memory();
            let t1=sys.total_memory();
            let u2=sys.used_swap();
            let t2=sys.total_swap();
            Info{
                ram: MemUsage{
                    used_gb: to_gb(u1 as f32),
                    total_gb: to_gb(t1 as f32),
                    percent: if t1==0 { 0.0 } else { u1 as f32 / t1 as f32 * 100.0 }
                },
                swap: MemUsage{
                    used_gb: to_gb(u2 as f32),
                    total_gb: to_gb(t2 as f32),
                    percent: if t2==0 { 0.0 } else { u2 as f32 / t2 as f32 * 100.0 }
                },
                proc: v,
                cpu: sys.global_cpu_usage() as i32
            }
        };
        if on_stream.send(payload).is_err() {
            break;
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mut sys = System::new_all().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            sys.refresh_cpu_usage();
            sys.refresh_processes(ProcessesToUpdate::All, true);
            app.manage(AppState { sys: Mutex::new(sys) });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            stream_info, get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
