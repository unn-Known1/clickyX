use crate::config::WakeWordConfig;

pub struct WakeWordDetector {
    pub config: WakeWordConfig,
    pub listening: bool,
}

impl WakeWordDetector {
    pub fn new(config: WakeWordConfig) -> Self {
        Self {
            config,
            listening: false,
        }
    }

    pub fn detect(audio_chunk: &[f32]) -> bool {
        let energy: f32 = audio_chunk.iter().map(|s| s * s).sum::<f32>() / audio_chunk.len() as f32;
        energy > 0.05
    }

    pub fn start_listening(&mut self) {
        self.listening = true;
        log::info!("Wake word detector: started listening for '{}'", self.config.phrase);
    }

    pub fn stop_listening(&mut self) {
        self.listening = false;
        log::info!("Wake word detector: stopped listening");
    }
}
