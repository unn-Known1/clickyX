// Slack — Send messages, read channels via Slack Web API
// Usage: { action: "send"|"history"|"channels"|"users"|"upload", channel, text, ... }
// Requires: SLACK_BOT_TOKEN env var

module.exports = { main };

async function slackFetch(token, method, params = {}) {
  const url = `https://slack.com/api/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Slack API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

async function main(args) {
  const { action, channel, text, limit = 20, threadTs, token: tokenArg } = args || {};
  const token = tokenArg || process.env.SLACK_BOT_TOKEN;
  if (!token) return { error: 'Missing SLACK_BOT_TOKEN' };

  try {
    switch (action) {
      case 'send': {
        if (!channel || !text) return { error: 'Missing channel or text' };
        const params = { channel, text };
        if (threadTs) params.thread_ts = threadTs;
        const data = await slackFetch(token, 'chat.postMessage', params);
        return { result: 'Message sent', ts: data.ts, channel: data.channel };
      }

      case 'history': {
        if (!channel) return { error: 'Missing channel' };
        const data = await slackFetch(token, 'conversations.history', { channel, limit });
        return {
          result: `${data.messages?.length || 0} messages`,
          messages: (data.messages || []).map((m) => ({
            ts: m.ts, user: m.user, text: m.text, reactions: m.reactions,
          })),
        };
      }

      case 'channels': {
        const data = await slackFetch(token, 'conversations.list', { limit: 50, types: 'public_channel,private_channel' });
        return {
          result: `${data.channels?.length || 0} channels`,
          channels: (data.channels || []).map((c) => ({ id: c.id, name: c.name, is_private: c.is_private, num_members: c.num_members })),
        };
      }

      case 'users': {
        const data = await slackFetch(token, 'users.list', { limit: 100 });
        return {
          result: `${data.members?.length || 0} users`,
          users: (data.members || []).filter((u) => !u.deleted && !u.is_bot).map((u) => ({ id: u.id, name: u.name, real_name: u.real_name, email: u.profile?.email })),
        };
      }

      case 'react': {
        if (!channel || !args?.ts || !args?.emoji) return { error: 'Missing channel, ts, or emoji' };
        await slackFetch(token, 'reactions.add', { channel, timestamp: args.ts, name: args.emoji });
        return { result: 'Reaction added' };
      }

      default:
        return { error: `Unknown action: ${action}. Use: send, history, channels, users, react` };
    }
  } catch (err) {
    console.error('[slack]', err.message);
    return { error: err.message };
  }
}
