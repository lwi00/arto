# Arto

**Arduino Tool Orchestration** connects MCP-compatible agents to Arduino sensors
and actuators. The framework provides typed tools, a hardware manifest, an
observable command bridge and Arduino Uno firmware. It has no model or agent
harness dependency.

## Quick start

Requires Node.js 22 or later.

```sh
npm ci
npm run build
node dist/cli.js doctor --manifest examples/button-led/board.json
node dist/cli.js serve --manifest examples/button-led/board.json
```

The default transport runs the bundled firmware in AVR8js. Hardware emulation
requires no account, API key or compiler. To connect a physical Uno, flash the
[firmware](firmware/README.md) and pass `--port <serial-device>`.

## Connect an MCP client

Use absolute paths in your client's configuration:

```json
{
  "mcpServers": {
    "arto": {
      "command": "node",
      "args": ["/path/to/arto/dist/cli.js", "serve", "--manifest", "/path/to/board.json"]
    }
  }
}
```

Arto uses MCP stdio. Client configuration syntax may vary.

| Tool | Purpose |
| --- | --- |
| `describe_board` | Discover declared components, connections and limits. |
| `get_state` | Read cached values with timestamps and connection status. |
| `read_component` | Read a component through the firmware. |
| `set_component` | Set a declared output within its permitted range. |
| `get_events` | Read device events after a cursor. |
| `emergency_stop` | Set configured outputs to LOW/0. |

A board resource and an `onboard` prompt expose device context. The harness owns
agent scheduling. Firmware acknowledgments, output readback and independent
physical measurements are distinct.

## Configure and extend

- `arto init board.json`: create a button/LED manifest without overwriting a file.
- `arto validate board.json`: validate a manifest.
- `arto ports`: list serial devices.
- [Architecture](docs/architecture.md): public API and extension points.
- [Manifest and protocol](docs/protocol.md): supported capabilities and serial messages.
- [Onboarding skill](skills/onboard/SKILL.md): configure a device with an agent.
- [Metro application](applications/metro/README.md): a separate multi-agent example.

The `arto` command is available after installing a package built with `npm pack`.
The package has not been published to npm.

## Development

```sh
npm run build
npm test
npm run build:metro
npm pack
```

Keep domain rules and harness integrations inside applications. Changes to the
protocol should include matching firmware and transport tests. Avoid committing
credentials, generated outputs or device logs.

MIT. Bundled firmware dependencies and application artwork retain their own
licenses; see [firmware](firmware/README.md) and [asset sources](applications/metro/data/SOURCES.md).
