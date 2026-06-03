use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Schedule {
    #[serde(rename = "interval")]
    Interval { seconds: u64 },
    #[serde(rename = "cron")]
    Cron { expression: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Automation {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub schedule: Schedule,
    pub agent_slug: Option<String>,
    pub enabled: bool,
    pub last_run: Option<String>,
}

pub struct AutomationEngine {
    pub automations: Vec<Automation>,
    pub timer: Option<tokio::sync::watch::Receiver<bool>>,
    stop_tx: Option<tokio::sync::watch::Sender<bool>>,
    file_path: PathBuf,
}

impl Default for AutomationEngine {
    fn default() -> Self {
        Self {
            automations: vec![],
            timer: None,
            stop_tx: None,
            file_path: PathBuf::from("automations.json"),
        }
    }
}

impl AutomationEngine {
    pub fn new(file_path: PathBuf) -> Self {
        Self {
            automations: vec![],
            timer: None,
            stop_tx: None,
            file_path,
        }
    }

    pub fn load(path: &PathBuf) -> Result<Self, String> {
        let engine = if path.exists() {
            let content =
                fs::read_to_string(path).map_err(|e| format!("failed to read automations: {e}"))?;
            let automations: Vec<Automation> = serde_json::from_str(&content)
                .map_err(|e| format!("failed to parse automations: {e}"))?;
            Self {
                automations,
                timer: None,
                stop_tx: None,
                file_path: path.clone(),
            }
        } else {
            Self::new(path.clone())
        };
        Ok(engine)
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create automations dir: {e}"))?;
        }
        let content = serde_json::to_string_pretty(&self.automations)
            .map_err(|e| format!("failed to serialize automations: {e}"))?;
        fs::write(&self.file_path, content)
            .map_err(|e| format!("failed to write automations: {e}"))
    }

    pub fn add(&mut self, automation: Automation) {
        self.automations.push(automation);
        let _ = self.save();
    }

    pub fn remove(&mut self, id: &str) {
        self.automations.retain(|a| a.id != id);
        let _ = self.save();
    }

    pub fn update(&mut self, automation: Automation) {
        if let Some(existing) = self.automations.iter_mut().find(|a| a.id == automation.id) {
            *existing = automation;
        }
        let _ = self.save();
    }

    pub fn start(&mut self) {
        let (tx, rx) = tokio::sync::watch::channel(false);
        self.stop_tx = Some(tx);
        self.timer = Some(rx);
        log::info!("Automation engine: started");
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(true);
        }
        self.timer = None;
        log::info!("Automation engine: stopped");
    }

    pub fn tick(&mut self) {
        let now = chrono_now_rfc3339();
        for automation in &mut self.automations {
            if !automation.enabled {
                continue;
            }
            let should_run = match &automation.schedule {
                Schedule::Interval { seconds } => {
                    let due = match &automation.last_run {
                        Some(last) => {
                            let last_secs = parse_rfc3339_secs(last).unwrap_or(0);
                            let now_secs = parse_rfc3339_secs(&now).unwrap_or(0);
                            now_secs >= last_secs + *seconds
                        }
                        None => true,
                    };
                    due
                }
                Schedule::Cron { expression: _ } => {
                    false
                }
            };
            if should_run {
                log::info!(
                    "Automation engine: running '{}' (id={})",
                    automation.name,
                    automation.id
                );
                automation.last_run = Some(now.clone());
            }
        }
        let _ = self.save();
    }
}

fn chrono_now_rfc3339() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let nanos = duration.subsec_nanos();
    let datetime = chrono_datetime_from_unix(secs, nanos);
    format_datetime_rfc3339(datetime)
}

type ChronoDatetime = (i32, u32, u32, u32, u32, u32, u32);

fn chrono_datetime_from_unix(secs: u64, _nanos: u32) -> ChronoDatetime {
    let mut s = secs as i64;
    let days = s / 86400;
    s %= 86400;
    let h = (s / 3600) as u32;
    s %= 3600;
    let m = (s / 60) as u32;
    let sec = (s % 60) as u32;

    let mut y = 1970i32;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let months_days: [i64; 12] = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut mo = 0u32;
    for (i, &md) in months_days.iter().enumerate() {
        if remaining < md {
            mo = (i + 1) as u32;
            break;
        }
        remaining -= md;
    }
    let d = (remaining + 1) as u32;
    (y, mo, d, h, m, sec, 0)
}

fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn format_datetime_rfc3339(dt: ChronoDatetime) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        dt.0, dt.1, dt.2, dt.3, dt.4, dt.5
    )
}

fn parse_rfc3339_secs(s: &str) -> Option<u64> {
    if s.len() < 20 {
        return None;
    }
    let year: i32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: u32 = s[11..13].parse().ok()?;
    let min: u32 = s[14..16].parse().ok()?;
    let sec: u32 = s[17..19].parse().ok()?;

    let days_from_epoch = days_before_year(year) + days_before_month(year, month) + day as i64 - 1;
    let total_secs = days_from_epoch * 86400 + hour as i64 * 3600 + min as i64 * 60 + sec as i64;
    Some(total_secs as u64)
}

fn days_before_year(year: i32) -> i64 {
    let y = year as i64 - 1;
    y * 365 + y / 4 - y / 100 + y / 400
}

fn days_before_month(year: i32, month: u32) -> i64 {
    let months_days: [i64; 12] = if is_leap(year) {
        [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
    } else {
        [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    };
    months_days[(month as usize).saturating_sub(1)]
}
