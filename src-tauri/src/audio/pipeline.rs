use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::AudioConfig;
use crate::config::WakeWordConfig;

use super::capture::AudioCapture;
use super::stt::{self, SttConfig, SttProvider};
use super::tts::{self, TtsConfig, TtsProvider};
use super::wake_word::WakeWordDetector;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum PipelineState {
    Idle,
    Listening,
    WakeWordListening,
    Processing,
    Speaking,
}

impl Default for PipelineState {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevel {
    pub rms: f32,
    pub peak: f32,
    pub clipping: bool,
}

impl AudioLevel {
    pub fn zero() -> Self {
        Self {
            rms: 0.0,
            peak: 0.0,
            clipping: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VadState {
    Silence,
    Speech,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlwaysOnConfig {
    pub enabled: bool,
    pub vad_threshold: f32,
    pub silence_timeout_ms: u64,
    pub min_speech_ms: u64,
    pub sample_rate: u32,
    pub auto_submit: bool,
}

impl Default for AlwaysOnConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            vad_threshold: 0.008,
            silence_timeout_ms: 1500,
            min_speech_ms: 300,
            sample_rate: 16000,
            auto_submit: true,
        }
    }
}

pub struct VoicePipeline {
    capture: Arc<Mutex<AudioCapture>>,
    state: Arc<Mutex<PipelineState>>,
    stt_config: Arc<Mutex<SttConfig>>,
    tts_config: Arc<Mutex<TtsConfig>>,
    sample_rate: u32,
    wake_word_detector: Arc<Mutex<WakeWordDetector>>,
    wake_word_detected: Arc<AtomicBool>,
    always_on_running: Arc<AtomicBool>,
    always_on_config: Arc<Mutex<AlwaysOnConfig>>,
}

impl VoicePipeline {
    pub fn new() -> Self {
        let config = AudioConfig::default();
        Self {
            capture: Arc::new(Mutex::new(AudioCapture::new(
                config.sample_rate,
                config.buffer_size,
            ))),
            state: Arc::new(Mutex::new(PipelineState::Idle)),
            stt_config: Arc::new(Mutex::new(SttConfig::default())),
            tts_config: Arc::new(Mutex::new(TtsConfig::default())),
            sample_rate: config.sample_rate,
            wake_word_detector: Arc::new(Mutex::new(WakeWordDetector::new(
                WakeWordConfig::default(),
            ))),
            wake_word_detected: Arc::new(AtomicBool::new(false)),
            always_on_running: Arc::new(AtomicBool::new(false)),
            always_on_config: Arc::new(Mutex::new(AlwaysOnConfig::default())),
        }
    }

    pub fn with_config(config: &AudioConfig, stt: SttConfig, tts: TtsConfig) -> Self {
        let always_on = AlwaysOnConfig {
            enabled: config.activation_mode == "always_on",
            auto_submit: config.auto_submit,
            ..Default::default()
        };
        Self {
            capture: Arc::new(Mutex::new(AudioCapture::new(
                config.sample_rate,
                config.buffer_size,
            ))),
            state: Arc::new(Mutex::new(PipelineState::Idle)),
            stt_config: Arc::new(Mutex::new(stt)),
            tts_config: Arc::new(Mutex::new(tts)),
            sample_rate: config.sample_rate,
            wake_word_detector: Arc::new(Mutex::new(WakeWordDetector::new(
                WakeWordConfig::default(),
            ))),
            wake_word_detected: Arc::new(AtomicBool::new(false)),
            always_on_running: Arc::new(AtomicBool::new(false)),
            always_on_config: Arc::new(Mutex::new(always_on)),
        }
    }

    pub fn start_ptt(&self) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|e| format!("State lock error: {e}"))?;
        if *state != PipelineState::Idle && *state != PipelineState::WakeWordListening {
            return Err(format!("Pipeline is {:?}, cannot start recording", state));
        }

        let mut capture = self
            .capture
            .lock()
            .map_err(|e| format!("Capture lock error: {e}"))?;

        if *state == PipelineState::Idle {
            capture.start_recording()?;
        }
        // If WakeWordListening, capture is already recording

        *state = PipelineState::Listening;
        log::info!("Voice pipeline: started listening");
        Ok(())
    }

