# RokuPi AI agent tool

Lets an LLM drive the Roku through the RokuPi HTTP API — the same clean
endpoints the web remote uses. The model never touches raw Roku ECP.

## Files

- `control_roku.tool.json` — the tool definition (JSON Schema input). Feed this
  to the model's `tools` list.
- `roku-tool-runner.js` — executor. Maps a validated tool-use input to one HTTP
  call against the RokuPi server and returns a result object for the model.

## Actions

| action | extra field | maps to |
| --- | --- | --- |
| `health` | — | `GET /health` |
| `active_app` | — | `GET /active-app` |
| `list_apps` | — | `GET /apps` |
| `press_key` | `key` | `POST /remote/:key` |
| `open_app` | `app_name` | `POST /task/open/:app_name` |
| `launch_app` | `app_id` | `POST /launch/:app_id` |
| `reset_home` | — | `POST /task/reset-home` |

## Wiring it into the Claude API

```js
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { runControlRoku } = require('./roku-tool-runner');

const client = new Anthropic();
const controlRoku = JSON.parse(fs.readFileSync(`${__dirname}/control_roku.tool.json`, 'utf8'));
// RokuPi must be reachable — set the Pi's Tailscale IP:
const baseUrl = process.env.ROKUPI_BASE_URL; // e.g. http://100.88.x.x:3000

const messages = [{ role: 'user', content: "The TV is stuck, can you fix it?" }];

let resp = await client.messages.create({
  model: 'claude-opus-4-8',
  max_tokens: 1024,
  tools: [controlRoku],
  messages,
});

// Tool-use loop: run any tool calls, feed results back, repeat until done.
while (resp.stop_reason === 'tool_use') {
  messages.push({ role: 'assistant', content: resp.content });
  const results = [];
  for (const block of resp.content) {
    if (block.type !== 'tool_use' || block.name !== 'control_roku') continue;
    const result = await runControlRoku(block.input, { baseUrl });
    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(result),
    });
  }
  messages.push({ role: 'user', content: results });
  resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    tools: [controlRoku],
    messages,
  });
}
```

A typical "TV is stuck" flow the model will run: `health` → `active_app` →
`reset_home` → `active_app` to confirm it recovered.

## Local test (no Roku needed)

```bash
ROKU_IP=192.0.2.1 PORT=3057 node ../server.js &
node -e "require('./roku-tool-runner').runControlRoku({action:'press_key',key:'Home'},{baseUrl:'http://localhost:3057'}).then(r=>console.log(r))"
```

The HTTP call will time out against the fake IP, but you'll see the routing,
validation, and result shape are correct.
