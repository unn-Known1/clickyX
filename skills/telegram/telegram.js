// Telegram — Send and receive messages via Telegram Bot API
// Usage: { action: "send"|"getUpdates"|"getMe"|"deleteMessage", chatId, text, ... }
// Requires: TELEGRAM_BOT_TOKEN env var

module.exports = { main };

async function tgFetch(token, method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Telegram API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
  return data.result;
}

async function main(args) {
  const { action, chatId, text, messageId, parseMode, offset, limit = 10, token: tokenArg } = args || {};
  const token = tokenArg || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { error: 'Missing TELEGRAM_BOT_TOKEN' };

  try {
    switch (action) {
      case 'send': {
        if (!chatId || !text) return { error: 'Missing chatId or text' };
        const msg = await tgFetch(token, 'sendMessage', {
          chat_id: chatId,
          text,
          ...(parseMode && { parse_mode: parseMode }),
        });
        return { result: 'Message sent', messageId: msg.message_id, chatId: msg.chat.id };
      }

      case 'getUpdates': {
        const updates = await tgFetch(token, 'getUpdates', {
          ...(offset && { offset }),
          limit: Math.min(limit, 100),
          timeout: 0,
        });
        return {
          result: `${updates.length} updates`,
          updates: updates.map((u) => ({
            updateId: u.update_id,
            from: u.message?.from?.username,
            chatId: u.message?.chat?.id,
            text: u.message?.text,
            date: u.message?.date,
          })),
        };
      }

      case 'getMe': {
        const me = await tgFetch(token, 'getMe');
        return { id: me.id, username: me.username, firstName: me.first_name, isBot: me.is_bot };
      }

      case 'deleteMessage': {
        if (!chatId || !messageId) return { error: 'Missing chatId or messageId' };
        await tgFetch(token, 'deleteMessage', { chat_id: chatId, message_id: messageId });
        return { result: 'Message deleted' };
      }

      case 'sendPhoto': {
        if (!chatId || !args?.photoUrl) return { error: 'Missing chatId or photoUrl' };
        const msg = await tgFetch(token, 'sendPhoto', { chat_id: chatId, photo: args.photoUrl, caption: text });
        return { result: 'Photo sent', messageId: msg.message_id };
      }

      default:
        return { error: `Unknown action: ${action}. Use: send, getUpdates, getMe, deleteMessage, sendPhoto` };
    }
  } catch (err) {
    console.error('[telegram]', err.message);
    return { error: err.message };
  }
}
