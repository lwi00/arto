import { SerialPort } from 'serialport';
import { DeviceTransport } from './transport.js';

export class SerialTransport extends DeviceTransport {
  readonly kind = 'usb-serial';
  private port?: SerialPort;
  constructor(readonly path: string) { super(); }
  static list() { return SerialPort.list(); }
  async open() {
    if (this.port) throw new Error('Transport already open');
    const port = new SerialPort({ path: this.path, baudRate: 115200, autoOpen: false }); this.port = port;
    let buffer = '';
    port.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 8192) { buffer = ''; this.emit('fault', new Error('Serial frame too large')); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        this.emit('line', buffer.slice(0, end).trim()); buffer = buffer.slice(end + 1);
      }
    });
    port.on('error', error => this.emit('fault', error)); port.on('close', () => this.emit('closed'));
    await new Promise<void>((resolve, reject) => port.open(error => error ? reject(error) : resolve()));
    await new Promise(resolve => setTimeout(resolve, 1800));
  }
  async send(line: string) {
    const port = this.port; if (!port?.isOpen) throw new Error('Serial port is closed');
    await new Promise<void>((resolve, reject) => port.write(line, error => error ? reject(error) : port.drain(error => error ? reject(error) : resolve())));
  }
  async close() {
    const port = this.port; this.port = undefined;
    if (port?.isOpen) await new Promise<void>((resolve, reject) => port.close(error => error ? reject(error) : resolve()));
  }
}
