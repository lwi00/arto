# Pillbox architecture

## System overview

```text
                 voice                    HTTPS (Streamable HTTP, Bearer)
  Person  ──────────────▶  Alexa+  ─────────────────────────────┐
                                                                ▼
  Caregiver ◀── SMS/email ── Amazon SNS            ┌────────────────────────────┐
                               ▲                   │ applications/pillbox        │
                               │ publish           │  express server             │
  ┌────────────────────────────┴──┐   MCP (HTTP)   │  /mcp        pillbox tools  │
  │ Scheduler agent (Python)       │──────────────▶│  /api/*      dashboard API  │
  │ Strands Agents + Amazon Bedrock│               │  IntakeTracker (history)    │
  └────────────────────────────────┘               │  ArtoDevice                 │
                                                   └─────────────┬──────────────┘
                                                                 │ SerialTransport (USB)
                                                                 │ or AvrTransport (emulated)
                                                                 ▼
                                                   Arduino Uno + Arto firmware
                                                   lid switch · LED · buzzer
```

Two clients use the same MCP endpoint with different tokens:

1. **Alexa+** answers the person's questions and performs requested reminders.
2. **The scheduler agent** runs on a timer, detects missed doses and notifies the caregiver.

The core rule from [the Arto architecture](../architecture.md) still applies:
the core does not import application code or an AI provider. Pillbox rules, history,
tokens and agents live in `applications/pillbox`.

## Hardware

| Component id | Part | Uno pin | Arto kind | Notes |
| --- | --- | --- | --- | --- |
| `lid` | Reed switch and magnet, or push button | D2 | `digital-input`, `pullup: true` | Closed lid pulls the pin LOW: `0` = closed, `1` = open. |
| `reminder_led` | LED and 220 Ω resistor | D8 | `digital-output` | Visual reminder. |
| `buzzer` | Active 5 V buzzer | D9 | `digital-output` | An active buzzer sounds on a DC level. A passive buzzer would need `tone()`, which the firmware does not provide. |

Optional second compartment (evening): `lid_evening` on D3 and `reminder_led_evening`
on D7, with the same wiring.

Wiring rules:

- Pins 0 and 1 are reserved for serial.
- A push button can replace the reed switch for development. With `pullup: true`,
  a released button reads `1`, which the pillbox will interpret as "lid open".
  Hold it down to simulate a closed lid, or invert the meaning in the manifest
  description and tracker.
- The firmware watchdog clears outputs after five seconds without host contact.
  A crashed or disconnected server therefore stops the buzzer.

## Manifest

Planned file: `applications/pillbox/board.json`.

```json
{
  "schemaVersion": 1,
  "id": "pillbox",
  "name": "Arto Pillbox",
  "description": "Single-compartment pillbox. Lid reed switch on D2 with INPUT_PULLUP: 0 means closed, 1 means open. Reminder LED on D8. Active buzzer on D9.",
  "board": "arduino-uno",
  "components": [
    { "id": "lid", "label": "Pillbox lid", "pin": 2, "kind": "digital-input", "pullup": true,
      "description": "0 = closed, 1 = open" },
    { "id": "reminder_led", "label": "Reminder light", "pin": 8, "kind": "digital-output" },
    { "id": "buzzer", "label": "Reminder buzzer", "pin": 9, "kind": "digital-output" }
  ],
  "interlocks": [
    { "input": "lid", "output": "buzzer", "blockedValue": 1 }
  ]
}
```

The interlock makes the firmware reject a buzzer write while the lid is open and
clear an active buzzer as soon as the lid opens. This behaviour does not depend on
the model, the network or the server. The demo should show it.

## Domain model

### Schedule

```ts
interface DoseSlot {
  id: 'morning' | 'evening';
  label: string;          // "Morning pills"
  opens: string;          // "07:00", local time
  due: string;            // "09:00"; a reminder is allowed from this time
  closes: string;         // "11:00"; after this the dose is missed
}
```

The schedule and IANA time zone come from `applications/pillbox/schedule.json`
(for example `Europe/Paris`). Changing it through voice is out of scope.

### Intake detection

The firmware does not report input changes, so the tracker polls `lid` every
250 ms through `ArtoDevice.read`. The serial link handles this rate easily.

