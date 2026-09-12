#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ArtoDevice, AvrTransport, SerialTransport, parseManifest, createArtoServer } from './index.js';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const sample = new URL('../examples/button-led/board.json', import.meta.url);
try {
  if (args[0] === 'ports') console.log(JSON.stringify(await SerialTransport.list(), null, 2));
  else if (args[0] === 'init') {
    const path = resolve(args[1] ?? 'board.json');
    await writeFile(path, await readFile(sample, 'utf8'), { flag: 'wx' });
    console.log(`Created ${path}. Edit the declared wiring before connecting physical hardware.`);
  } else if (args[0] === 'validate') {
    const manifest = parseManifest(JSON.parse(await readFile(resolve(args[1] ?? 'board.json'), 'utf8')));
    console.log(JSON.stringify({ valid: true, id: manifest.id, components: manifest.components.length }));
  } else if (['serve', 'doctor'].includes(args[0])) {
    const manifest = JSON.parse(await readFile(flag('--manifest') ? resolve(flag('--manifest')!) : sample, 'utf8'));
    const port = flag('--port');
    const device = new ArtoDevice(manifest, port ? new SerialTransport(port) : new AvrTransport(flag('--firmware')));
    await device.connect();
    if (args[0] === 'doctor') {
      for (const c of device.manifest.components) await device.read(c.id);
      console.log(JSON.stringify({ ...device.snapshot(), note: 'Connection and reads verified; no output test requested.' }, null, 2));
      await device.close();
    } else {
      await createArtoServer(device).connect(new StdioServerTransport());
      process.stderr.write(`Arto ready: ${device.manifest.name} (${device.transport.kind})\n`);
      const close = async () => { await device.close(); process.exit(0); };
      process.once('SIGINT', close); process.once('SIGTERM', close); process.stdin.once('end', close);
    }
  } else console.log('Arto MCP\n  arto init [board.json]\n  arto validate board.json\n  arto doctor --manifest board.json [--port /dev/tty...]\n  arto serve --manifest board.json [--firmware file.hex] [--port /dev/tty...]\n  arto ports\nDefault transport: AVR8js, bundled Uno firmware.');
} catch (error) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; }
