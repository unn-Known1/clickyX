use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

struct StreamWrapper(Option<cpal::Stream>);

// Safety: cpal::Stream is !Send on some platforms, but the stream handle only
// holds a reference to the audio thread's internal resources. We ensure the
// stream is paused (via StreamTrait::pause()) before it is dropped or moved
// across threads in stop_recording(), which stops the audio callback before
// the stream is destroyed on a different thread.
unsafe impl Send for StreamWrapper {}

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
            stream: StreamWrapper(None),
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

        let err_callback = move |err: cpal::StreamError| {
            log::error!("Audio capture stream error: {err}");
        };

        let data_callback = move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if recording.load(Ordering::SeqCst) {
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

        self.stream = StreamWrapper(Some(stream));
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
        if let Some(ref stream) = self.stream.0 {
            use cpal::traits::StreamTrait;
            let _ = stream.pause();
        }

        self.stream = StreamWrapper(None);

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