    pub fn stop_ptt_and_transcribe(&self) -> Result<String, String> {
        {
            let mut state = self
                .state
                .lock()
                .map_err(|e| format!("State lock error: {e}"))?;
            if *state != PipelineState::Listening {
                return Err(format!("Pipeline is {:?}, not listening", state));
            }
            *state = PipelineState::Processing;
        }

        let audio_data = {
            let mut capture = self
                .capture
                .lock()
                .map_err(|e| format!("Capture lock error: {e}"))?;
            capture.stop_recording()?
        };

        let stt_cfg = self
            .stt_config
            .lock()
            .map_err(|e| format!("STT config lock error: {e}"))?
            .clone();

        let rt = tokio::runtime::Handle::try_current()
            .map_err(|e| format!("No tokio runtime: {e}"))?;

        let sample_rate = self.sample_rate;
        let result = rt.block_on(async {
            stt::transcribe(&audio_data, &stt_cfg, sample_rate).await
        });

        match &result {
            Ok(_) => {
                log::info!("Voice pipeline: transcription complete");
            }
            Err(e) => {
                log::error!("Voice pipeline: transcription error: {e}");
            }
        }

        if let Ok(mut state) = self.state.lock() {
            *state = PipelineState::Idle;
        }
        result
    }

    pub fn speak_response(&self, text: &str) -> Result<Vec<u8>, String> {
        {
            let mut state = self
                .state
                .lock()
                .map_err(|e| format!("State lock error: {e}"))?;
            *state = PipelineState::Speaking;
        }

        let tts_cfg = self
            .tts_config
            .lock()
            .map_err(|e| format!("TTS config lock error: {e}"))?
            .clone();

        let rt = tokio::runtime::Handle::try_current()
            .map_err(|e| format!("No tokio runtime: {e}"))?;

        let text_owned = text.to_string();
        let result = rt.block_on(async { tts::speak(&text_owned, &tts_cfg).await });

        match &result {
            Ok(_) => {
                log::info!("Voice pipeline: speech synthesis complete");
            }
            Err(e) => {
                log::error!("Voice pipeline: speech synthesis error: {e}");
            }
        }

        if let Ok(mut state) = self.state.lock() {
            *state = PipelineState::Idle;
        }
        result
    }

    pub fn get_state(&self) -> Result<PipelineState, String> {
        self.state
            .lock()
            .map(|s| *s)
            .map_err(|e| format!("State lock error: {e}"))
    }

    pub fn get_audio_level(&self) -> AudioLevel {
        if let Ok(capture) = self.capture.lock() {
            if capture.is_recording() {
                return capture.audio_level();
            }
        }
        AudioLevel::zero()
    }

