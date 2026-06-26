# FamilyTV AI agent tool (Google TV)

Lets an LLM act as a first-level TV support tech — inspect Google TV state, take
a screenshot, navigate, type, launch apps, and recover a stuck TV — through the
FamilyTV HTTP API. The model never runs raw ADB.

## Files

- `control_tv.tool.json` — the tool definition (feed to the model's `tools`).
- `familytv-tool-runner.js` — executor mapping tool calls to the API.

## Actions

| action | extra field | maps to |
| --- | --- | --- |
| `check_status` | — | `GET /health` |
| `current_app` | — | `GET /current-app` |
| `list_apps` | — | `GET /apps` |
| `take_screenshot` | — | `GET /screenshot` (PNG) |
| `wake_tv` | — | `POST /task/wake` |
| `press_button` | `key` | `POST /remote/:key` |
| `type_text` | `text` | `POST /type` |
| `open_app` | `app_name` | `POST /launch/:app_name` |
| `open_tv_assistant` | — | `POST /command` (`open Gemini`) |
| `ask_tv_assistant` | `query` | `POST /command` (`ask Gemini ...`) |
| `reset_home` | — | `POST /task/reset-home` |

## Screenshots in the loop

`take_screenshot` returns image **metadata** (`content_type`, `bytes`, `url`),
not pixels — base64 bytes aren't useful as text. Your agent layer should fetch
`GET /screenshot` and attach the image to the conversation as an image block so
the model can actually see the screen. The "diagnose stuck TV" flow leans on
this: `check_status` → `take_screenshot` (attach image) → `reset_home` →
`take_screenshot` to confirm.

## Wiring into the Claude API

```js
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { runControlTv } = require('./familytv-tool-runner');

const client = new Anthropic();
const controlTv = JSON.parse(fs.readFileSync(`${__dirname}/control_tv.tool.json`, 'utf8'));
const baseUrl = process.env.FAMILYTV_BASE_URL; // e.g. http://100.88.x.x:3000

let resp = await client.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 1024,
  tools: [controlTv],
  messages: [{ role: 'user', content: 'The TV is stuck, can you fix it?' }],
});
// ... standard tool-use loop: run runControlTv(block.input, { baseUrl }),
// feed tool_result back, and for screenshots attach GET /screenshot as an image.
```

## Local test (no device)

```bash
ADB_BIN=test/fake-adb.js GOOGLE_TV_ADDR=mock:5555 PORT=3997 node ../server.js &
node -e "require('./familytv-tool-runner').runControlTv({action:'press_button',key:'home'},{baseUrl:'http://localhost:3997'}).then(r=>console.log(r))"
```
