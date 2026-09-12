import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { DeviceTransport } from './transport.js';

export class AvrTransport extends DeviceTransport {
  readonly kind = 'avr8js';
  private worker?: Worker;
  constructor(readonly firmware: string | URL = new URL('../../firmware/arto.hex', import.meta.url), readonly options: { clockScale?: number } = {}) { super(); }
  async open(): Promise<void> {
    if (this.worker) throw new Error('Transport already open');
    const hex = await readFile(this.firmware, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const scale = this.options.clockScale ?? 1;
      if (!Number.isFinite(scale) || scale <= 0 || scale > 4) { reject(new Error('clockScale must be between 0 and 4')); return; }
      const worker = new Worker(new URL('./avr-worker.js', import.meta.url), { workerData: { hex, clockScale: scale }, execArgv: [] });
      this.worker = worker;
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error('AVR boot timed out')); }, 5000);
      worker.on('message', message => {
        if (message.type === 'ready') { clearTimeout(timer); resolve(); }
        if (message.type === 'line') this.emit('line', message.line);
        if (message.type === 'gpio') this.emit('gpio', message);
      });
      worker.on('error', error => { clearTimeout(timer); reject(error); this.emit('fault', error); });
      worker.on('exit', () => { clearTimeout(timer); this.worker = undefined; this.emit('closed'); });
    });
  }
  async send(line: string) {
    if (!this.worker) throw new Error('AVR transport is closed');
    this.worker.postMessage({ type: 'send', line });
  }
  setInput(pin: number, value: boolean) {
    if (!this.worker) throw new Error('AVR transport is closed');
    this.worker.postMessage({ type: 'input', pin, value });
  }
  async close() { const worker = this.worker; this.worker = undefined; if (worker) await worker.terminate(); }
}