| Rule | Value | Reason |
| --- | --- | --- |
| Debounce | Two consecutive identical reads. | Ignores switch bounce. |
| Minimum open time | 2 s. | Ignores accidental bumps. |
| Attribution | First qualifying opening inside `[opens, closes]` marks the slot as taken. | One dose per slot. |
| Late | Taken after `due + 30 min`. | Reported, not treated as missed. |
| Missed | No qualifying opening before `closes`. | Triggers the caregiver alert. |

**Limit:** an opened lid is evidence of access, not proof that the pills were
swallowed. Tool responses, voice answers and the video must say "the pillbox was
opened", never "the medication was taken".

### Status values

| Status | Meaning |
| --- | --- |
| `upcoming` | Before `opens`. |
| `pending` | Between `opens` and `due`, not yet opened. |
| `overdue` | After `due`, not yet opened. Reminders are allowed. |
| `opened` | A qualifying opening was recorded; includes time and whether it was late. |
| `missed` | `closes` passed without a qualifying opening. |
| `unknown` | Device disconnected or faulted during the window; tracking is incomplete. |

`unknown` prevents the server from reporting a dose as missed when the board was
unplugged, and from reporting it as taken when the tracker could not observe it.

### Persistence

History is appended to `.arto/pillbox-history.jsonl`, which is already ignored by
git. Each line records the slot, date, status, opening time and duration. A
DynamoDB table is an optional extension; it is not needed for the demo.

## MCP tools

The pillbox server exposes task-level tools to clients. The raw tools from
`createArtoServer` (`set_component` in particular) are not exposed to Alexa+,
so a voice request cannot drive an arbitrary pin.

| Tool | Input | Output | Annotations | Available to |
| --- | --- | --- | --- | --- |
| `get_intake_status` | `date?` (default today) | Status for each slot, last opening, device connection. | read-only | Alexa+, agent |
| `get_intake_history` | `days` (1 to 14) | Per-day, per-slot status and adherence summary. | read-only | Alexa+, agent |
| `trigger_reminder` | `slot`, `seconds` (5 to 60, default 20) | Whether the LED and buzzer were acknowledged, or the refusal reason. | not destructive, not idempotent | Alexa+, agent |
| `stop_reminder` | none | Outputs set to 0. | idempotent | Alexa+, agent |
| `get_device_health` | none | Connection, transport kind (`serial` or `avr`), last observation times. | read-only | Alexa+, agent |
| `notify_caregiver` | `message` (max 280 characters) | SNS message id. | not idempotent | agent only |

Tool descriptions state that the result comes from a lid sensor. For example:
"Reports whether the pillbox lid was opened during each dose window. An opening
does not prove the medication was taken."

`trigger_reminder` refuses when the slot is not `pending` or `overdue`, when the
device is not ready, or when a reminder is already running. It turns off the
outputs after `seconds` or when the lid opens. The firmware interlock clears the
buzzer on its own, and the server clears the LED.

## Transport and endpoints

### Core change: `arto serve --http`

A generic HTTP mode is added to the Arto CLI and library. It is useful beyond the
pillbox and forms the Open Source contribution.

```sh
ARTO_MCP_TOKEN=... arto serve --manifest board.json --http --listen 8080 \
  [--bind 127.0.0.1] [--allowed-host pillbox.example.com] [--port /dev/ttyACM0]
```

| Flag or variable | Meaning |
| --- | --- |
| `--http` | Use Streamable HTTP instead of stdio. |
| `--listen <port>` | HTTP port. `--port` keeps its existing meaning: the serial device. |
| `--bind <address>` | Interface; defaults to `127.0.0.1`. |
| `--allowed-host <host>` | Repeatable. Accepted `Host` header values, needed behind a tunnel. Loopback hosts are always accepted. |
| `ARTO_MCP_TOKEN` | Required bearer token. The server refuses to start in HTTP mode without one. |

Implementation notes:

- Export a `createArtoHttpHandler(device, options)` function from the library so
  applications can mount it in their own express server.
- Reuse the Metro pattern: stateless `StreamableHTTPServerTransport`
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) and a new
  `McpServer` per request.
