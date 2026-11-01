use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{ipc::Channel, Manager, State};
use tokio::{sync::Mutex, time::sleep};
use serde::{Serialize,Deserialize};

struct AppState {
    sys: Mutex<System>,
}

#[derive(Serialize,Deserialize)]
struct ram_usage{
    used_gb: f32,
    total_gb: f32,
    percent: f32
}

#[derive(Serialize,Deserialize)]
struct swap_usage{
    used_gb: f32,
    total_gb: f32,
    percent: f32
}

#[derive(Serialize, Clone)]
struct proc_info {
    pid: u32,
    name: String,
    memory: u64, // bytes (RSS)
    cpu: f32,
}

#[derive(Serialize,Deserialize)]
struct system_info{
    sys_name: String,
    kernel_v :String,
    os_v : String,
    cpu_cores: i32
}

fn snapshot(sys: &System) -> Vec<proc_info> {
    let mut v: Vec<proc_info> = sys
        .processes()
        .iter()
        .filter(|(_, p)| p.thread_kind().is_none()) 
        .map(|(pid, p)| proc_info {
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
async fn stream_ram_usage(
    state: State<'_,AppState>,
    on_ram_usage:Channel<ram_usage>
)->Result<(),String>{
    loop{
        let payload={
            let mut sys=state.sys.lock().await;
            sys.refresh_memory();
            let used = sys.used_memory();
            let total = sys.total_memory();
            ram_usage{
                used_gb: (used as f32)/1024.0/1024.0/1024.0,
                total_gb: (total as f32)/1024.0/1024.0/1024.0,
                percent: used as f32/total as f32 * 100.0,
            }
        };

        if on_ram_usage.send(payload).is_err(){
            break;
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

#[tauri::command]
async fn stream_swap_usage(
    state: State<'_,AppState>,
    on_swap_usage:Channel<swap_usage>
)->Result<(),String>{
    loop{
        let payload={
            let mut sys=state.sys.lock().await;
            sys.refresh_memory();
            let used = sys.used_swap();
            let total = sys.total_swap();
            swap_usage{
                used_gb: (used as f32)/1024.0/1024.0/1024.0,
                total_gb: (total as f32)/1024.0/1024.0/1024.0,
                percent: used as f32/total as f32 * 100.0,
            }
        };

        if on_swap_usage.send(payload).is_err(){
            break;
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

#[tauri::command]
async fn stream_processes(
    state: State<'_,AppState>,
    on_proc_stream: Channel<Vec<proc_info>>
)->Result<(),String> {
    loop{
        let proc: Vec<proc_info>={
            let mut sys=state.sys.lock().await;
            sys.refresh_processes(ProcessesToUpdate::All, true);
            snapshot(&sys)
        };
        if on_proc_stream.send(proc).is_err(){
            break;
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

#[tauri::command]
async fn get_system_info(
    state: State<'_, AppState>
) -> Result<system_info, String> {
    let sys = state.sys.lock().await;
    Ok(system_info {
        sys_name: System::name().unwrap_or_else(|_| "unknown".into()),
        kernel_v: System::kernel_version().unwrap_or_else(|_| "unknown".into()),
        os_v: System::os_version().unwrap_or_else(|_| "unknown".into()),
        cpu_cores: sys.cpus().len() as i32,
    })
}

#[tauri::command]
async fn stream_cpu_usage(
    state: State<'_,AppState>,
    on_cpu_usage: Channel<i32>
) -> Result<(),String>{
    loop{
        let payload={
            let mut sys=state.sys.lock().await;
            sys.refresh_cpu_usage();
            sys.global_cpu_usage() as i32
        };

        if on_cpu_usage.send(payload).is_err(){
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
            let sys = System::new_all().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            app.manage(AppState { sys: Mutex::new(sys) });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            stream_ram_usage,stream_swap_usage,stream_processes,stream_cpu_usage,get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
