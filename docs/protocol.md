# Manifest and protocol

## Manifest

A JSON manifest uses `schemaVersion: 1`, a device `id`, `name`, `board:
"arduino-uno"` and a `components` array. See the
[button/LED example](../examples/button-led/board.json).

Each component has a unique `id`, a readable `label`, a unique `pin` and a `kind`:

| Kind | Values | Pins |
| --- | --- | --- |
| `digital-input` | 0 or 1 | 2 through 19 |
| `analog-input` | 0 through 1023 | 14 through 19, corresponding to A0 through A5 |
| `digital-output` | 0 or 1 | 2 through 19 |
| `pwm-output` | 0 through 255 | 3, 5, 6, 9, 10, 11 |

Optional fields: `description`, `unit`, `min`, `max`, `safeValue` and `pullup`.
The supported fallback is LOW/0. Pins 0 and 1 are reserved for serial.
Declarations do not implement drivers for devices such as DHT22 sensors or servos.

Up to eight `interlocks` can link a digital input to an output:

```json
{"input": "door_closed", "output": "traction", "blockedValue": 0}
```

Both identifiers must refer to declared components. A blocked input prevents
nonzero writes and clears an active output in the firmware.

## Serial messages

Serial runs at 115200 baud. Each ASCII request ends with a newline and starts
with a numeric request ID. Input lines are limited to 63 characters before the newline.

| Request | Operation |
| --- | --- |
| `id h` | Hello or heartbeat; identifies protocol version 1. |
| `id m pin mode` | Configure mode: 0 input, 1 output, 2 input with pullup. |
| `id r pin` | Read a digital pin. |
| `id a pin` | Read an analog pin. |
| `id w pin value` | Write a digital output. |
| `id p pin value` | Set PWM duty cycle. |
| `id i inputPin outputPin blockedValue` | Register a firmware interlock. |
| `id s` | Clear configured outputs. |

Replies are JSON lines containing `id`, `ok` and `value` or `error`. Firmware
events include `watchdog` and `interlock`. After five seconds of firmware time
without contact, the watchdog clears outputs. The host sends periodic heartbeats.
