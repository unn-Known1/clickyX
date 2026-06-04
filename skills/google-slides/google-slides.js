// Google Slides — Create and read Google Slides presentations
// Usage: { action: "create"|"read"|"addSlide"|"addText", presentationId, ... }
// Requires: GSLIDES_ACCESS_TOKEN env var

module.exports = { main };

const BASE = 'https://slides.googleapis.com/v1/presentations';

async function slidesFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Slides API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main(args) {
  const { action, presentationId, title, slideLayout, text, slideIndex, accessToken } = args || {};
  const token = accessToken || process.env.GSLIDES_ACCESS_TOKEN;
  if (!token) return { error: 'Missing GSLIDES_ACCESS_TOKEN' };

  try {
    switch (action) {
      case 'create': {
        const pres = await slidesFetch(token, '', {
          method: 'POST',
          body: JSON.stringify({ title: title || 'New Presentation' }),
        });
        return {
          result: 'Presentation created',
          presentationId: pres.presentationId,
          title: pres.title,
          slides: (pres.slides || []).length,
        };
      }

      case 'read': {
        if (!presentationId) return { error: 'Missing presentationId' };
        const pres = await slidesFetch(token, `/${presentationId}`);
        const slides = (pres.slides || []).map((s, i) => {
          const texts = [];
          for (const el of (s.pageElements || [])) {
            if (el.shape?.text) {
              for (const te of (el.shape.text.textElements || [])) {
                if (te.textRun?.content) texts.push(te.textRun.content.trim());
              }
            }
          }
          return { index: i, objectId: s.objectId, texts };
        });
        return { result: 'Presentation read', title: pres.title, presentationId: pres.presentationId, slides };
      }

      case 'addSlide': {
        if (!presentationId) return { error: 'Missing presentationId' };
        const requests = [{ duplicateObject: undefined }, {
          createSlide: {
            insertionIndex: slideIndex !== undefined ? slideIndex : undefined,
            slideLayoutReference: { predefinedLayout: slideLayout || 'BLANK' },
          },
        }].filter((r) => !r.duplicateObject);
        const res = await slidesFetch(token, `/${presentationId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests: [{ createSlide: { slideLayoutReference: { predefinedLayout: slideLayout || 'BLANK' } } }] }),
        });
        return { result: 'Slide added', replies: res.replies };
      }

      case 'addText': {
        if (!presentationId || !text) return { error: 'Missing presentationId or text' };
        const pres = await slidesFetch(token, `/${presentationId}`);
        const targetSlide = pres.slides?.[slideIndex || 0];
        if (!targetSlide) return { error: 'Slide not found' };
        const objId = 'text_' + Date.now();
        await slidesFetch(token, `/${presentationId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              {
                createShape: {
                  objectId: objId,
                  shapeType: 'TEXT_BOX',
                  elementProperties: {
                    pageObjectId: targetSlide.objectId,
                    size: { height: { magnitude: 100, unit: 'PT' }, width: { magnitude: 400, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 100, translateY: 100, unit: 'PT' },
                  },
                },
              },
              { insertText: { objectId: objId, insertionIndex: 0, text } },
            ],
          }),
        });
        return { result: 'Text added to slide', presentationId, slideIndex: slideIndex || 0 };
      }

      default:
        return { error: `Unknown action: ${action}. Use: create, read, addSlide, addText` };
    }
  } catch (err) {
    console.error('[google-slides]', err.message);
    return { error: err.message };
  }
}
