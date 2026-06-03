use crate::config::WakeWordConfig;

pub struct WakeWordDetector {
    pub config: WakeWordConfig,
    pub listening: bool,
    triggered: bool,
    cooldown: u32,
    hysteresis_samples: u32,
}

impl WakeWordDetector {
    pub fn new(config: WakeWordConfig) -> Self {
        Self {
            hysteresis_samples: 10,
            triggered: false,
            cooldown: 0,
            listening: false,
            config,
        }
    }

    pub fn detect(&mut self, audio_chunk: &[f32]) -> bool {
        if !self.listening {
            return false;
        }

        if self.cooldown > 0 {
            self.cooldown -= 1;
            return false;
        }

        let energy: f32 =
            audio_chunk.iter().map(|s| s * s).sum::<f32>() / audio_chunk.len() as f32;
        let threshold = 0.01 + (self.config.sensitivity * 0.19);
        let detected = energy > threshold;

        if detected {
            if !self.triggered {
                self.triggered = true;
                self.cooldown = self.hysteresis_samples;
                log::info!(
                    "Wake word detected (energy={:.4}, threshold={:.4})",
                    energy,
                    threshold
                );
                return true;
            }
        } else {
            self.triggered = false;
        }

        false
    }

    pub fn reset(&mut self) {
        self.triggered = false;
        self.cooldown = 0;
    }

    pub fn start_listening(&mut self) {
        self.listening = true;
        self.reset();
        log::info!(
            "Wake word detector: started listening for '{}'",
            self.config.phrase
        );
    }

    pub fn stop_listening(&mut self) {
        self.listening = false;
        self.reset();
        log::info!("Wake word detector: stopped listening");
    }

    pub fn is_triggered(&self) -> bool {
        self.triggered
    }
}
