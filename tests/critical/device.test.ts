import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ArtoDevice, AvrTransport, DeviceTransport, createArtoServer, parseManifest } from '../../dist/index.js';

const manifest = JSON.parse(await readFile(new URL('../../examples/button-led/board.json', import.meta.url), 'utf8'));

test('MCP client controls actual Uno firmware and observes GPIO, without a harness', async () => {
  const transport = new AvrTransport();
  const gpio: { pin: number; value: number }[] = [];
  transport.on('gpio', event => gpio.push(event));
  const device = new ArtoDevice(manifest, transport);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createArtoServer(device);
  const client = new Client({ name: 'critical-test', version: '1' });
  try {
    await device.connect(); await server.connect(serverSide); await client.connect(clientSide);
    const list = await client.listTools(); assert.ok(list.tools.some(t => t.name === 'set_component'));
    const result = await client.callTool({ name: 'set_component', arguments: { component: 'led', value: 1 } });
    assert.notEqual(result.isError, true);
    assert.equal((await device.read('led')).value, 1);
    assert.ok(gpio.some(e => e.pin === 13 && e.value === 1));
    assert.equal((await device.read('button')).value, 1);
    transport.setInput(2, false); assert.equal((await device.read('button')).value, 0);
    await device.emergencyStop(); assert.equal((await device.read('led')).value, 0);
    await assert.rejects(device.write('led', 2));
    await assert.rejects(device.write('button', 1));
  } finally { await client.close(); await server.close(); await device.close(); }
});

test('Manifest rejects duplicate pins and non-PWM hardware', () => {
  assert.throws(() => parseManifest({ ...manifest, components: [...manifest.components, manifest.components[0]] }));
  assert.throws(() => parseManifest({ ...manifest, components: [{ id: 'motor', label: 'Motor', pin: 13, kind: 'pwm-output' }] }));
});

test('Application precondition is checked at execution and refusal has no effect', async () => {
  let permitted = true;
  const device = new ArtoDevice(manifest, new AvrTransport(), { beforeWrite: () => { if (!permitted) throw new Error('section occupied'); } });
  try {
    await device.connect(); permitted = false;
    await assert.rejects(device.write('led', 1), /section occupied/);
    assert.equal((await device.read('led')).value, 0);
  } finally { await device.close(); }
});

test('A lost command reply creates a fault and never retries the action', async () => {
  class LostReply extends DeviceTransport {
    kind = 'fault-injection'; drop = false; writes = 0;
    async open() {}
    async close() {}
    async send(line: string) {
      const [id, op] = line.split(' ');
      if (this.drop) { this.writes++; return; }
      queueMicrotask(() => this.emit('line', JSON.stringify({ id: Number(id), ok: true, protocol: 1, value: op === 'h' ? 1 : 0 })));
    }
  }
  const transport = new LostReply(); const device = new ArtoDevice(manifest, transport, { timeoutMs: 50 });
  try {
    await device.connect(); transport.drop = true;
    await assert.rejects(device.write('led', 1), /timed out/);
    assert.equal(device.status, 'fault'); assert.equal(transport.writes, 1);
    await assert.rejects(device.write('led', 1), /fault/);
    assert.equal(transport.writes, 1);
  } finally { await device.close(); }
});
