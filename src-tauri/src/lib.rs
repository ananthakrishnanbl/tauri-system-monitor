use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System, ProcessRefreshKind, Disks, Networks};
use tauri::{ipc::Channel, Manager, State};
use tokio::{sync::Mutex, time::sleep};
use serde::{Serialize,Deserialize};
use std::sync::atomic::{AtomicBool,Ordering};

struct AppState {
    sys: Mutex<System>,
    net: Mutex<Networks>,
    running: AtomicBool
}

#[derive(Serialize)]
struct MemUsage{
    used_gb: f32,
    total_gb: f32,
    percent: f32,
}

#[derive(Serialize)]
struct SysInfo {
    os_name: String,
    kernel_version: String,
    os_version: String,
    cpu_brand: String,
    cpu_cores: usize,
    disks: Vec<DiskInfo>,
}

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    mount_point: String,
    total_gb: f32,
    available_gb: f32,
    used_gb: f32,
}

#[derive(Serialize)]
struct ProcInfo{
    pid: u32,
    name: String,
    mem_usage: u64,
    cpu_usage: f32,
}

#[derive(Serialize)]
struct NetInfo{
    total_received: u64,
    total_sent: u64,
    download_speed: f64,
    upload_speed: f64,
}

fn to_gb(bytes: u64)->f32{
    ((bytes as f64)/(1024.0*1024.0*1024.0)) as f32
}

fn get_disk_info() -> Vec<DiskInfo>{
    let disk=Disks::new_with_refreshed_list().unwrap();
    let disk_data: Vec<DiskInfo> = disk.iter()
    .map(
        |d| DiskInfo{
            name: d.name().to_string_lossy().into_owned(),
            mount_point: d.mount_point().to_string_lossy().into_owned(),
            total_gb: to_gb(d.total_space()),
            available_gb: to_gb(d.available_space()),
            used_gb: to_gb(d.total_space() - d.available_space()),
        }
    )
    .collect();
    disk_data
}

fn get_proc_info(
    sys: &System
)-> Vec<ProcInfo> {
    let mut proc: Vec<ProcInfo>=sys.processes()
    .iter()
    .map(
        |(pid,p)| ProcInfo{
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            mem_usage: p.memory(),
            cpu_usage: p.cpu_usage(),
        }
    )
    .collect();
    proc.sort_by_key(|p| std::cmp::Reverse(p.mem_usage));
    proc.truncate(50);
    proc
}

fn get_ram_usage(
    sys: &System
)-> MemUsage{
    let used=to_gb(sys.used_memory() as u64);
    let total=to_gb(sys.total_memory() as u64);
    MemUsage{
        used_gb: used,
        total_gb: total,
        percent: if total==0.0 {0.0} else {used/total * 100.0},
    }
}

fn get_swap_usage(
    sys: &System
) -> MemUsage{
    let used=to_gb(sys.used_swap() as u64);
    let total=to_gb(sys.total_swap() as u64);
    MemUsage{
        used_gb: used,
        total_gb: total,
        percent: if total==0.0 {0.0} else {used/total * 100.0},
    }
}

fn get_net_info(
    net: &Networks
) -> NetInfo{
    let (mut total_rx, mut total_tx, mut rx, mut tx) = (0, 0, 0, 0);
    for (name, data) in net.iter() {
        if name == "lo" {
            continue;
        }
        total_rx += data.total_received();
        total_tx += data.total_transmitted();
        rx += data.received();
        tx += data.transmitted();
    }

    let secs = 1.0;
    NetInfo{
        total_received: total_rx,
        total_sent: total_tx,
        download_speed: rx as f64 / secs,
        upload_speed: tx as f64 / secs,
    }
}


#[tauri::command]
async fn get_system_info(
    state: State<'_,AppState>
)-> Result<SysInfo,String>{
    let sys=state.sys.lock().await;
    Ok(
    SysInfo{
        os_name: System::name().unwrap_or_else(|_|"unknown".into()),
        kernel_version: System::kernel_version().unwrap_or_else(|_| "unknown".into()),
        os_version: System::os_version().unwrap_or_else(|_| "unknown".into()),
        cpu_brand:sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "unknown".into()),
        cpu_cores:sys.cpus().len(),
        disks: get_disk_info(),
    })
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mut sys = System::new_all().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            let mut net = Networks::new_with_refreshed_list().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            sys.refresh_cpu_usage();
            sys.refresh_processes(ProcessesToUpdate::All, true);
            app.manage(AppState {
                sys: Mutex::new(sys),
                net: Mutex::new(net),
                running: AtomicBool::new(false),
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}