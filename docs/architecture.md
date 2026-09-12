# Architecture

Arto separates agent tooling from hardware access:

```text
MCP client -> MCP tools -> ArtoDevice -> DeviceTransport -> Uno firmware
                              ^                                |
                              +------ replies and events ------+
```

## Public API

Import these exports from `arto-mcp`:

| Export | Responsibility |
| --- | --- |
| `parseManifest`, `manifestSchema` | Validate component declarations and interlocks. |
| `ArtoDevice` | Serialize commands, track observations and enforce write constraints. |
| `DeviceTransport` | Base connection contract: `open`, `send`, `close`. |
| `AvrTransport` | Execute compiled Uno firmware in an AVR8js worker. |
| `SerialTransport` | Connect to a physical board over USB serial. |
| `createArtoServer` | Expose a device through MCP. |
| `toolCall`, `toolResult` | Build consistent application tool responses. |

Transports emit `line`, `fault` and `closed`. `ArtoDevice` emits `event` with a
sequence number and timestamp. AVR8js also emits `gpio` output changes and
supports digital input injection through `setInput`.

## Execution boundaries

- A manifest declares wiring; it does not discover or electrically verify it.
- `beforeWrite` applies application-specific constraints when a command executes.
- Firmware interlocks independently reject nonzero outputs while an input is blocked.
- A command timeout puts the device in a fault state. Writes are not retried automatically.
- Cached readings have timestamps. A PWM reply confirms a setpoint, not a measured voltage.
- The event buffer is bounded. `get_events` reports when a requested cursor is too old.

Applications own objectives, domain models, persistence, message routing and
agent wakeups. The core does not import application code or an AI provider.
The metro example adds scoped MCP endpoints and a Codex-based scheduler.
