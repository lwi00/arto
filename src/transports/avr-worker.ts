import { parentPort, workerData } from 'node:worker_threads';
import { CPU, avrInstruction, AVRIOPort, portBConfig, portCConfig, portDConfig, AVRTimer,
  timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config, AVRADC, adcConfig } from 'avr8js';

const program = new Uint8Array(32768);
let base = 0;
for (const raw of (workerData.hex as string).trim().split(/\r?\n/)) {
  if (!raw.startsWith(':')) throw new Error('Invalid Intel HEX');
  const bytes = Buffer.from(raw.slice(1), 'hex');
  if (bytes.length !== bytes[0] + 5 || (bytes.reduce((a, b) => a + b, 0) & 255) !== 0) throw new Error('Invalid HEX checksum');
  const length = bytes[0], address = bytes.readUInt16BE(1), type = bytes[3];
  if (type === 0) {
    if (base + address + length > program.length) throw new Error('Firmware exceeds Uno flash');
    program.set(bytes.subarray(4, 4 + length), base + address);
  } else if (type === 4) base = bytes.readUInt16BE(4) << 16;
  else if (type === 1) break;
}
const cpu = new CPU(new Uint16Array(program.buffer));
const portB = new AVRIOPort(cpu, portBConfig);
const portC = new AVRIOPort(cpu, portCConfig);
const portD = new AVRIOPort(cpu, portDConfig);
new AVRTimer(cpu, timer0Config); new AVRTimer(cpu, timer1Config); new AVRTimer(cpu, timer2Config);
new AVRADC(cpu, adcConfig);
const uart = new AVRUSART(cpu, usart0Config, 16_000_000);
uart.onLineTransmit = line => parentPort!.postMessage({ type: 'line', line: line.trim() });
const incoming: number[] = [];
parentPort!.on('message', (message: { type: string; line?: string; pin?: number; value?: boolean }) => {
  if (message.type === 'send') incoming.push(...Buffer.from(message.line!));
  if (message.type === 'input') {
    const pin = message.pin!;
    const port = pin < 8 ? portD : pin < 14 ? portB : portC;
    port.setPin(pin < 8 ? pin : pin < 14 ? pin - 8 : pin - 14, message.value!);
  }
});
for (const [port, offset] of [[portD, 0], [portB, 8], [portC, 14]] as const) {
  port.addListener((value, old) => {
    for (let bit = 0; bit < 8; bit++) if ((value ^ old) & (1 << bit)) {
      parentPort!.postMessage({ type: 'gpio', pin: offset + bit, value: Number(Boolean(value & (1 << bit))), cycles: cpu.cycles });
    }
  });
}
let ready = false;
let nextRxCycle = 0;
const started = performance.now();
const clockScale = workerData.clockScale ?? 1;
function tick() {
  const target = Math.min(cpu.cycles + 64000, (performance.now() - started) * 16000 * clockScale);
  while (cpu.cycles < target) {
    // Pace bytes at the configured baud rate and admit them at an interrupt-safe
    // boundary. This preserves full-duplex lines during asynchronous GPIO reports.
    if (incoming.length && uart.rxEnable && cpu.interruptsEnabled && cpu.cycles >= nextRxCycle && !uart.rxBusy && !(cpu.data[usart0Config.UCSRA] & 0x80)) {
      uart.writeByte(incoming.shift()!, true);
      nextRxCycle = cpu.cycles + Math.ceil(16_000_000 * 10 / uart.baudRate);
      cpu.tick();
    }
    avrInstruction(cpu); cpu.tick();
  }
  if (!ready && uart.rxEnable && cpu.cycles > 160000) { ready = true; parentPort!.postMessage({ type: 'ready' }); }
  setTimeout(tick, 1);
}
tick();
