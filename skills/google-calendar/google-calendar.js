// Google Calendar — Create, read, update, delete events and check availability
// Usage: { action: "list"|"create"|"update"|"delete"|"availability", ...params }
// Requires: GCAL_ACCESS_TOKEN env var

module.exports = { main };

const BASE = 'https://www.googleapis.com/calendar/v3';

async function calFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar API ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

async function main(args) {
  const {
    action, calendarId = 'primary', eventId,
    summary, description, start, end, attendees,
    timeMin, timeMax, accessToken,
  } = args || {};
  const token = accessToken || process.env.GCAL_ACCESS_TOKEN;
  if (!token) return { error: 'Missing GCAL_ACCESS_TOKEN' };

  try {
    switch (action) {
      case 'list': {
        const tmin = timeMin || new Date().toISOString();
        const tmax = timeMax || new Date(Date.now() + 7 * 86400000).toISOString();
        const data = await calFetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${tmin}&timeMax=${tmax}&singleEvents=true&orderBy=startTime`);
        return {
          result: `Found ${(data.items || []).length} events`,
          events: (data.items || []).map((e) => ({
            id: e.id, summary: e.summary, start: e.start, end: e.end,
            description: e.description, status: e.status,
          })),
        };
      }

      case 'create': {
        if (!summary || !start || !end) return { error: 'Missing summary, start, or end' };
        const body = {
          summary,
          description: description || '',
          start: typeof start === 'string' ? { dateTime: start, timeZone: 'UTC' } : start,
          end: typeof end === 'string' ? { dateTime: end, timeZone: 'UTC' } : end,
          attendees: attendees ? attendees.map((e) => ({ email: e })) : [],
        };
        const event = await calFetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return { result: 'Event created', id: event.id, htmlLink: event.htmlLink };
      }

      case 'update': {
        if (!eventId) return { error: 'Missing eventId' };
        const existing = await calFetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
        const updated = {
          ...existing,
          ...(summary && { summary }),
          ...(description !== undefined && { description }),
          ...(start && { start: typeof start === 'string' ? { dateTime: start, timeZone: 'UTC' } : start }),
          ...(end && { end: typeof end === 'string' ? { dateTime: end, timeZone: 'UTC' } : end }),
        };
        const event = await calFetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify(updated),
        });
        return { result: 'Event updated', id: event.id };
      }

      case 'delete': {
        if (!eventId) return { error: 'Missing eventId' };
        await calFetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: 'DELETE' });
        return { result: 'Event deleted', eventId };
      }

      case 'availability': {
        const tmin = timeMin || new Date().toISOString();
        const tmax = timeMax || new Date(Date.now() + 86400000).toISOString();
        const data = await calFetch(token, '/freeBusy', {
          method: 'POST',
          body: JSON.stringify({
            timeMin: tmin,
            timeMax: tmax,
            items: [{ id: calendarId }],
          }),
        });
        const busy = data.calendars?.[calendarId]?.busy || [];
        return {
          result: `${busy.length} busy slot(s) found`,
          timeMin: tmin,
          timeMax: tmax,
          busySlots: busy,
          available: busy.length === 0,
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, create, update, delete, availability` };
    }
  } catch (err) {
    console.error('[google-calendar]', err.message);
    return { error: err.message };
  }
}
