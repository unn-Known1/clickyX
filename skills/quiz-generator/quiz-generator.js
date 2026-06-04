// Quiz Generator — Generate multiple-choice and open-ended quizzes
// Usage: { text, topic, count, type, difficulty, includeAnswers }

module.exports = { main };

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

function formatQuizText(questions) {
  const lines = [];
  questions.forEach((q, i) => {
    lines.push(`\n${i + 1}. ${q.question}`);
    if (q.options) {
      q.options.forEach((opt, j) => {
        lines.push(`   ${String.fromCharCode(65 + j)}) ${opt}`);
      });
    }
    if (q.answer !== undefined) lines.push(`   ✓ Answer: ${q.answer}${q.explanation ? ` — ${q.explanation}` : ''}`);
  });
  return lines.join('\n');
}

async function main(args) {
  const { text, topic, count = 10, type = 'multiple-choice', difficulty = 'medium', includeAnswers = true } = args || {};

  if (!text && !topic) return { error: 'Missing text or topic' };

  const typeInstructions = {
    'multiple-choice': 'Multiple-choice questions with 4 options (A-D). Mark the correct answer.',
    'true-false': 'True/False questions. State whether the answer is True or False.',
    'open-ended': 'Open-ended questions that require a paragraph answer.',
    'fill-blank': 'Fill-in-the-blank questions with the missing word(s) as the answer.',
    'mixed': 'Mix of multiple-choice (50%), true/false (25%), and open-ended (25%) questions.',
  };

  const typeStr = typeInstructions[type] || typeInstructions['multiple-choice'];

  try {
    const resp = await bridgeRequest({
      messages: [
        {
          role: 'system',
          content: `You are an expert quiz creator. Generate ${count} quiz questions.
Type: ${typeStr}
Difficulty: ${difficulty}
Include answers: ${includeAnswers}

Output ONLY valid JSON array with this structure:
[{
  "question": "...",
  "type": "multiple-choice|true-false|open-ended|fill-blank",
  "options": ["A", "B", "C", "D"],  // for multiple-choice only
  "answer": "A" or "True" or "answer text",
  "explanation": "Why this is correct"
}]`,
        },
        {
          role: 'user',
          content: topic
            ? `Generate a quiz about: ${topic}`
            : `Generate a quiz from this content:\n\n${text.slice(0, 8000)}`,
        },
      ],
      stream: false,
    });

    const content = resp?.content || resp?.raw || '';
    const jsonMatch = content.match(/\[[\s\S]+\]/);
    if (!jsonMatch) return { error: 'Could not parse quiz from AI response', raw: content.slice(0, 500) };

    const questions = JSON.parse(jsonMatch[0]);

    // If not including answers, strip them
    const outputQuestions = includeAnswers ? questions : questions.map(({ answer, explanation, ...q }) => q);

    return {
      result: `${questions.length} questions generated`,
      questions: outputQuestions,
      text: formatQuizText(outputQuestions),
      type,
      difficulty,
      ...(includeAnswers && {
        answerKey: questions.map((q, i) => ({ number: i + 1, answer: q.answer, explanation: q.explanation })),
      }),
    };
  } catch (err) {
    console.error('[quiz-generator]', err.message);
    return { error: err.message };
  }
}