    pub fn start_wake_word(&self) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|e| format!("State lock error: {e}"))?;
        if *state != PipelineState::Idle {
            return Err(format!(
                "Pipeline is {:?}, cannot start wake word",
                state
            ));
        }

        let mut capture = self
            .capture
            .lock()
            .map_err(|e| format!("Capture lock error: {e}"))?;
        capture.start_recording()?;

        let mut detector = self
            .wake_word_detector
            .lock()
            .map_err(|e| format!("Detector lock error: {e}"))?;
        detector.start_listening();

        *state = PipelineState::WakeWordListening;
        self.wake_word_detected.store(false, Ordering::SeqCst);
        log::info!("Voice pipeline: wake word listening started");
        Ok(())
    }

    pub fn stop_wake_word(&self) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|e| format!("State lock error: {e}"))?;
        if *state != PipelineState::WakeWordListening {
            return Err(format!(
                "Pipeline is {:?}, not wake word listening",
                state
            ));
        }

        let data = {
            let mut capture = self
                .capture
                .lock()
                .map_err(|e| format!("Capture lock error: {e}"))?;
            capture.stop_recording()?
        };
        log::info!(
            "Wake word mode stopped, {} samples discarded",
            data.len()
        );

        let mut detector = self
            .wake_word_detector
            .lock()
            .map_err(|e| format!("Detector lock error: {e}"))?;
        detector.stop_listening();

        *state = PipelineState::Idle;
        Ok(())
    }

    pub fn check_wake_word(&self) -> Result<bool, String> {
        let state = *self
            .state
            .lock()
            .map_err(|e| format!("State lock error: {e}"))?;
        if state != PipelineState::WakeWordListening {
            return Ok(false);
        }

        let samples = {
            let capture = self
                .capture
                .lock()
                .map_err(|e| format!("Capture lock error: {e}"))?;
            if !capture.is_recording() {
                return Ok(false);
            }
            capture.get_buffer_samples()
        };

        if samples.len() < 160 {
            return Ok(false);
        }

        let mut detector = self
            .wake_word_detector
            .lock()
            .map_err(|e| format!("Detector lock error: {e}"))?;

        if detector.detect(&samples) {
            self.wake_word_detected.store(true, Ordering::SeqCst);
            // Auto-start full recording if activation mode is "voice"
            if detector.config.activation_mode == "voice" {
                drop(detector);
                let mut state = self
                    .state
                    .lock()
                    .map_err(|e| format!("State lock error: {e}"))?;
                *state = PipelineState::Listening;
                log::info!("Wake word: auto-started recording");
            }
            return Ok(true);
        }

        Ok(false)
    }

    pub fn wake_word_detected(&self) -> bool {
        self.wake_word_detected.load(Ordering::SeqCst)
    }

    pub fn consume_wake_word_detected(&self) -> bool {
        self.wake_word_detected.swap(false, Ordering::SeqCst)
    }

    pub fn start_always_on(&self) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|e| format!("State lock error: {e}"))?;
        if *state != PipelineState::Idle {
            return Err(format!("Pipeline is {:?}, cannot start always-on", state));
        }

        let mut capture = self
            .capture
            .lock()
            .map_err(|e| format!("Capture lock error: {e}"))?;
        capture.start_recording()?;
        *state = PipelineState::WakeWordListening;
        self.always_on_running.store(true, Ordering::SeqCst);
        log::info!("Voice pipeline: always-on listening started");
        Ok(())
    }

    pub fn stop_always_on(&self) -> Result<(), String> {
        self.always_on_running.store(false, Ordering::SeqCst);
        let audio_data = {
            let mut state = self
                .state
                .lock()
                .map_err(|e| format!("State lock error: {e}"))?;

            if *state == PipelineState::Idle {
                return Ok(());
            }

            *state = PipelineState::Idle;
            let mut capture = self
                .capture
                .lock()
                .map_err(|e| format!("Capture lock error: {e}"))?;
            if capture.is_recording() {
                capture.stop_recording()?
            } else {
                Vec::new()
            }
        };
        log::info!("Voice pipeline: always-on stopped, {} samples discarded", audio_data.len());
        Ok(())
    }

    pub fn is_always_on_running(&self) -> bool {
        self.always_on_running.load(Ordering::SeqCst)
    }

    pub fn run_always_on_vad_loop(
        &self,
        on_transcript: Box<dyn Fn(String) + Send + 'static>,
    ) -> Result<(), String> {
        let capture_arc = self.capture.clone();
        let state_arc = self.state.clone();
        let running = self.always_on_running.clone();
        let ao_config = self
            .always_on_config
            .lock()
            .map_err(|e| format!("AlwaysOn config lock: {e}"))?
            .clone();
        let stt_cfg = self.stt_config().unwrap_or_default();
        let sample_rate = self.sample_rate;

        let on_transcript = std::sync::Arc::new(std::sync::Mutex::new(on_transcript));
        std::thread::spawn(move || {
            let mut vad = VadState::Silence;
            let mut speech_start: Option<Instant> = None;
            let mut silence_start: Option<Instant> = None;
            let mut audio_buffer: Vec<f32> = Vec::new();

            log::info!("Always-on VAD loop started (threshold={}, silence_timeout={}ms)",
                ao_config.vad_threshold, ao_config.silence_timeout_ms);

            while running.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(50));

                let samples = {
                    if let Ok(capture) = capture_arc.lock() {
                        if capture.is_recording() {
                            capture.get_buffer_samples()
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                };

                if samples.is_empty() {
                    continue;
                }

                let energy: f32 = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
                let is_speech = energy > ao_config.vad_threshold;

                match (vad, is_speech) {
                    (VadState::Silence, true) => {
                        vad = VadState::Speech;
                        speech_start = Some(Instant::now());
                        silence_start = None;
                        audio_buffer.clear();
                        audio_buffer.extend_from_slice(&samples);
                        if let Ok(mut state) = state_arc.lock() {
                            if *state == PipelineState::WakeWordListening {
                                *state = PipelineState::Listening;
                                log::info!("VAD: speech detected, started Listening");
                            }
                        }
                    }
                    (VadState::Speech, true) => {
                        audio_buffer.extend_from_slice(&samples);
                        silence_start = None;
                    }
                    (VadState::Speech, false) => {
                        audio_buffer.extend_from_slice(&samples);
                        if silence_start.is_none() {
                            silence_start = Some(Instant::now());
                        } else if silence_start.unwrap().elapsed() >= Duration::from_millis(ao_config.silence_timeout_ms) {
                            if let Some(start) = speech_start {
                                if start.elapsed() >= Duration::from_millis(ao_config.min_speech_ms) {
                                    // Check if TTS is speaking — pause VAD during playback
                                    let is_speaking = state_arc.lock().map(|s| *s == PipelineState::Speaking).unwrap_or(false);
                                    if !is_speaking {
                                        let buffer_clone = audio_buffer.clone();
                                        let stt_cfg_clone = stt_cfg.clone();
                                        let on_tx = on_transcript.clone();

                                        if let Ok(rt) = tokio::runtime::Handle::try_current() {
                                            let _ = rt.spawn(async move {
                                                let result = stt::transcribe(&buffer_clone, &stt_cfg_clone, sample_rate).await;
                                                match result {
                                                    Ok(text) if !text.trim().is_empty() => {
                                                        log::info!("VAD auto-transcribed: {}", text);
                                                        if let Ok(cb) = on_tx.lock() {
                                                            cb(text);
                                                        }
                                                    }
                                                    Ok(_) => {}
                                                    Err(e) => log::error!("VAD auto-transcribe error: {e}"),
                                                }
                                            });
                                        }
                                    } else {
                                        log::debug!("VAD: silence timeout but TTS speaking, deferring transcription");
                                    }
                                }
                            }
                            audio_buffer.clear();
                            vad = VadState::Silence;
                            speech_start = None;
                            silence_start = None;
                            if let Ok(mut state) = state_arc.lock() {
                                if *state == PipelineState::Listening {
                                    *state = PipelineState::WakeWordListening;
                                    log::info!("VAD: silence timeout, returned to WakeWordListening");
                                }
                            }
                        }
                    }
                    (VadState::Silence, false) => {
                        // stay silent, keep small ring buffer
                        if audio_buffer.len() > sample_rate as usize {
                            audio_buffer.drain(0..audio_buffer.len().saturating_sub(sample_rate as usize));
                        }
                    }
                }
            }
            log::info!("Always-on VAD loop exited");
        });

        Ok(())
    }

    pub fn set_always_on_config(&self, config: AlwaysOnConfig) -> Result<(), String> {
        let mut cfg = self
            .always_on_config
            .lock()
            .map_err(|e| format!("AlwaysOn config lock error: {e}"))?;
        *cfg = config;
        Ok(())
    }

    pub fn get_always_on_config(&self) -> Result<AlwaysOnConfig, String> {
        self.always_on_config
            .lock()
            .map(|c| c.clone())
            .map_err(|e| format!("AlwaysOn config lock error: {e}"))
    }

    pub fn set_wake_word_config(&self, config: WakeWordConfig) -> Result<(), String> {
        let mut detector = self
            .wake_word_detector
            .lock()
            .map_err(|e| format!("Detector lock error: {e}"))?;
        detector.config = config;
        Ok(())
    }

    pub fn update_config(&self, config: &crate::config::AudioConfig) -> Result<(), String> {
        let mut stt_cfg = self
            .stt_config
            .lock()
            .map_err(|e| format!("STT config lock error: {e}"))?;
        if let Some(provider) = SttProvider::from_name(&config.stt_provider) {
            stt_cfg.provider = provider;
        }

        let mut tts_cfg = self
            .tts_config
            .lock()
            .map_err(|e| format!("TTS config lock error: {e}"))?;
        if let Some(provider) = TtsProvider::from_name(&config.tts_provider) {
            tts_cfg.provider = provider;
        }

        if let Ok(mut ao_cfg) = self.always_on_config.lock() {
            ao_cfg.enabled = config.activation_mode == "always_on";
        }

        Ok(())
    }

    pub fn set_stt_api_key(&self, key: String) -> Result<(), String> {
        let mut cfg = self
            .stt_config
            .lock()
            .map_err(|e| format!("STT config lock error: {e}"))?;
        cfg.api_key = key;
        Ok(())
    }

    pub fn set_tts_api_key(&self, key: String) -> Result<(), String> {
        let mut cfg = self
            .tts_config
            .lock()
            .map_err(|e| format!("TTS config lock error: {e}"))?;
        cfg.api_key = key;
        Ok(())
    }

    pub fn capture_handle(&self) -> Arc<Mutex<AudioCapture>> {
        self.capture.clone()
    }

    pub fn stt_config(&self) -> Result<SttConfig, String> {
        self.stt_config
            .lock()
            .map(|c| c.clone())
            .map_err(|e| format!("STT config lock poisoned: {e}"))
    }
}

