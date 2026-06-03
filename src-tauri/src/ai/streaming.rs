use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamEvent {
    TextDelta(String),
    TextDone(String),
    Error(String),
    Done,
}

pub type StreamReceiver = mpsc::Receiver<StreamEvent>;
pub type StreamSender = mpsc::Sender<StreamEvent>;

pub fn create_channel() -> (StreamSender, StreamReceiver) {
    mpsc::channel(256)
}
