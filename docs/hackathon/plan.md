# Plan

The target is 1 to 3 weeks. The schedule below assumes about 15 working days and
puts every demo-critical item in the first 10. Days are relative (D1 = first day of
work) until the exact deadline is known.

## Phases

| Phase | Days | Outcome | Demo-critical |
| --- | --- | --- | --- |
| 0. Verify access | D1 | Alexa+ path chosen, AWS Region and model chosen. | Yes |
| 1. Core HTTP transport | D1 to D3 | `arto serve --http` and `createArtoHttpHandler`, with tests. | Yes |
| 2. Pillbox application | D3 to D7 | Manifest, tracker, MCP tools, dashboard, emulated and physical board. | Yes |
| 3. Alexa+ integration | D6 to D9 | Alexa+ calls the pillbox through a tunnel, or the simulated path works. | Yes |
| 4. Strands and Bedrock agent | D8 to D11 | Missed-dose reminders and caregiver email via SNS. | Yes, for AWS Builder |
| 5. Hosted backup | D11 to D12 | Emulated pillbox on AWS with HTTPS. | No |
| 6. Documentation and Open Source | D10 to D13 | Final READMEs, contribution write-up, license check. | Yes |
| 7. Video and submission | D12 to D15 | Video under 3 minutes, feedback, friction log, collaborators invited. | Yes |

Record friction log entries throughout, not at the end.

## Phase 0: Verify access

Tasks:

