// Audio Transcriber — Transcribe audio files using OpenAI Whisper API
// Usage: { filePath, language, prompt, responseFormat, apiKey }

module.exports = { main };

const fs = require('fs');
const path = require('path');

async function main(args) {
  const { filePath, language, prompt: whisperPrompt, responseFormat = 'json', apiKey: keyArg } = args || {};
  const apiKey = keyArg || process.env.OPENAI_API_KEY;

  if (!apiKey) return { error: 'Missing OPENAI_API_KEY' };
  if (!filePath) return { error: 'Missing filePath' };
  if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };

  const supportedFormats = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg'];
  const ext = path.extname(filePath).toLowerCase();
  if (!supportedFormats.includes(ext)) {
    return { error: `Unsupported format: ${ext}. Supported: ${supportedFormats.join(', ')}` };
  }

  try {
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Build multipart form manually
    const boundary = '----FormBoundary' + Date.now();
    const parts = [];

    // file part
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: audio/${ext.slice(1)}\r\n\r\n`),
      fileContent,
      Buffer.from('\r\n')
    );
    // model part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`));
    // response_format
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\n${responseFormat}\r\n`));
    if (language) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`));
    if (whisperPrompt) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${whisperPrompt}\r\n`));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) throw new Error(`Whisper API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = data.text || data;

    console.log(`[audio-transcriber] Transcribed ${path.basename(filePath)}: ${String(text).slice(0, 100)}...`);

    return {
      result: 'Audio transcribed',
      text: typeof text === 'string' ? text : JSON.stringify(text),
      filePath,
      language: language || 'auto',
      duration: data.duration,
    };
  } catch (err) {
    console.error('[audio-transcriber]', err.message);
    return { error: err.message };
  }
}
