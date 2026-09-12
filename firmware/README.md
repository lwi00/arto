# Uno firmware

`arto.hex` is compiled for the ATmega328P. The sketch is in `arto/arto.ino`.
AVR8js uses the bundled binary; a compiler is needed only to rebuild it.

## Build and flash

Run from the repository root with Arduino CLI:

```sh
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli compile --fqbn arduino:avr:uno --output-dir firmware/build firmware/arto
cp firmware/build/arto.ino.hex firmware/arto.hex
arduino-cli upload --fqbn arduino:avr:uno --input-dir firmware/build --port /dev/your-port
```

The serial link uses 115200 baud. See the [protocol reference](../docs/protocol.md)
for commands, replies and interlocks.

## Behavior

- Pins 0 and 1 are reserved for serial.
- Unknown commands and overlong lines are rejected.
- After five seconds of firmware time without contact, the watchdog clears outputs.
- Up to eight digital-input interlocks can block and clear outputs without an agent.
- Digital readback reports pin state; PWM replies report the configured setpoint.

The USB adapter requires testing on the actual board and wiring. Emulation does
not validate electrical behavior or real-time performance.

## Dependencies

The sketch is MIT. The binary links Arduino AVR core 1.8.8, licensed under
LGPL-2.1-or-later. [Arduino core source](https://github.com/arduino/ArduinoCore-avr)
and the commands above allow rebuilding with a modified core.
[AVR8js](https://github.com/wokwi/avr8js) is MIT.