impl Default for VoicePipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_state_default() {
        assert_eq!(PipelineState::default(), PipelineState::Idle);
    }

    #[test]
    fn test_pipeline_state_transitions() {
        let mut state = PipelineState::Idle;
        assert_eq!(state, PipelineState::Idle);
        state = PipelineState::Listening;
        assert_eq!(state, PipelineState::Listening);
        state = PipelineState::Processing;
        assert_eq!(state, PipelineState::Processing);
        state = PipelineState::Speaking;
        assert_eq!(state, PipelineState::Speaking);
        state = PipelineState::WakeWordListening;
        assert_eq!(state, PipelineState::WakeWordListening);
    }

    #[test]
    fn test_pipeline_state_debug() {
        let s = format!("{:?}", PipelineState::Idle);
        assert_eq!(s, "Idle");
    }

    #[test]
    fn test_pipeline_state_clone() {
        let a = PipelineState::Listening;
        let b = a;
        assert_eq!(a, b);
    }

    #[test]
    fn test_always_on_config_defaults() {
        let cfg = AlwaysOnConfig::default();
        assert!(!cfg.enabled);
        assert!((cfg.vad_threshold - 0.008).abs() < f32::EPSILON);
        assert_eq!(cfg.silence_timeout_ms, 1500);
        assert_eq!(cfg.min_speech_ms, 300);
        assert_eq!(cfg.sample_rate, 16000);
        assert!(cfg.auto_submit);
    }

    #[test]
    fn test_always_on_config_clone() {
        let cfg = AlwaysOnConfig::default();
        let cloned = cfg.clone();
        assert_eq!(cfg.enabled, cloned.enabled);
        assert_eq!(cfg.sample_rate, cloned.sample_rate);
    }

    #[test]
    fn test_vad_state_defaults() {
        assert_eq!(VadState::Silence as u8, 0);
        assert_eq!(VadState::Speech as u8, 1);
    }

    #[test]
    fn test_audio_level_default() {
        let level = AudioLevel::zero();
        assert!((level.rms).abs() < f32::EPSILON);
        assert!((level.peak).abs() < f32::EPSILON);
        assert!(!level.clipping);
    }

    #[test]
    fn test_audio_level_clone() {
        let a = AudioLevel { rms: 0.5, peak: 0.8, clipping: false };
        let b = a.clone();
        assert_eq!(a.rms, b.rms);
    }

    #[test]
    fn test_alway_on_config_serde_roundtrip() {
        let cfg = AlwaysOnConfig::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: AlwaysOnConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg.enabled, deserialized.enabled);
        assert_eq!(cfg.sample_rate, deserialized.sample_rate);
    }

    #[test]
    fn test_check_wake_word_fails_when_not_listening() {
        let pipeline = VoicePipeline::new();
        let result = pipeline.check_wake_word();
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn test_get_state_default() {
        let pipeline = VoicePipeline::new();
        let state = pipeline.get_state();
        assert!(state.is_ok());
        assert_eq!(state.unwrap(), PipelineState::Idle);
    }
}
