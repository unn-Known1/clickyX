// Flashcard Maker — Create Anki-compatible flashcards from text content
// Usage: { text, topic, count, format, exportPath }

module.exports = { main };

const fs = require('fs');
const path = require('path');
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

function toAnkiCSV(cards) {
  // Anki import format: front<TAB>back
  return cards.map((c) => `"${c.front.replace(/"/g, '""')}"\t"${c.back.replace(/"/g, '""')}"`).join('\n');
}

function toApkg(cards, deckName) {
  // Returns a simple text representation (real .apkg requires sqlite)
  return JSON.stringify({ deck: deckName, cards, exportNote: 'Use Anki Import > Text File (.txt) with tab separator' }, null, 2);
}

async function main(args) {
  const { text, topic, count = 10, format = 'json', exportPath, deckName = 'ClickyX Flashcards' } = args || {};

  if (!text && !topic) return { error: 'Missing text or topic to generate flashcards from' };

  try {
    const resp = await bridgeRequest({
      messages: [
        {
          role: 'system',
          content: `You are an expert flashcard creator. Create ${count} high-quality flashcards from the provided content.
Rules:
- Each card has a clear "front" (question/prompt) and "back" (answer/explanation)
- Questions should test understanding, not just recall
- Keep answers concise but complete
- Include a variety of question types (definition, application, comparison, example)
Output ONLY valid JSON array: [{"front": "...", "back": "..."}, ...]`,
        },
        {
          role: 'user',
          content: topic
            ? `Create ${count} flashcards about: ${topic}`
            : `Create ${count} flashcards from this content:\n\n${text.slice(0, 8000)}`,
        },
      ],
      stream: false,
    });

    const content = resp?.content || resp?.raw || '';
    const jsonMatch = content.match(/\[[\s\S]+\]/);
    if (!jsonMatch) return { error: 'Could not parse flashcards from AI response', raw: content.slice(0, 500) };

    const cards = JSON.parse(jsonMatch[0]);

    if (exportPath) {
      const ext = path.extname(exportPath).toLowerCase();
      if (ext === '.csv' || ext === '.txt') {
        fs.writeFileSync(exportPath, toAnkiCSV(cards), 'utf-8');
      } else {
        fs.writeFileSync(exportPath, toApkg(cards, deckName), 'utf-8');
      }
    }

    if (format === 'csv') {
      return { result: `${cards.length} flashcards generated`, csv: toAnkiCSV(cards), cards, exportedTo: exportPath || null };
    }

    return {
      result: `${cards.length} flashcards generated`,
      cards,
      ankiCsv: toAnkiCSV(cards),
      exportedTo: exportPath || null,
      importInstructions: 'In Anki: File > Import > select file, Tab separator, 2 fields (front/back)',
    };
  } catch (err) {
    console.error('[flashcard-maker]', err.message);
    return { error: err.message };
  }
}
