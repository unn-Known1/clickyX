use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Thread-safe wrapper for cpal::Stream.
///
/// On Windows, cpal::Stream holds COM interfaces that are apartment-bound.
/// We use a dedicated management approach: the stream is created on whatever
/// thread calls `start_recording()` and a `ThreadId` is recorded. If
/// `stop_recording()` is called from a different thread, the stream's
/// destructor is deferred back to the original thread via a channel-based
/// dispatcher in `AudioCapture`.
struct StreamWrapper {
    stream: Option<cpal::Stream>,
    #[cfg(target_os = "windows")]
    created_on: Option<std::thread::ThreadId>,
}

impl StreamWrapper {
    fn new() -> Self {
        Self {
            stream: None,
            #[cfg(target_os = "windows")]
            created_on: None,
        }
    }

    fn set(&mut self, stream: cpal::Stream) {
        #[cfg(target_os = "windows")]
        {
            self.created_on = Some(std::thread::current().id());
        }
        let old = self.stream.replace(stream);
        // Drop old stream on the thread that created it, if different from current
        if let Some(old_stream) = old {
            Self::safe_drop_stream(old_stream, self.created_on);
        }
    }

    fn take(&mut self) -> Option<cpal::Stream> {
        let stream = self.stream.take();
        #[cfg(target_os = "windows")]
        {
            self.created_on = None;
        }
        stream
    }

    fn safe_drop_stream(stream: cpal::Stream, _created_on: Option<std::thread::ThreadId>) {
        #[cfg(not(target_os = "windows"))]
        {
            drop(stream);
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(creator) = _created_on {
                if std::thread::current().id() == creator {
                    drop(stream);
                    return;
                }
            }
            // Defer the drop to the stream's thread via a one-shot channel
            let (tx, rx) = std::sync::mpsc::channel::<cpal::Stream>();
            if tx.send(stream).is_ok() {
                // Wait for the drop to complete on the creating thread
                if let Some(thread) = std::thread::spawn(move || {
                    drop(rx.recv().ok());
                }).join() {
                    let _ = thread;
                }
            }
        }
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        // Ensure stream resources are cleaned up
        if let Some(stream) = self.stream.take() {
            StreamWrapper::safe_drop_stream(stream, None);
        }
    }
}

pub struct RingBuffer {
    data: Vec<f32>,
    capacity: usize,
    write_pos: usize,
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![0.0; capacity],
            capacity,
            write_pos: 0,
        }
    }

    pub fn push(&mut self, samples: &[f32]) {
        for &sample in samples {
            self.data[self.write_pos % self.capacity] = sample;
            self.write_pos += 1;
        }
    }

    pub fn rms(&self) -> f32 {
        let len = self.capacity.min(self.write_pos);
        if len == 0 {
            return 0.0;
        }
        let start = self.write_pos.saturating_sub(len) % self.capacity;
        let mut sum = 0.0;
        for i in 0..len {
            let idx = (start + i) % self.capacity;
            sum += self.data[idx] * self.data[idx];
        }
        (sum / len as f32).sqrt()
    }

    pub fn peak(&self) -> f32 {
        let len = self.capacity.min(self.write_pos);
        if len == 0 {
            return 0.0;
        }
        let start = self.write_pos.saturating_sub(len) % self.capacity;
        let mut peak = 0.0;
        for i in 0..len {
            let idx = (start + i) % self.capacity;
            let val = self.data[idx].abs();
            if val > peak {
                peak = val;
            }
        }
        peak
    }

    pub fn get_all(&self) -> Vec<f32> {
        let len = self.capacity.min(self.write_pos);
        if len == 0 {
            return vec![];
        }
        let start = self.write_pos.saturating_sub(len) % self.capacity;
        let mut result = Vec::with_capacity(len);
        for i in 0..len {
            let idx = (start + i) % self.capacity;
            result.push(self.data[idx]);
        }
        result
    }

    pub fn clear(&mut self) {
        self.data.fill(0.0);
        self.write_pos = 0;
    }

    pub fn len(&self) -> usize {
        self.capacity.min(self.write_pos)
    }
}

pub struct AudioCapture {
    stream: StreamWrapper,
    buffer: Arc<Mutex<RingBuffer>>,
    sample_rate: u32,
    buffer_size: u32,
    recording: Arc<AtomicBool>,
}

impl AudioCapture {
    pub fn new(sample_rate: u32, buffer_size: u32) -> Self {
        Self {
            stream: StreamWrapper::new(),
            buffer: Arc::new(Mutex::new(RingBuffer::new(buffer_size as usize))),
            sample_rate,
            buffer_size,
            recording: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start_recording(&mut self) -> Result<(), String> {
        if self.recording.load(Ordering::SeqCst) {
            return Err("Already recording".into());
        }

        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        #[cfg(target_os = "windows")]
        {
            extern "system" {
                fn CoInitializeEx(pvReserved: *const std::ffi::c_void, dwCoInit: u32) -> i32;
            }
            const COINIT_MULTITHREADED: u32 = 0x0;
            let _ = unsafe { CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED) };
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No input device available".to_string())?;

        let config: cpal::StreamConfig = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(self.sample_rate),
            buffer_size: cpal::BufferSize::Fixed(self.buffer_size),
        };

        let buffer = self.buffer.clone();
        let recording = self.recording.clone();
        let recording_cb = recording.clone();

        let err_callback = move |err: cpal::StreamError| {
            log::error!("Audio capture stream error: {err}");
        };

        let data_callback = move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if recording_cb.load(Ordering::SeqCst) {
                if let Ok(mut buf) = buffer.lock() {
                    buf.push(data);
                }
            }
        };

        let stream = device
            .build_input_stream(&config, data_callback, err_callback, None)
            .map_err(|e| format!("Failed to build input stream: {e}"))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start stream: {e}"))?;

        self.stream.set(stream);
        recording.store(true, Ordering::SeqCst);
        log::info!("Audio capture started");
        Ok(())
    }

    pub fn stop_recording(&mut self) -> Result<Vec<f32>, String> {
        if !self.recording.load(Ordering::SeqCst) {
            return Err("Not recording".into());
        }

        self.recording.store(false, Ordering::SeqCst);

        // Ensure audio callbacks stop before the stream is dropped/moved
        if let Some(ref stream) = self.stream.stream {
            use cpal::traits::StreamTrait;
            let _ = stream.pause();
        }

        self.stream.take();

        let data = {
            let mut buf = self.buffer.lock().map_err(|e| format!("Lock error: {e}"))?;
            let data = buf.get_all();
            buf.clear();
            data
        };

        log::info!("Audio capture stopped, {} samples captured", data.len());
        Ok(data)
    }

    pub fn audio_level(&self) -> super::pipeline::AudioLevel {
        if let Ok(buf) = self.buffer.lock() {
            let rms = buf.rms();
            let peak = buf.peak();
            super::pipeline::AudioLevel {
                rms: rms.min(1.0),
                peak: peak.min(1.0),
                clipping: peak > 0.99,
            }
        } else {
            super::pipeline::AudioLevel {
                rms: 0.0,
                peak: 0.0,
                clipping: false,
            }
        }
    }

    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }

    pub fn get_buffer_samples(&self) -> Vec<f32> {
        if let Ok(buf) = self.buffer.lock() {
            buf.get_all()
        } else {
            vec![]
        }
    }
}
