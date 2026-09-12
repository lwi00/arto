#!/usr/bin/env node
import { spawn } from 'node:child_process';
// Keep Codex's login cache, but omit personal plugins/config for this application.
const args = process.argv.slice(2).map(arg => arg === '--experimental-json' ? '--json' : arg);
if (args[0] === 'exec') args.splice(1, 0, '--ignore-user-config');
const child = spawn(process.env.ARTO_CODEX_BIN || 'codex', args, { stdio: 'inherit' });
child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
