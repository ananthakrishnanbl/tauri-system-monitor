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

#[derive(Serialize)]
struct FastData{
    ram_usage: MemUsage,
    swap_usage: MemUsage,
    net_info: NetInfo,
    cpu_usage: f32,
}

#[derive(Serialize)]
struct SlowData{
    proc_data: Vec<ProcInfo>,
}


#[derive(Serialize)]
#[serde(tag="type")]
enum StreamData{
    Fast(FastData),
    Slow(SlowData),
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
    .filter(|(_, p)| p.thread_kind().is_none())
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

#[tauri::command]
async fn stream_data(
    state: State<'_, AppState>,
    stream_channel: Channel<StreamData>,
) -> Result<String, String> {
    println!("RUNNING");

    if state.running.swap(true, Ordering::SeqCst) {
        return Err("Already Running".into());
    }

    let kind = ProcessRefreshKind::nothing().with_memory().with_cpu();
    let mut tick: u32 = 0;

    loop {
        if !state.running.load(Ordering::SeqCst) {
            println!("END RUNNING");
            break;
        }

        // --- fast part: sys + net, each locked briefly ---
        let fast = {
            let mut sys = state.sys.lock().await;
            sys.refresh_memory();
            sys.refresh_cpu_usage();

            let ram = get_ram_usage(&sys);
            let swap = get_swap_usage(&sys);
            let cpu = sys.global_cpu_usage();
            (ram, swap, cpu)
        };

        let net_info = {
            let mut net = state.net.lock().await;
            net.refresh(true);
            get_net_info(&net)
        };

        let slow = if tick % 4 == 0 {
            let mut sys = state.sys.lock().await;
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
            Some(SlowData { proc_data: get_proc_info(&sys) })
        } else {
            None
        };

        if let Some(slow) = slow {
            if stream_channel.send(StreamData::Slow(slow)).is_err() {
                break;
            }
        }

        let fast_payload = StreamData::Fast(FastData {
            ram_usage: fast.0,
            swap_usage: fast.1,
            net_info,
            cpu_usage: fast.2,
        });

        if stream_channel.send(fast_payload).is_err() {
            break;
        }

        tick = tick.wrapping_add(1);
        sleep(Duration::from_millis(1000)).await;
    }

    state.running.store(false, Ordering::SeqCst);
    Ok("Finished".into())
}

#[tauri::command]
async fn stream_stop(
    state: State<'_,AppState>
) -> Result<(),()>{
    state.running.store(false, Ordering::SeqCst);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mut sys = System::new_all().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            let mut net = Networks::new_with_refreshed_list().map_err(|e| format!("sysinfo init failed: {e:?}"))?;
            sys.refresh_cpu_usage();
            sys.refresh_processes(ProcessesToUpdate::All, true);
            net.refresh(true);
            app.manage(AppState {
                sys: Mutex::new(sys),
                net: Mutex::new(net),
                running: AtomicBool::new(false),
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,stream_stop,stream_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}