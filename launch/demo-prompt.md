# Prompt — build the Arto playable demo (`arto-demo`)

Copy everything below the line into Claude Code (or another coding agent),
opened in an empty folder that will become the `arto-demo` repository.

---

You are building **arto-demo**, a playable browser demo for
[Arto](https://github.com/lwi00/arto). Arto is an MIT-licensed MCP server and
Arduino Uno firmware that let AI agents read sensors and drive outputs.
Visitors chat in plain English with an AI agent. The agent drives an
**emulated Arduino Uno running Arto's real firmware**, and a live breadboard
shows what happens. This demo will be linked from a Show HN post, so it must
handle a traffic spike on a $50 OpenRouter budget.

## Goals, in priority order

1. **Explicit about the Arduino.** Visitors should see the board, the pins, the
   wires, the raw serial protocol and every tool call. It should feel like
   hardware, not like a chatbot.
2. **Show the safety model.** The firmware interlock and the watchdog must be
   something visitors can trigger and watch with their own eyes.
3. **Cheap and abuse-resistant.** Our OpenRouter key never reaches the browser,
   and spend is capped.
4. **Small and boring.** Few dependencies, few files, no framework unless it
   clearly saves code.

## Read Arto first

Before writing any code, clone `https://github.com/lwi00/arto` into a scratch
directory and read `src/core/device.ts`, `src/core/manifest.ts`, `src/mcp.ts`,
`src/transports/*.ts`, `firmware/arto/arto.ino` and `docs/protocol.md`. The
facts below come from those files. Verify them, and trust the code if it
disagrees.

- `ArtoDevice` (in `src/core/device.ts`) takes a manifest and a
  `DeviceTransport`. It serializes commands, validates writes, sends a
  heartbeat (`h`) every second, faults on timeout and never retries.
- `DeviceTransport` is an `EventEmitter` that emits `line`, `fault` and
  `closed`. It implements `open()`, `send(line)`, `close()` and an optional
  `setInput(pin, bool)`.
- `createArtoServer(device)` (in `src/mcp.ts`) returns an MCP server with six
  tools: `describe_board`, `get_state`, `read_component`, `set_component`,
  `get_events` and `emergency_stop`.
- The firmware speaks a line protocol at 115200 baud. Requests look like
  `id op args`, for example `7 p 5 128`. Replies are JSON, for example
  `{"id":7,"ok":true,"value":128,"protocol":1}`. Events look like
  `{"event":"interlock","pin":5,"value":0}` or `{"event":"watchdog"}`.
- The firmware enforces interlocks: a blocked output rejects nonzero writes, and
  an active output is cleared. If it hears nothing for 5 s, the watchdog clears
  every output.
- **Do not use these in the browser:**
  - `AvrTransport`, because it relies on Node `worker_threads`, `fs` and `Buffer`.
  - Arto's package root, because the root re-exports `serialport` and the Node
    worker.
  - Node-only paths in general.
- The package `exports` map only exposes `"."`. Import the browser-safe modules
  `dist/core/device.js`, `dist/core/manifest.js` and `dist/mcp.js` through Vite
  `resolve.alias` entries that point into `node_modules/arto-mcp/dist/...`.
  Alias `node:events` to the `events` npm package.
- Get the firmware from `node_modules/arto-mcp/firmware/arto.hex`, imported with
  Vite's `?raw`.
- Arto is not on npm. Install it with `npm i arto-mcp@github:lwi00/arto`, then
  check that `dist/` exists. If it doesn't, run `npm run build` inside
  `node_modules/arto-mcp`, or add a `postinstall` script that does.
- **Do not fork or copy Arto's core logic.** Reuse `ArtoDevice`,
  `parseManifest` and `createArtoServer` as they are. The only new
  hardware-side code is the browser transport.

## Architecture (follow it unless you find a concrete blocker, and tell us if you do)

```text
Browser ───────────────────────────────────────────────────────────────────┐
  Web Worker: avr8js runs arto.hex  ⇄  WebWorkerTransport (DeviceTransport)
                                              │
                               ArtoDevice  →  createArtoServer  ⇄ MCP Client
                                              (InMemoryTransport pair)
  Agent loop: MCP tools → OpenAI-style tool schemas → POST /api/chat
  UI: breadboard SVG · input controls · chat · tool log · serial monitor
└───────────────────────────────────────────────────────────────────────────┘
Server (stateless): POST /api/chat → validate, rate-limit → OpenRouter
```

The emulator runs in the visitor's browser, so the server burns no CPU per
visitor and holds no session state. The server is only an LLM proxy.

### Web Worker (`src/avr.worker.ts`)

- Port the logic of Arto's `src/transports/avr-worker.ts`: Intel HEX parsing
  with checksums, the CPU, ports B/C/D, timers 0/1/2, the ADC, the USART, and
  baud-paced RX at interrupt-safe boundaries.
- Replace `Buffer` and `worker_threads` with `TextEncoder`/`TextDecoder`,
  `Uint8Array` parsing and `postMessage`.
- Inputs:
  - `{type:'send', line}`
  - `{type:'digital', pin, value}`
  - `{type:'analog', channel, volts}` (set `adc.channelValues[channel]`)
  - `{type:'cable', connected}`
- **PWM duty.** Do not post a message on every GPIO edge, since PWM toggles at
  about 1 kHz. Accumulate high-time per pin in CPU cycles, and every 100 ms post
  `{type:'pins', duty: number[20]}` with values from 0 to 1. Digital pins
  report 0 or 1. The UI renders from this measured duty, so what you see is the
  emulated waveform, not the host's cached state.
- **Cable.** While `connected` is false, drop bytes in both directions. This
  simulates a pulled USB cable: the firmware watchdog fires after 5 s, and the
  host times out and faults. That is the real Arto behavior, and we want it
  visible.

### Browser transport (`src/transport.ts`)

- `WebWorkerTransport extends DeviceTransport`, with `kind = 'avr8js-browser'`.
- It wraps the worker and emits `line` for each line.
- `setInput(pin, value)` sends a digital message. Arto calls it for pull-up
  inputs during `connect()`.
- It exposes `setAnalog`, `setCable` and an `onPins` listener.
- It taps every outgoing and incoming line for the serial monitor.

### Demo board (`src/board.json`)

Use a typical starter-kit build, and keep only the kinds Arto supports
(`digital-input`, `analog-input`, `digital-output`, `pwm-output`):

| id | kind | pin | notes |
| --- | --- | --- | --- |
| `status_led` | digital-output | 13 | built-in LED |
| `lamp` | pwm-output | 9 | dimmable LED, 0–255 |
| `fan` | pwm-output | 5 | DC motor via transistor, `max` 200 |
| `buzzer` | digital-output | 8 | active buzzer |
| `button` | digital-input, pullup | 2 | pressed = 0 |
| `lid` | digital-input, pullup | 4 | lid closed = 0, open = 1 |
| `knob` | analog-input | 14 (A0) | potentiometer |
| `light` | analog-input | 15 (A1) | photoresistor, higher = brighter |

Add the interlock `{"input":"lid","output":"fan","blockedValue":1}`, so an open
lid stops the fan in firmware. Give every component a clear `description`. The
agent only knows what the manifest says, so explain pull-up semantics and the
fan cap there. Validate the file with `parseManifest` in the test.

### Agent loop (`src/agent.ts`)

- Connect an MCP `Client` to `createArtoServer(device)` through
  `InMemoryTransport.createLinkedPair()`.
- Convert `listTools()` to OpenAI-style function definitions: `name`,
  `description`, and `inputSchema` as `parameters`.
- For each user message, POST `{messages, tools}` to `/api/chat`. Execute the
  returned `tool_calls` through MCP and append the results. Loop until the
  model answers in text, with **at most 8 tool rounds per user message**.
- Stream nothing. Keep it a simple request/response.
- Keep a bounded conversation history: the last 20 messages, trimmed on whole
  turns so no tool result is left orphaned.
- Show each tool call in the UI as it happens: name, arguments, result, and
  error state. Show it inline in the chat and also in the tool log.

### UI (`index.html`, `src/main.ts`, `src/style.css`)

Use vanilla TypeScript and plain CSS. Layout:

- **Left: the breadboard.** An SVG of an Uno, a breadboard and colored wires to
  each component, with pin labels such as `D9 ~`. Render from measured duty:
  - LED glow opacity follows duty.
  - The fan rotates at a speed proportional to duty, with CSS animation and an
    adjustable duration.
  - The buzzer pulses when high.
  - The built-in LED lights up.
- **Interactive inputs** next to their parts:
  - press-and-hold button (mouse and touch);
  - lid toggle, drawn as the fan's lid opening;
  - knob slider from 0 to 5 V;
  - light slider with a sun/moon icon.
- **Right: the chat.** Suggested prompts as chips:
  - "What's on this board?"
  - "Dim the lamp to 30%"
  - "Spin the fan, then I'll open the lid"
  - "Turn the lamp on when it gets dark"
  - "Beep when I press the button"
- **Bottom: tabs** for the tool log and the serial monitor. The serial monitor
  shows raw protocol lines (`→ 12 p 9 77` / `← {"id":12,…}`), hides heartbeat
  lines by default, and has a "show heartbeats" toggle.
- **Status bar:**
  - device status (`ready` / `fault`);
  - an "Unplug USB" toggle;
  - "Reset board", which terminates the worker, creates a new device and reconnects;
  - an "Emergency stop" button that calls the same MCP tool;
  - a counter showing the remaining messages for this session.
- **Fault state.** When the device faults, explain why in plain words (for
  example: *watchdog: the board heard nothing for 5 s and switched every output
  off*) and offer "Reset board".
- The agent can't sense the button in real time. Arto doesn't wake agents;
  `get_events` and polling are the harness's job. Don't fake it. If a visitor
  asks for reactive behavior, the agent should say it can check now or poll a
  few times, and the system prompt should tell it that.
- **Responsive.** Below 900 px, stack the board above the chat. Use a 16 px
  gutter, no horizontal scroll, and support dark mode via
  `prefers-color-scheme`.
- **Header:** "Arto — give your AI agent an Arduino", with links to GitHub and
  to the article. **Footer:** "Real Arto firmware, emulated with avr8js.
  Nothing here touches physical hardware."

### Server (`api/chat.js` + `server.js`)

- `api/chat.js` is a Node `(req, res)` handler, so it can run as-is as a Vercel
  function. `server.js` is a plain `node:http` server that serves `dist/`
  statically and routes `POST /api/chat` to that handler, for any Node host
  (Fly, Render, Railway, a VPS). Don't add Express.
- **Environment:**
  - `OPENROUTER_API_KEY` (required);
  - `OPENROUTER_MODEL`, defaulting to a fast, cheap tool-calling model.
    Check the current slug on openrouter.ai/models. A Claude Haiku is the
    preferred choice.
  - `MAX_REQUESTS_PER_IP_PER_HOUR` (default 60);
  - `PORT`;
  - `SITE_URL`, used for OpenRouter's `HTTP-Referer` and `X-Title` headers.
- **Validation:**
  - Reject anything other than `POST` with JSON.
  - Body at most 64 KB, and at most 40 messages.
  - Roles must be `user`, `assistant` or `tool`. Drop any client `system`
    message.
  - Tool names must be exactly the six Arto tools.
  - User text at most 500 characters per message.
- **The server owns the system prompt** and prepends it. The client cannot
  change the model, the temperature or `max_tokens` (cap at 600).
- **System prompt.** You are an agent connected to an Arduino Uno through
  Arto. Call `describe_board` before acting. Never claim a physical effect you
  didn't observe. A firmware acknowledgment is not a physical measurement, and
  this is an emulator. Respect refusals and faults, and never retry an uncertain
  action blindly. Keep answers short and concrete. Mention pins and values.
  Stay on topic and politely decline unrelated requests.
- **Rate limiting.** Use an in-memory sliding window per IP, taken from
  `x-forwarded-for`, first hop. Return 429 with a friendly message. Add a
  comment that this is per-instance and that the real hard cap is the
  OpenRouter key's credit limit.
- Forward the request to `https://openrouter.ai/api/v1/chat/completions` with
  `tools`. Return only `choices[0].message`. Map upstream errors to a clean
  502, and never leak the key or the upstream body.

## Documentation (Google-style docstrings, plus dedicated docs files)

- Every exported function and class gets a JSDoc docstring in Google style:
  a one-line summary, a blank line, then `Args:`, `Returns:` and `Raises:`
  sections where they apply.
- `README.md`: what the demo is, a screenshot placeholder, quick start
  (`npm ci`, `.env`, `npm run dev`), and links to the docs.
- `docs/architecture.md`: the diagram above, the data flow for one user message,
  why the emulator runs in the browser, and how PWM duty is measured.
- `docs/deployment.md`: Vercel (static `dist/` + `api/chat.js`) and a generic
  Node host (`npm run build && npm start`), the environment variables, and the
  OpenRouter setup. **Create a dedicated key with a credit limit (for example
  $40 of the $50).** This is the real spend cap. Also give a cost estimate per
  conversation for the chosen model.
- `docs/security.md`: the threat model for a public LLM proxy, every server
  check and why it exists, what the rate limiter does and doesn't cover, and
  the fact that no hardware is reachable.
- `.env.example`, a `.gitignore` that covers `.env`, `node_modules` and
  `dist`, and an MIT `LICENSE` (Copyright (c) 2026 Louis Doidy).

## Tests and verification

- Keep tests small and use `node:test` only.
  - `tests/chat.test.js` checks that the handler rejects a client system
    message, an unknown tool name, an oversized body and the 61st request from
    one IP. Mock `fetch` so no network is used.
  - A second test validates `src/board.json` with Arto's `parseManifest`.
- `npm run build` must pass with `tsc --noEmit`, `strict: true`.
- **Manual check.** Run `npm run dev`, then confirm each of these in a browser:
  - the board connects and the serial monitor shows `h`, `m` and `i` lines;
  - the lamp and fan respond to a prompt;
  - opening the lid stops the fan and logs an `interlock` event;
  - "Unplug USB" makes every output go dark within about 5 s, the status shows
    the watchdog fault, and "Reset board" recovers.

  For a test without spending credits, add a `MOCK_LLM=1` server mode that
  returns a scripted sequence: `describe_board`, then
  `set_component lamp 128`, then a text reply.

## Out of scope

- Physical hardware, WebSerial, accounts, persistence and analytics.
- Response streaming, a frontend framework, a CSS framework.
- Servos, displays, `tone()`. The firmware doesn't support them, and the UI must
  not pretend it does.

When you're done, summarize what you built, any deviation from this spec and
why, and the exact commands to run and deploy it.
