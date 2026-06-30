use crate::config::WakeWordConfig;

/// Energy-based wake word detector.
///
/// **Known limitation**: This detector uses audio energy levels only — it does NOT
/// perform actual speech recognition. Any loud sound above the threshold will trigger
/// the wake word. The `phrase` config field is stored for display purposes but is not
/// compared against recognized speech. A production implementation should integrate
/// a proper wake word engine (e.g., Porcupine, Picovoice, or onnx-based model).
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
