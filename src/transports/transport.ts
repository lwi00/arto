import { EventEmitter } from 'node:events';

/** Line-oriented connection. Implementations emit line, fault and closed. */
export abstract class DeviceTransport extends EventEmitter {
  abstract readonly kind: string;
  abstract open(): Promise<void>;
  abstract send(line: string): Promise<void>;
  abstract close(): Promise<void>;
  setInput?(pin: number, value: boolean): void;
}
