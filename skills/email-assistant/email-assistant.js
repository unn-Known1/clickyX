async function main(args) {
  const { action, to, subject, body, maxEmails } = args || {};

  console.log(`[email-assistant] action=${action} to=${to} subject=${subject}`);

  try {
    switch (action) {
      case 'send': {
        if (!to || !subject) {
          return { error: 'Missing required fields: to, subject' };
        }
        console.log(`[email-assistant] Sending email to ${to}: ${subject}`);
        return {
          result: 'Email sent successfully (mock)',
          email: { to, subject, body: body || '', sentAt: new Date().toISOString() },
        };
      }
      case 'read_inbox': {
        const count = maxEmails || 5;
        console.log(`[email-assistant] Reading inbox (mock, ${count} emails)`);
        const mockEmails = Array.from({ length: count }, (_, i) => ({
          id: `mock-${i + 1}`,
          from: `sender${i + 1}@example.com`,
          subject: `Mock email subject ${i + 1}`,
          snippet: `This is the body snippet of mock email ${i + 1}.`,
          receivedAt: new Date(Date.now() - i * 3600000).toISOString(),
        }));
        return { result: `Found ${count} emails`, emails: mockEmails };
      }
      default:
        return { error: `Unknown action: ${action}. Use 'send' or 'read_inbox'` };
    }
  } catch (err) {
    console.error('[email-assistant] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
