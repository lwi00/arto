import { EventEmitter } from 'node:events';
import { assertWritableValue, parseManifest, type Component, type Manifest } from './manifest.js';
import type { DeviceTransport } from '../transports/transport.js';

export interface Observation { value: number; observedAt: string; source: string }
export interface DeviceEvent { seq: number; at: string; type: string; data: Record<string, unknown> }
export interface CommandResult { id: number; ok: boolean; value?: number; error?: string; protocol?: number }
export interface DeviceOptions {
  timeoutMs?: number;
  beforeWrite?: (component: Component, value: number) => void | Promise<void>;
}

/** Device state and command execution, independent of any model or harness. */
export class ArtoDevice extends EventEmitter {
  readonly manifest: Manifest;
  readonly values: Record<string, Observation> = {};
  readonly events: DeviceEvent[] = [];
  status: 'disconnected' | 'connecting' | 'ready' | 'fault' = 'disconnected';
  private nextId = 1;
  private sequence = 0;
  private pending = new Map<number, { resolve: (r: CommandResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeat?: NodeJS.Timeout;
  constructor(manifest: unknown, readonly transport: DeviceTransport, readonly options: DeviceOptions = {}) {
    super(); this.manifest = parseManifest(manifest);
    transport.on('line', (line: string) => this.onLine(line));
    transport.on('fault', (error: Error) => this.fail(error));
    transport.on('closed', () => this.fail(new Error('Transport closed')));
  }
  record(type: string, data: Record<string, unknown>): DeviceEvent {
    const event = { seq: ++this.sequence, at: new Date().toISOString(), type, data };
    this.events.push(event); if (this.events.length > 500) this.events.shift();
    this.emit('event', event); return event;
  }
  private onLine(line: string): void {
    let response: CommandResult & { event?: string; pin?: number };
    try { response = JSON.parse(line); } catch { this.record('protocol_error', { line: line.slice(0, 120) }); return; }
    if (response.event) {
      this.record(response.event, { pin: response.pin, value: response.value });
      if (response.event === 'interlock' && typeof response.pin === 'number') {
        const component = this.manifest.components.find(c => c.pin === response.pin);
        if (component) this.observe(component, 0, 'firmware-interlock');
      }
      if (response.event === 'watchdog') this.fail(new Error('Firmware watchdog expired; outputs set to LOW'));
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(response.id);
    if (response.ok) pending.resolve(response); else pending.reject(new Error(response.error ?? 'Firmware rejected command'));
  }
  private async request(operation: string): Promise<CommandResult> {
    const id = this.nextId++;
    if (this.nextId > 1_000_000) this.nextId = 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error(`Command ${id} timed out; execution status unknown`);
        reject(error); this.fail(error);
      }, this.options.timeoutMs ?? 2500);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send(`${id} ${operation}\n`).catch((error: Error) => {
        clearTimeout(timer); this.pending.delete(id); reject(error); this.fail(error);
      });
    });
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result;
  }
  private component(id: string): Component {
    const component = this.manifest.components.find(c => c.id === id);
    if (!component) throw new Error(`Unknown component ${id}`); return component;
  }
  private requireReady(): void { if (this.status !== 'ready') throw new Error(`Device is ${this.status}`); }
  private observe(component: Component, value: number, source = 'firmware'): Observation {
    const observation = { value, observedAt: new Date().toISOString(), source };
    this.values[component.id] = observation;
    this.record('observation', { component: component.id, ...observation }); return observation;
  }
  async connect(): Promise<void> {
    if (this.status === 'ready' || this.status === 'connecting') return;
    this.status = 'connecting'; this.record('connecting', { transport: this.transport.kind });
    try {
      await this.transport.open();
      const hello = await this.request('h');
      if (hello.protocol !== 1) throw new Error('Unsupported firmware protocol');
      for (const c of this.manifest.components) {
        await this.request(`m ${c.pin} ${c.kind.endsWith('-output') ? 1 : c.pullup ? 2 : 0}`);
        if (c.kind === 'digital-input' && c.pullup) this.transport.setInput?.(c.pin, true);
        if (c.kind.endsWith('-output')) this.observe(c, (await this.request(`w ${c.pin} 0`)).value!);
      }
      for (const rule of this.manifest.interlocks) {
        await this.request(`i ${this.component(rule.input).pin} ${this.component(rule.output).pin} ${rule.blockedValue}`);
      }
      this.status = 'ready'; this.record('ready', { board: this.manifest.board });
      this.heartbeat = setInterval(() => {
        if (this.status === 'ready') void this.serialize(() => this.request('h')).catch(() => {});
      }, 1000); this.heartbeat.unref();
    } catch (error) { this.fail(error as Error); throw error; }
  }
  async read(id: string): Promise<Observation> {
    return this.serialize(async () => {
      this.requireReady(); const c = this.component(id);
      const result = await this.request(`${c.kind === 'analog-input' ? 'a' : 'r'} ${c.pin}`);
      if (typeof result.value !== 'number') throw new Error('Missing firmware value');
      return this.observe(c, result.value);
    });
  }
  async write(id: string, value: number): Promise<Observation> {
    return this.serialize(async () => {
      this.requireReady(); const c = this.component(id); assertWritableValue(c, value);
      try { await this.options.beforeWrite?.(c, value); }
      catch (error) { this.record('rejected', { component: id, value, reason: (error as Error).message }); throw error; }
      this.record('command', { component: id, value });
      const result = await this.request(`${c.kind === 'pwm-output' ? 'p' : 'w'} ${c.pin} ${value}`);
      if (result.value !== value) throw new Error('Firmware value differs from requested value');
      return this.observe(c, result.value, c.kind === 'pwm-output' ? 'firmware-setpoint' : 'firmware-readback');
    });
  }
  async emergencyStop(): Promise<void> {
    await this.serialize(async () => {
      this.requireReady(); await this.request('s');
      for (const c of this.manifest.components.filter(c => c.kind.endsWith('-output'))) this.observe(c, 0);
      this.record('stopped', {});
    });
  }
  snapshot() { return { id: this.manifest.id, status: this.status, transport: this.transport.kind, cursor: this.sequence, values: { ...this.values } }; }
  private fail(error: Error) {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.status === 'disconnected') return;
    this.status = 'fault';
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.record('fault', { message: error.message });
  }
  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.status === 'ready') await this.emergencyStop().catch(() => {});
    this.status = 'disconnected';
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Device closing')); }
    this.pending.clear(); await this.transport.close(); this.record('disconnected', {});
  }
}
