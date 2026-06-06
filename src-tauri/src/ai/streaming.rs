use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    TextDelta { text: String, session_id: Option<String> },
    TextDone { text: String, session_id: Option<String> },
    Error { message: String, session_id: Option<String> },
    Done { session_id: Option<String> },
}

pub type StreamReceiver = mpsc::Receiver<StreamEvent>;
pub type StreamSender = mpsc::Sender<StreamEvent>;

pub fn create_channel() -> (StreamSender, StreamReceiver) {
    mpsc::channel(256)
}
