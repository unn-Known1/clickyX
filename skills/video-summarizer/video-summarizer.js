// Video Summarizer — Extract info from video files using ffprobe + AI
// Usage: { filePath, extractAudio, transcribe, apiKey }

module.exports = { main };

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

function bridgeRequest(data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 32123, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ffprobeInfo(filePath) {
  try {
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    return JSON.parse(out);
  } catch (e) {
    throw new Error(`ffprobe failed: ${e.message}. Install ffmpeg/ffprobe first.`);
  }
}

function extractAudioTrack(videoPath, outPath) {
  execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${outPath}" -y`, {
    encoding: 'utf-8', timeout: 120000,
  });
}

async function main(args) {
  const { filePath, extractAudio = false, transcribe = false, apiKey: keyArg } = args || {};
  if (!filePath) return { error: 'Missing filePath' };
  if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };

  try {
    // Step 1: Probe video
    const info = ffprobeInfo(filePath);
    const format = info.format || {};
    const streams = info.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const metadata = {
      filename: path.basename(filePath),
      duration: parseFloat(format.duration || 0).toFixed(1) + 's',
      size: Math.round((format.size || 0) / 1024 / 1024 * 10) / 10 + 'MB',
      format: format.format_name,
      bitrate: Math.round((format.bit_rate || 0) / 1000) + 'kbps',
      video: videoStream ? {
        codec: videoStream.codec_name,
        resolution: `${videoStream.width}x${videoStream.height}`,
        fps: eval(videoStream.avg_frame_rate || '0').toFixed(1),
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        channels: audioStream.channels,
        sampleRate: audioStream.sample_rate,
      } : null,
      tags: format.tags || {},
    };

    let transcript = null;
    // Step 2: Optional audio extraction + transcription
    if ((extractAudio || transcribe) && audioStream) {
      const apiKey = keyArg || process.env.OPENAI_API_KEY;
      if (!apiKey) return { result: 'Video probed (no transcription - OPENAI_API_KEY missing)', metadata };

      const tmpAudio = path.join(os.tmpdir(), `vidsumm_${Date.now()}.mp3`);
      extractAudioTrack(filePath, tmpAudio);

      try {
        // Use audio-transcriber logic inline
        const audioContent = fs.readFileSync(tmpAudio);
        const boundary = '----AudioBoundary' + Date.now();
        const parts = [
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
          audioContent,
          Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`),
        ];
        const body = Buffer.concat(parts);
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body,
        });
        if (res.ok) {
          const td = await res.json();
          transcript = td.text;
        }
      } finally {
        try { fs.unlinkSync(tmpAudio); } catch { /* cleanup */ }
      }
    }

    // Step 3: AI summary
    let summary = null;
    if (transcript) {
      try {
        const resp = await bridgeRequest({
          messages: [
            { role: 'system', content: 'You are a video content analyst. Summarize the provided video transcript concisely.' },
            { role: 'user', content: `Video: ${metadata.filename} (${metadata.duration})\n\nTranscript:\n${transcript.slice(0, 8000)}` },
          ],
          stream: false,
        });
        summary = resp?.content || resp?.raw || null;
      } catch { /* bridge not available */ }
    }

    return { result: 'Video analyzed', metadata, transcript: transcript?.slice(0, 2000), summary };
  } catch (err) {
    console.error('[video-summarizer]', err.message);
    return { error: err.message };
  }
}
