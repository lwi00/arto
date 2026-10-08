# Draft — Arto launch article

> Status: first draft. `[TODO]` marks anything that depends on the demo we have
> not built yet. Every technical claim below matches the current repo.

---

## Title options

- **Give your AI agent an Arduino**
- Agents can call APIs. Now they can flip a switch.
- We let an LLM drive real hardware. Here's what stops it from breaking things.

**Subtitle:** Arto is an open-source MCP server that turns a $20 Arduino Uno into
typed tools any agent can use, with safety enforced in the firmware rather than the prompt.

---

## Article

Every agent framework can send an email. Almost none can turn on a light.

That gap is strange. A $20 microcontroller and a USB cable are enough to give an
agent sensors and motors. But wiring the two together usually means one of
these:

- a pile of one-off Python scripts
- a custom serial protocol
- a prompt that says *please don't set the motor to 255*

We built **Arto** to make this boring. Arto is an open-source MCP server for the
Arduino Uno. You describe your wiring in a JSON file, flash our firmware and
point any MCP client at it. Claude, Codex, Cursor or your own agent then gets a
small set of typed tools for reading sensors and driving outputs.

[TODO: hero GIF — the agent in a terminal on the Mac, the board on the desk, something physical happening.]

### What it looks like

Here's the whole configuration for a button and an LED:

```json
{
  "schemaVersion": 1,
  "id": "button-led",
  "name": "Button and LED",
  "board": "arduino-uno",
  "components": [
    { "id": "button", "label": "Push button", "pin": 2, "kind": "digital-input", "pullup": true },
    { "id": "led", "label": "Built-in LED", "pin": 13, "kind": "digital-output" }
  ]
}
```

That's it. No driver code, no sketch to write. Arto validates the manifest,
configures the pins through the firmware and exposes six tools:

| Tool | What the agent does with it |
| --- | --- |
| `describe_board` | Learn what's connected, where, and within which limits |
| `read_component` | Read a sensor through the firmware |
| `get_state` | Read cached values, with timestamps |
| `set_component` | Drive an output, only within its declared range |
| `get_events` | Catch up on what happened on the device |
| `emergency_stop` | Set every output to a safe state |

The agent never sees a pin number it wasn't given, and it can't write a value
outside the declared `min`/`max`.

### The demo

[TODO: pick the build from the kit. Options: a fan whose lid switch acts as an
interlock, a night light driven by a photoresistor, or an "alarm" with a
button and a buzzer.]

[TODO: 30–60 s video]
1. We ask the agent in plain English to do something.
2. It calls `describe_board`, reads the sensor, sets the output and reads it back.
3. We trip the interlock by hand, and the output stops with no help from the agent.
4. We kill the agent process. Five seconds later the board shuts its outputs off by itself.

**[Try it in your browser →](TODO-link)** The demo runs the real Arto firmware
on an emulated Uno, with a real agent driving it. No board, no signup.

### Safety lives in the firmware, not the prompt

The interesting part of putting an LLM on a USB cable isn't the happy path.
It's what happens when the agent is wrong, slow, or gone. We designed Arto
around one rule: **the agent is never the last line of defense.**

That rule turns into five layers:

- **Declared limits.** The host rejects any write outside the manifest. PWM is
  only accepted on hardware PWM pins, and each pin has exactly one owner.
- **Firmware interlocks.** You can link an input to an output, for example "door
  open blocks the motor". The check runs *on the Uno*: it rejects nonzero writes
  and clears an output that's already active. Even a perfectly crafted serial
  command can't override it.
- **Watchdog.** If the board hears nothing from the host for five seconds, it
  clears every output. A crashed agent, a hung process or a pulled cable all end
  the same way: off.
- **No silent retries.** If a command times out, the device enters a fault state
  and stays there. We'd rather surface an error than have a motor start twice.
- **Honest observations.** A firmware acknowledgment, a readback and a physical
  measurement are three different things, and Arto reports them separately. A
  PWM reply confirms a *setpoint*, not a voltage. Readings carry timestamps so
  the agent knows how stale they are.

None of these layers depend on the model behaving well. That's the point.

### Try it in 60 seconds, without a board

Arto ships with an emulator. The bundled firmware runs inside
[AVR8js](https://github.com/wokwi/avr8js), so you need neither a compiler, an
account nor an API key:

```sh
git clone https://github.com/lwi00/arto && cd arto
npm ci && npm run build
node dist/cli.js doctor --manifest examples/button-led/board.json
node dist/cli.js serve  --manifest examples/button-led/board.json
```

Add it to your MCP client, then ask *"what's on this board?"*. When you're ready
for real hardware, flash the firmware and add `--port /dev/cu.usbmodem…`. The
manifest and the tools stay the same.

Arto also ships an onboarding skill. Your agent can interview you about your
wiring, write the manifest, validate it and run a first safe test on its own.

### How it's built

```text
MCP client → MCP tools → ArtoDevice → DeviceTransport → Uno firmware
                             ↑                               │
                             └────── replies and events ─────┘
```

- **TypeScript, Node 22, MCP over stdio.**
- **A plain-text serial protocol** (`id w 13 1` → `{"id":…,"ok":true}`). You can debug it with a serial monitor.
- **Swappable transports.** A serial transport drives physical boards and an AVR8js transport drives the emulator. Both share the same interface.
- **No AI dependency.** The core imports no model SDK. Scheduling, prompts and domain logic belong to your app.

### What it doesn't do (yet)

- **Arduino Uno only.**
- **No drivers for complex peripherals.** Servos, DHT22 sensors and displays aren't supported. Today you get digital in/out, analog in and PWM.
- **Not on npm yet.** For now you run it from the repo.
- **The manifest describes your wiring; it can't verify it.** If you say the LED is on pin 13 and it's on pin 12, Arto will believe you.

### What's next

[TODO: the real roadmap, e.g. more boards (ESP32, Pico), servo support, npm package.]

We'd love feedback, especially from people who've connected agents to the
physical world: what broke, what scared you, and what you wish existed.

**GitHub:** https://github.com/lwi00/arto (MIT)

---

## Show HN post

**Title:** `Show HN: Arto – Give your AI agent an Arduino (MCP, firmware-level interlocks)`

**URL:** the playable demo (or the repo)

**First comment:**

> Hi HN — we built Arto because we wanted agents to touch real hardware without
> trusting the prompt to keep things safe.
>
> It's an MCP server plus firmware for the Arduino Uno. You describe your wiring
> in JSON, and any MCP client gets typed tools (read sensor, set output,
> emergency stop). Safety is enforced on the board itself: interlocks linking
> inputs to outputs, a 5-second watchdog that cuts outputs if the host goes
> quiet, and no automatic retries after a timeout.
>
> You can try it without hardware. The firmware runs in an AVR8js emulator, in
> the browser demo and in the CLI.
>
> Uno only for now, with digital/analog/PWM I/O. We'd love to hear what you'd
> plug into it, and where you think the safety model falls short.
