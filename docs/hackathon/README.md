# Amazon Developer Hackathon 2026: Arto Pillbox

This folder plans the hackathon entry built on Arto. It is a working plan, not
user documentation. The application and core changes it describes do not exist yet.

| Document | Contents |
| --- | --- |
| [Plan](plan.md) | Phases, tasks, acceptance criteria, schedule and risks. |
| [Pillbox architecture](pillbox-architecture.md) | Hardware, manifest, domain model, MCP tools, agent, AWS and security. |
| [Demo and submission](demo-and-submission.md) | Video script, submission checklist, feedback and friction log templates. |

## Summary

**Arto Pillbox** is a connected pillbox built from an Arduino Uno, a lid switch,
an LED and a buzzer. Arto exposes it as an MCP server over Streamable HTTP so
Alexa+ can answer questions such as "Did Mum take her morning pills?" and trigger
a reminder. A Strands agent running on Amazon Bedrock watches the schedule, acts
when a dose is missed and notifies a caregiver.

The pillbox illustrates Arto's broader claim: agentic home automation needs only a
wiring manifest. It does not require device-specific server code, and safety limits
stay in the manifest and firmware rather than in the model.

## Entry

| Item | Choice |
| --- | --- |
| Primary track | Alexa+: self-hosted MCP server, spec 2025-11-25, Streamable HTTP. |
| Fallback path | Simulated Alexa+ experience in a web app, if Alexa+ add-on access is unavailable. |
| Mini challenge | AWS Builder: Strands Agents SDK, Amazon Bedrock and Amazon SNS. |
| Mini challenge | Open Source: generic Streamable HTTP transport for Arto, MIT licensed. |
| Priority category | Caretaking and accessibility. |

Each project can win one track prize and one mini challenge prize.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Use case | Pillbox for a person living alone, with a remote caregiver. | Concrete, easy to film and aligned with the caretaking priority. |
| Hardware | Physical Uno for the video; AVR8js emulation for development and fallback. | The user owns an Uno. The emulator removes hardware from the critical path. |
| Firmware | No firmware change. | Existing `digital-input` and `digital-output` kinds and interlocks cover the design. |
| Actuators | LED and active buzzer. No servo. | Arto declarations do not include servo drivers. |
| Public access | Tunnel to the local server for the physical board; AWS-hosted emulated board as a backup. | Alexa+ calls the MCP server from the Amazon cloud. |
| Documentation language | English. | Required for the video and submission; the repository is reviewed by Amazon judges. |

## Open questions

| Question | Blocks | Owner |
| --- | --- | --- |
| Can the account access Alexa+ add-ons and the MCP toolkit? Which locales? | Phase 3 path choice. | User |
| Does the Alexa+ add-on require OAuth or account linking, or is a static bearer token enough? | Phase 1 auth design. | User, from the Alexa+ MCP QuickStart |
| Is there an Alexa+ test simulator, or is an Echo device required? | Phase 3 testing and video. | User |
| Exact submission deadline and time zone. | Schedule. | User |
| Which Bedrock model is enabled in which AWS Region? | Phase 4. | User |
| Is the reed switch available, or will the push button stand in for the lid? | Phase 2 wiring. | User |

The Amazon developer documentation and the Devpost pages were not reachable from the
environment that wrote this plan. Every Alexa+ requirement below should be checked
against the official QuickStart before implementation.

## Pre-existing work

Arto existed before the hackathon. The baseline is commit `3b87b01`
("docs: document setup, device protocol and extension points"). It contains the
core framework, stdio MCP server, Uno firmware, AVR8js and serial transports and
the Metro example. Everything built for the entry is developed on a dedicated
branch so the submission can list the changes precisely. See
[Demo and submission](demo-and-submission.md#pre-existing-project-disclosure).
