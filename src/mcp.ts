import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ArtoDevice } from './core/device.js';

export function toolResult(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }; }
export async function toolCall(action: () => Promise<unknown>) {
  try { return toolResult(await action()); }
  catch (error) { return { ...toolResult({ error: (error as Error).message }), isError: true }; }
}

export function createArtoServer(device: ArtoDevice): McpServer {
  const server = new McpServer({ name: 'arto', version: '0.1.0' });
  const component = z.enum(device.manifest.components.map(c => c.id) as [string, ...string[]]);
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  server.registerTool('describe_board', {
    description: 'Discover declared hardware, component names, pin mapping, units, allowed values and fallback states. Read before acting.',
    annotations: readOnly,
  }, async () => toolResult({ manifest: device.manifest, connection: device.snapshot() }));
  server.registerTool('get_state', {
    description: 'Read cached observations with timestamps and connection status. A cached value is not a fresh sensor reading.', annotations: readOnly,
  }, async () => toolResult(device.snapshot()));
  server.registerTool('read_component', {
    description: 'Read one component from the firmware and return its value with a fresh observation timestamp.',
    inputSchema: { component }, annotations: readOnly,
  }, async ({ component }) => toolCall(() => device.read(component)));
  server.registerTool('set_component', {
    description: 'Set a declared output. Digital uses 0/1; PWM uses its declared integer range. Firmware acknowledgment is returned; application constraints may refuse. Never retry an uncertain action blindly.',
    inputSchema: { component, value: z.number().int() }, annotations: { openWorldHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ component, value }) => toolCall(() => device.write(component, value)));
  server.registerTool('get_events', {
    description: 'Read recent device events after a cursor. The host is responsible for scheduling new agent runs. This tool does not wake an inactive harness.',
    inputSchema: { after: z.number().int().nonnegative().default(0) }, annotations: readOnly,
  }, async ({ after }) => toolResult({ events: device.events.filter(e => e.seq > after), cursor: device.snapshot().cursor, truncated: after > 0 && after < (device.events[0]?.seq ?? 0) - 1 }));
  server.registerTool('emergency_stop', {
    description: 'Set every output to its LOW/0 fallback immediately through the firmware. Does not close the connection.',
    annotations: { openWorldHint: false, destructiveHint: false, idempotentHint: true },
  }, async () => toolCall(async () => { await device.emergencyStop(); return device.snapshot(); }));
  server.registerResource('board', `arto://boards/${device.manifest.id}`, { description: 'Declared board capabilities', mimeType: 'application/json' }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(device.manifest) }],
  }));
  server.registerPrompt('onboard', {
    description: 'Understand this device, check its declared wiring and establish a first verified interaction.',
    argsSchema: { objective: z.string().optional() },
  }, ({ objective }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
    `Onboard this Arto device for: ${objective ?? 'observation and controlled actuation'}. Call describe_board, explain declared components and limits, ask only for missing physical facts. Wiring is declared, not automatically detected. Read a relevant input. Perform an output test only when authorized and appropriate to the attached hardware, then restore its fallback. Report exactly what was observed. Do not claim physical validation from an emulator.` } }] }));
  return server;
}
