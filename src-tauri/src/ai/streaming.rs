use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    TextDelta {
        text: String,
        session_id: Option<String>,
    },
    TextDone {
        text: String,
        session_id: Option<String>,
    },
    Error {
        message: String,
        session_id: Option<String>,
    },
    Done {
        session_id: Option<String>,
    },
}

pub type StreamReceiver = mpsc::Receiver<StreamEvent>;
pub type StreamSender = mpsc::Sender<StreamEvent>;

pub fn create_channel() -> (StreamSender, StreamReceiver) {
    mpsc::channel(256)
}

/// One complete server-sent event (`event:` name plus joined `data:` lines).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: Option<String>,
    pub data: String,
}

/// Incremental SSE framer shared by every streaming provider. Feed raw
/// network chunks to [`SseBuffer::push`]; complete events come back as soon as
/// their terminating blank line arrives. Handles `\n`, `\r\n` and `\r` line
/// endings and chunks that split a line or a UTF-8 sequence anywhere.
#[derive(Debug, Default)]
pub struct SseBuffer {
    pending: Vec<u8>,
    event: Option<String>,
    data: Vec<String>,
}

impl SseBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseEvent> {
        self.pending.extend_from_slice(chunk);
        let mut out = Vec::new();
        loop {
            let Some(pos) = self.pending.iter().position(|b| *b == b'\n' || *b == b'\r') else {
                break;
            };
            // A lone trailing '\r' might be the first half of "\r\n"; wait.
            if self.pending[pos] == b'\r' && pos + 1 == self.pending.len() {
                break;
            }
            let mut end = pos + 1;
            if self.pending[pos] == b'\r' && self.pending.get(pos + 1) == Some(&b'\n') {
                end += 1;
            }
            let line_bytes: Vec<u8> = self.pending.drain(..end).collect();
            let line = String::from_utf8_lossy(&line_bytes[..pos]).into_owned();
            self.handle_line(&line, &mut out);
        }
        out
    }

    /// Flush at end of stream: a final event without its blank line still counts.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let mut out = Vec::new();
        if !self.pending.is_empty() {
            let line = String::from_utf8_lossy(&self.pending).into_owned();
            self.pending.clear();
            self.handle_line(line.trim_end_matches(['\r', '\n']), &mut out);
        }
        self.dispatch(&mut out);
        out
    }

    fn handle_line(&mut self, line: &str, out: &mut Vec<SseEvent>) {
        if line.is_empty() {
            self.dispatch(out);
        } else if line.starts_with(':') {
            // comment / keep-alive
        } else {
            let (field, value) = match line.split_once(':') {
                Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
                None => (line, ""),
            };
            match field {
                "event" => self.event = Some(value.to_string()),
                "data" => self.data.push(value.to_string()),
                _ => {}
            }
        }
    }

    fn dispatch(&mut self, out: &mut Vec<SseEvent>) {
        if self.data.is_empty() {
            self.event = None;
            return;
        }
        out.push(SseEvent {
            event: self.event.take(),
            data: self.data.join("\n"),
        });
        self.data.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_events_across_arbitrary_chunk_boundaries() {
        let raw = "event: a\ndata: {\"x\":1}\n\n: ping\n\nevent: b\r\ndata: one\r\ndata: two\r\n\r\n";
        let mut buf = SseBuffer::new();
        let mut events = Vec::new();
        for byte in raw.as_bytes() {
            events.extend(buf.push(std::slice::from_ref(byte)));
        }
        events.extend(buf.finish());
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event.as_deref(), Some("a"));
        assert_eq!(events[0].data, "{\"x\":1}");
        assert_eq!(events[1].data, "one\ntwo");
    }

    #[test]
    fn finish_flushes_unterminated_event() {
        let mut buf = SseBuffer::new();
        assert!(buf.push(b"data: tail").is_empty());
        let events = buf.finish();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "tail");
    }

    #[test]
    fn splits_multibyte_characters_safely() {
        let raw = "data: héllo\n\n".as_bytes();
        let mut buf = SseBuffer::new();
        let mut events = buf.push(&raw[..8]);
        events.extend(buf.push(&raw[8..]));
        assert_eq!(events[0].data, "héllo");
    }
}
