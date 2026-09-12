# Metro application

A Line 13 simulation built on Arto. Each train has an emulated Uno, a scoped MCP
endpoint and a Codex agent. A central control agent coordinates the fleet through
messages and departure clearances. Model code lives in this application, not in Arto.

## Run

Requires Node.js 22 or later and a signed-in Codex CLI.

From the repository root:

```sh
npm ci
npm run build
codex login status
ARTO_TRAIN_COUNT=2 npm run dev
```

Open http://127.0.0.1:4313. Omit `ARTO_TRAIN_COUNT` to use 52 trains. Each train
can invoke the model, subject to account limits and network latency. The application
reuses the local Codex login and excludes personal plugins and configuration.

For a built frontend:

```sh
npm run build:metro
ARTO_TRAIN_COUNT=2 npm run start:metro
```

The first start or build downloads MF77 artwork locally. See [sources](data/SOURCES.md).

## Use

1. Select a train and an incident, then press **Start**.
2. Inspect the onboard inputs, agent messages and motor state.
3. Press **Resolve** to restore the simulated input.
4. The train requests clearance. Control can authorize departure; local firmware
   interlocks must also permit it.

The 16 scenarios include partial restoration, recurring faults and radio loss.
Use **Messages** and **Actions** to follow decisions and results. Operator
instructions can target a train or Control. **Reset** restores initial conditions.

## Configuration

Export variables before starting; `.env.example` lists the available settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4313` | Local HTTP port. |
| `ARTO_TRAIN_COUNT` | `52` | Fleet size, from 2 to 66. |
| `ARTO_AGENT_CONCURRENCY` | `8` | Concurrent model runs, capped at 12. |
| `ARTO_MODEL` | Codex default | Model available to the signed-in account. |
| `ARTO_CODEX_BIN` | `codex` | Compatible CLI executable. |
| `ARTO_MCP_TOKEN` | Generated | Optional master token for another local MCP client. |

## MCP and authority

Endpoints `/mcp/rame_a`, `/mcp/rame_b`, `/mcp/rame_03` onward and `/mcp/pcc` use
Streamable HTTP. Each actor has its own token and tools. A train can access only
its own board. Control receives reports and published positions, not private sensors.

With an explicit master token, each actor token is HMAC-SHA256(master token,
actor ID), hex encoded. Send it as `Authorization: Bearer <actor-token>`.
The application schedules agent runs when messages or sensor events arrive.
ACKs do not trigger reply loops. Logs are written to the ignored `.arto/` directory.

A clearance expires after three minutes and is revoked by a new fault or hold.
Keep this application on loopback; it is not a publicly authenticated service.

## Model limits

Positions and service times are simplified. MF77 is a vehicle model; train numbers
are local simulation identifiers. The 52-train profile uses historical references,
not live operations. Emulated CPU time is scaled for large fleets; the service
clock is separate. This is not a validated railway control system.

See [fleet assumptions](data/fleet-sizing.md) and [data sources](data/SOURCES.md).
