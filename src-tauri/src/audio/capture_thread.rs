use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use super::capture::{AudioCapture, RingBuffer};
use super::pipeline::AudioLevel;

enum CaptureCommand {
    StartRecording {
        response: mpsc::Sender<Result<(), String>>,
    },
    StopRecording {
        response: mpsc::Sender<Result<Vec<f32>, String>>,
    },
    #[allow(dead_code)]
    Shutdown,
}

#[derive(Clone)]
pub struct CaptureThreadHandle {
    cmd_tx: mpsc::Sender<CaptureCommand>,
    buffer: Arc<Mutex<RingBuffer>>,
    recording: Arc<AtomicBool>,
}

impl CaptureThreadHandle {
    /// Spawn the capture thread. Returns `Err` (instead of panicking the
    /// caller) when the audio thread dies before handing over its handles.
    pub fn spawn(sample_rate: u32, buffer_size: u32) -> Result<Self, String> {
        let (cmd_tx, cmd_rx) = mpsc::channel::<CaptureCommand>();

        // Create a shared buffer and recording atomic that outlive the AudioCapture
        let (buffer_tx, buffer_rx) = mpsc::channel::<Arc<Mutex<RingBuffer>>>();
        let (recording_tx, recording_rx) = mpsc::channel::<Arc<AtomicBool>>();

        std::thread::spawn(move || {
            // AudioCapture is created on this thread, so cpal::Stream never crosses threads
            let mut capture = AudioCapture::new(sample_rate, buffer_size);
            let _ = buffer_tx.send(capture.buffer_clone());
            let _ = recording_tx.send(capture.recording_clone());

            while let Ok(cmd) = cmd_rx.recv() {
                match cmd {
                    CaptureCommand::StartRecording { response } => {
                        let _ = response.send(capture.start_recording());
                    }
                    CaptureCommand::StopRecording { response } => {
                        let _ = response.send(capture.stop_recording());
                    }
                    CaptureCommand::Shutdown => break,
                }
            }
            // AudioCapture (and its cpal::Stream) destructs here on the same thread
        });

        // S-MIN-2: no expect() across the thread boundary — a dead audio
        // thread surfaces as Err so the pipeline can degrade to disabled.
        let buffer = buffer_rx
            .recv()
            .map_err(|e| format!("Capture thread failed to start: {e}"))?;
        let recording = recording_rx
            .recv()
            .map_err(|e| format!("Capture thread failed to start: {e}"))?;

        Ok(Self {
            cmd_tx,
            buffer,
            recording,
        })
    }

    /// Non-functional handle used when the capture thread fails to start.
    /// Commands fail fast with "disconnected" instead of hanging/panicking.
    pub fn disabled() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel::<CaptureCommand>();
        // Drop the receiver: every command send then errors immediately.
        drop(cmd_rx);
        Self {
            cmd_tx,
            buffer: Arc::new(Mutex::new(RingBuffer::new(64))),
            recording: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start_recording(&self) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(CaptureCommand::StartRecording { response: tx })
            .map_err(|_| "Capture thread disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "Capture thread response error".to_string())?
    }

    pub fn stop_recording(&self) -> Result<Vec<f32>, String> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(CaptureCommand::StopRecording { response: tx })
            .map_err(|_| "Capture thread disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "Capture thread response error".to_string())?
    }

    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }

    pub fn audio_level(&self) -> AudioLevel {
        if let Ok(buf) = self.buffer.lock() {
            let rms = buf.rms();
            let peak = buf.peak();
            AudioLevel {
                rms: rms.min(1.0),
                peak: peak.min(1.0),
                clipping: peak > 0.99,
            }
        } else {
            AudioLevel::zero()
        }
    }
    #[allow(dead_code)]
    pub fn get_buffer_samples(&self) -> Vec<f32> {
        if let Ok(buf) = self.buffer.lock() {
            buf.get_all()
        } else {
            vec![]
        }
    }

    /// Read the newest buffered samples and consume them so the next poll only
    /// returns newly captured audio (fixes duplicated/repeating transcriptions).
    pub fn drain_buffer_samples(&self) -> Vec<f32> {
        if let Ok(mut buf) = self.buffer.lock() {
            buf.drain_all()
        } else {
            vec![]
        }
    }
}

// Send + Sync are automatically derived since all fields are Send + Sync:
// - mpsc::Sender: Send + Sync
// - Arc<Mutex<RingBuffer>>: Send + Sync
// - Arc<AtomicBool>: Send + Sync