- Compare tokens with `timingSafeEqual`. Return 401 without details.
- Validate `Host` and `Origin` to block DNS rebinding.
- Answer `GET` and `DELETE` on `/mcp` with 405 in stateless mode.
- Limit request bodies to 64 KB.
- The installed SDK (`@modelcontextprotocol/sdk` 1.30.0) reports
  `LATEST_PROTOCOL_VERSION = '2025-11-25'`. A test must check that `initialize`
  negotiates this version.

### Pillbox server endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /mcp` | `Bearer <alexa token>` or `Bearer <agent token>` | Pillbox MCP tools; the token selects the tool set. |
| `GET /api/state` | none, loopback only | Dashboard state. |
| `GET /api/events` | none, loopback only | Server-sent events for the dashboard. |
| `POST /api/simulate` | control token, loopback only, emulated board only | Open or close the emulated lid for demos and tests. |
| `GET /` | loopback only | Dashboard: lid, LED, buzzer, schedule, history, recent tool calls. |

Tokens are derived like Metro's actor tokens: `HMAC-SHA256(master, actorId)` for
`alexa` and `agent`. If the Alexa+ add-on requires OAuth, a separate phase adds
an authorization layer. See [Plan: risks](plan.md#risks).

## Scheduler agent (AWS Builder)

Location: `applications/pillbox/agent/`. It is written in Python because the
Strands Agents SDK and its MCP client are most mature there.

```text
every 5 minutes (and at each slot's due and closes time):
  status = MCP get_intake_status
  for each slot:
    overdue and no reminder in the last 15 min -> trigger_reminder
    missed and caregiver not yet notified     -> notify_caregiver
    unknown                                   -> notify_caregiver once: "tracking interrupted"
```

The agent receives a system prompt with the escalation policy and uses
`strands.tools.mcp.MCPClient` with `streamablehttp_client` and the `agent` token.
The model is chosen through Amazon Bedrock (`BedrockModel`) and configured by
environment variables (`AWS_REGION`, `PILLBOX_BEDROCK_MODEL_ID`).

To keep behaviour predictable, deterministic timers decide when the agent runs, and
the server enforces all limits. The model decides what to do and writes the caregiver
message. For example: "Morning pills: the pillbox was not opened between 07:00 and
11:00. Two reminders were played at 09:00 and 09:15."

Optional deployment: package the agent for Amazon Bedrock AgentCore Runtime and
trigger it with Amazon EventBridge Scheduler. The local timer is enough for the demo.

## AWS services

| Service | Use | Required for demo |
| --- | --- | --- |
| Amazon Bedrock | Model behind the Strands agent. | Yes |
| Strands Agents SDK | Agent loop and MCP client. | Yes |
| Amazon SNS | SMS or email to the caregiver. | Yes, email is simplest |
| Amazon Bedrock AgentCore Runtime | Hosted agent. | Optional |
| Amazon EventBridge Scheduler | Cloud timer for the hosted agent. | Optional |
| AWS App Runner or Amazon ECS on Fargate | Hosted emulated pillbox for judges and backup. | Optional |

IAM: one least-privilege user or role with `bedrock:InvokeModel` on the chosen model
and `sns:Publish` on one topic. Credentials stay in the environment or an AWS profile
and are never committed.

## Public exposure

| Mode | Board | Exposure | Use |
| --- | --- | --- | --- |
| Local | Physical Uno over USB | Cloudflare Tunnel or ngrok to `127.0.0.1:<port>` | Video and live Alexa+ tests. |
| Hosted | Emulated Uno (AVR8js) | Container on App Runner or Fargate with HTTPS | Always-on backup, judges. |

In both modes, only `/mcp` is reachable publicly. `/api/*` and the dashboard stay on
loopback, or behind the hosted service's own access control.

## Security and safety

- Every MCP request requires a bearer token. The server does not start without a master token.
- Alexa+ tools cannot write arbitrary pins. `set_component` is not exposed.
- Reminder duration and frequency are bounded on the server.
- The firmware interlock and watchdog bound the buzzer independently of software.
- No personal health data leaves the machine except the caregiver message sent through SNS.
- The project is a demonstration and not a medical device. The README and video say so.