1. Read the Alexa+ MCP QuickStart and Toolkit Overview.
2. Record answers to the [open questions](README.md#open-questions): locale, auth model, simulator, add-on submission steps.
3. In AWS, enable one Bedrock model in one Region and note its model id.
4. Create an SNS topic and confirm an email subscription.
5. Install a tunnel client (`cloudflared` or `ngrok`) and check that it exposes a local port over HTTPS.

Exit criteria: one of the paths below is chosen.

| Path | Condition | Consequence |
| --- | --- | --- |
| A. Real Alexa+ add-on | Access granted in a usable locale. | Phase 3A. |
| B. Simulated Alexa+ | No access, or access comes too late. | Phase 3B. Still eligible for the Alexa+ track. |

Start phases 1 and 2 without waiting for this answer; they are needed on both paths.

## Phase 1: Core HTTP transport

Files: `src/http.ts` (new), `src/index.ts`, `src/cli.ts`, `tests/critical/http.test.ts`,
`README.md`, `docs/architecture.md`.

Tasks:

1. Implement `createArtoHttpHandler(device, { token, allowedHosts, createServer? })`.
   It returns an express-compatible request handler. `createServer` lets
   applications supply their own `McpServer` factory; it defaults to `createArtoServer`.
2. Add a CLI mode: `--http`, `--listen`, `--bind`, repeatable `--allowed-host` and `ARTO_MCP_TOKEN`.
3. Decide whether to add express to the core's dependencies or to use `node:http`.
   Preference: `node:http`, to keep the core small. The SDK transport accepts Node request and response objects.
4. Tests against the emulated board:
   - `initialize` negotiates protocol `2025-11-25`;
   - `tools/list` returns the six core tools;
   - `read_component` works over HTTP;
   - a missing or wrong token gets 401;
   - a foreign `Host` gets 403;
   - `GET /mcp` gets 405;
   - HTTP mode refuses to start without a token.
5. Document the mode in `README.md`, including the client configuration for a remote MCP URL.

Acceptance: `npm test` passes, and the MCP Inspector connects to
`http://127.0.0.1:8080/mcp` with the token and calls `read_component`.

## Phase 2: Pillbox application

Files: `applications/pillbox/` (new workspace), following Metro's layout.

```text
applications/pillbox/
  README.md
  package.json
  board.json
  schedule.json
  .env.example
  server/
    index.ts          express app, token routing, dashboard API
    tracker.ts        polling, debounce, slot status, history
    pillbox-mcp.ts    task-level MCP tools
    reminders.ts      bounded reminder runs
    notify.ts         SNS publisher (agent tool)
  web/                small dashboard (static HTML and JS, no framework)
  agent/              Python Strands agent (phase 4)
  tests/
```

Tasks:

1. Write the manifest and validate it with `arto validate`.
2. Write the tracker as a pure state machine over `(time, lid reading)` so it can be
   tested without hardware. Inject time for tests.
3. Write the MCP tools with Zod schemas and descriptions that state the sensor limit.
4. Build the server with token-based tool sets (`alexa`, `agent`) and loopback-only dashboard routes.
5. Build the dashboard: lid state, outputs, today's slots, history, last ten tool calls.
6. Add emulated lid control (`/api/simulate`) using `AvrTransport.setInput`.
7. Wire the physical board and test with `--port`.
8. Tests:
   - tracker transitions (`pending` → `overdue` → `opened`/`missed`, and `unknown` on disconnect);
   - debounce and minimum open time;
   - reminder bounds and refusals;
   - interlock clears the buzzer when the lid opens (emulated).

Acceptance: on the physical board, opening the lid during a window marks the slot as
`opened`, `trigger_reminder` lights the LED and sounds the buzzer, and opening the lid
silences the buzzer through the firmware interlock.

## Phase 3A: Real Alexa+ add-on

Tasks:

1. Start the pillbox server and the tunnel. Record the public URL.
2. Register the add-on with the MCP endpoint and the `alexa` token, following the QuickStart.
3. Test the utterances from the [demo script](demo-and-submission.md#video-script).
4. Adjust tool names and descriptions if Alexa+ routes requests poorly. Log each change in the friction log.
5. Record the add-on configuration steps in `applications/pillbox/README.md`.

Acceptance: the three demo utterances work end to end against the physical board.

## Phase 3B: Simulated Alexa+ experience

Tasks:

1. Add a web page with push-to-talk, using the browser Web Speech API for speech-to-text and text-to-speech.
2. Send the transcript to a Bedrock model through a small server route. The model gets
   the pillbox MCP tools through the same `/mcp` endpoint and `alexa` token.
3. Show the transcript, tool calls and spoken answer, clearly labelled "Simulated Alexa+ experience".

Acceptance: the same three utterances work, and the repository contains the simulation's source.

## Phase 4: Strands and Bedrock agent

Tasks:

1. Create `applications/pillbox/agent/` with `pyproject.toml`, pinned dependencies,
   `.env.example` and `README.md`.
2. Implement the loop from [the architecture](pillbox-architecture.md#scheduler-agent-aws-builder):
   deterministic timer, `MCPClient` over Streamable HTTP, `BedrockModel`.
3. Implement the server tool `notify_caregiver` with the AWS SDK for JavaScript (`@aws-sdk/client-sns`).
   Cap it at one message per slot and day.
4. Add a `--once` flag to run a single check, for tests and the video.
5. Add a `--dry-run` flag that prints the caregiver message instead of publishing it.

Acceptance: with the clock inside the `overdue` window, one run triggers a reminder.
With the clock after `closes`, one run publishes one email.

## Phase 5: Hosted backup (optional)

Tasks:

1. Add a `Dockerfile` for the pillbox server in emulated mode.
2. Deploy to App Runner or Fargate. Store the master token in AWS Secrets Manager or as a service secret.
3. Point a second Alexa+ test configuration or the simulated page at it.

## Phase 6: Documentation and Open Source

Tasks:

1. Finalize the READMEs: root `README.md`, `applications/pillbox/README.md`, `agent/README.md`.
2. Update `docs/architecture.md` and `docs/protocol.md` for HTTP mode.
3. Decide what the Open Source submission is. Suggested option: a separate public repository,
   `arto-pillbox`, MIT licensed, containing the application and depending on `arto-mcp`.
   It is a new project alongside the primary submission. A pull request to a public repository,
   for example an example for the Strands samples, is an alternative.
4. Check the license files and asset sources.

## Phase 7: Video and submission

See [Demo and submission](demo-and-submission.md).

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| No Alexa+ add-on access, or none in the user's locale. | Medium | High | Path B is explicitly allowed. Decide on D1. |
| Alexa+ requires OAuth or account linking instead of a bearer token. | Medium | Medium | Keep auth behind one function. Add an OAuth authorization server (for example Amazon Cognito) only if required. |
| Tunnel URL changes between sessions. | High with free ngrok | Low | Use a named Cloudflare Tunnel, or update the add-on before recording. |
| Alexa+ picks the wrong tool or rephrases the answer. | Medium | Medium | Few tools, precise descriptions, structured results with a short `summary` field. |
| Bedrock model not enabled in the chosen Region. | Low | Medium | Check in phase 0. |
| Hardware failure during recording. | Low | Medium | Emulated board and dashboard as backup footage. |
| Claims read as medical advice. | Low | High | Say "the pillbox was opened". Add a not-a-medical-device statement. |
| Scope creep: extra tracks or features. | Medium | High | One track. Phase 5 and optional items only after phase 4 passes. |

## Out of scope

- Voice-editable schedules.
- More than two compartments.
- Servo-driven dispensing (no driver in Arto).
- Ring, Fire TV or Bee integrations.
- Multi-user accounts.
