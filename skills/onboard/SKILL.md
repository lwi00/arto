---
name: onboard
description: Configure an Arduino device for Arto MCP, validate its declared wiring and establish a verified first interaction. Use when connecting a board or changing components.
---

# Onboard an Arto device

Reuse an existing manifest and MCP client when available. For a new setup:

1. Run `arto init board.json` to create the button/LED template.
2. Ask for missing component types, connections and intended behavior. A USB
   device identity does not reveal its wiring.
3. Set semantic component IDs, labels, pins, kinds, ranges and units. Run
   `arto validate board.json`.
4. Run `arto doctor --manifest board.json`. The default uses AVR8js; add
   `--port <path>` for the selected physical Uno. `arto ports` lists devices.
5. Connect the client to `arto serve --manifest <absolute-path>`. Call
   `describe_board`, then `read_component` on a relevant input.
6. If an output test is authorized, call `set_component`, verify the response
   and readback, then restore LOW/0. Choose a test appropriate to the hardware.

Supported kinds are digital-input, analog-input, digital-output and pwm-output.
Analog pins A0 through A5 map to 14 through 19; pins 0 and 1 are reserved. Each
pin has one owner. PWM requires a hardware PWM pin. The supported fallback is
LOW/0. A DHT22, servo or display requires its own driver; labels do not add drivers.

Return the manifest path, launch command, observed results and remaining limits.
Distinguish declared wiring, firmware acknowledgment and physical validation.
On later launches, reuse the configuration. The harness owns agent scheduling.
