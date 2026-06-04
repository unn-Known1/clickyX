// Image Generator — Generate images via DALL-E or Stable Diffusion API
// Usage: { prompt, provider, size, quality, n, outputPath, apiKey }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const os = require('os');

async function main(args) {
  const {
    prompt,
    provider = 'dall-e',
    size = '1024x1024',
    quality = 'standard',
    n = 1,
    outputPath,
    model = 'dall-e-3',
    sdUrl,
    apiKey: keyArg,
  } = args || {};

  if (!prompt) return { error: 'Missing prompt' };

  try {
    if (provider === 'dall-e' || provider === 'openai') {
      const apiKey = keyArg || process.env.OPENAI_API_KEY;
      if (!apiKey) return { error: 'Missing OPENAI_API_KEY' };

      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, n: Math.min(n, 10), size, quality }),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const images = data.data || [];

      // Optionally download images
      const savedPaths = [];
      if (outputPath && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (img.url) {
            const imgRes = await fetch(img.url);
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const outFile = images.length > 1 ? outputPath.replace(/(\.\w+)?$/, `_${i + 1}$1`) : outputPath;
            fs.mkdirSync(path.dirname(outFile), { recursive: true });
            fs.writeFileSync(outFile, buf);
            savedPaths.push(outFile);
          }
        }
      }

      return {
        result: `${images.length} image(s) generated`,
        images: images.map((img, i) => ({
          url: img.url,
          revised_prompt: img.revised_prompt,
          saved: savedPaths[i] || null,
        })),
      };
    }

    if (provider === 'stable-diffusion' || provider === 'sd') {
      const baseUrl = sdUrl || process.env.SD_URL || 'http://127.0.0.1:7860';
      const res = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          steps: 20,
          width: parseInt(size?.split('x')[0]) || 512,
          height: parseInt(size?.split('x')[1]) || 512,
          n_iter: n,
        }),
      });
      if (!res.ok) throw new Error(`SD API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const savedPaths = [];
      if (data.images) {
        const outDir = outputPath ? path.dirname(outputPath) : os.tmpdir();
        for (let i = 0; i < data.images.length; i++) {
          const base64 = data.images[i];
          const outFile = path.join(outDir, `sd_${Date.now()}_${i}.png`);
          fs.writeFileSync(outFile, Buffer.from(base64, 'base64'));
          savedPaths.push(outFile);
        }
      }
      return { result: `${savedPaths.length} image(s) generated`, paths: savedPaths };
    }

    return { error: `Unknown provider: ${provider}. Use: dall-e, stable-diffusion` };
  } catch (err) {
    console.error('[image-generator]', err.message);
    return { error: err.message };
  }
}
