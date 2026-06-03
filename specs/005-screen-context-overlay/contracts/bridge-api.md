# Bridge API: Screen & Overlay Endpoints

## Base URL: `http://127.0.0.1:32123`

All endpoints return JSON.

### `POST /screenshot`
Capture screenshot(s).

**Response**:
```json
{
  "images": [
    {
      "data": "<base64-jpeg>",
      "width": 1920,
      "height": 1080,
      "monitor_id": 0
    }
  ]
}
```

### `POST /cursor`
Show a cursor at coordinates.

**Request**:
```json
{
  "x": 100,
  "y": 200,
  "label": "click here",
  "accent": "#ff6600"
}
```

**Response**: `{"ok": true}`

### `POST /cursors`
Show multiple cursors.

**Request**:
```json
{
  "cursors": [
    {"x": 100, "y": 200, "label": "first"},
    {"x": 300, "y": 400, "label": "second"}
  ]
}
```

### `POST /rectangle`
Draw a rectangle.

**Request**:
```json
{
  "x": 0, "y": 0,
  "w": 100, "h": 50,
  "label": "Submit button"
}
```

### `POST /scribble`
Draw a freehand path.

**Request**:
```json
{
  "points": [[0,0], [10,20], [30,50]],
  "label": "draw here"
}
```

### `POST /caption`
Show a caption/speech bubble.

**Request**:
```json
{
  "text": "Hello, I'm ClickyX",
  "x": 100,
  "y": 200
}
```

### `POST /click`
Execute left-click at coordinates.

**Request**:
```json
{
  "x": 100,
  "y": 200
}
```

**Response**: `{"ok": true}`

### `POST /clear`
Clear all overlays.

**Response**: `{"ok": true}`
