// Discord — Send messages and read channels via Discord Bot API
// Usage: { action: "send"|"history"|"guilds"|"channels", channelId, content, ... }
// Requires: DISCORD_BOT_TOKEN env var

module.exports = { main };

async function discordFetch(token, path, options = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}

async function main(args) {
  const { action, channelId, guildId, content, limit = 20, token: tokenArg } = args || {};
  const token = tokenArg || process.env.DISCORD_BOT_TOKEN;
  if (!token) return { error: 'Missing DISCORD_BOT_TOKEN' };

  try {
    switch (action) {
      case 'send': {
        if (!channelId || !content) return { error: 'Missing channelId or content' };
        const msg = await discordFetch(token, `/channels/${channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        });
        return { result: 'Message sent', id: msg.id, channelId: msg.channel_id };
      }

      case 'history': {
        if (!channelId) return { error: 'Missing channelId' };
        const messages = await discordFetch(token, `/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`);
        return {
          result: `${messages.length} messages`,
          messages: messages.map((m) => ({ id: m.id, author: m.author?.username, content: m.content, timestamp: m.timestamp })),
        };
      }

      case 'guilds': {
        const guilds = await discordFetch(token, '/users/@me/guilds');
        return { result: `${guilds.length} guilds`, guilds: guilds.map((g) => ({ id: g.id, name: g.name })) };
      }

      case 'channels': {
        if (!guildId) return { error: 'Missing guildId' };
        const channels = await discordFetch(token, `/guilds/${guildId}/channels`);
        return {
          result: `${channels.length} channels`,
          channels: channels.map((c) => ({ id: c.id, name: c.name, type: c.type })),
        };
      }

      case 'me': {
        const user = await discordFetch(token, '/users/@me');
        return { id: user.id, username: user.username, discriminator: user.discriminator };
      }

      default:
        return { error: `Unknown action: ${action}. Use: send, history, guilds, channels, me` };
    }
  } catch (err) {
    console.error('[discord]', err.message);
    return { error: err.message };
  }
}
