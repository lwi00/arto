import { access, mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../public/assets/', import.meta.url);
await mkdir(directory, { recursive: true });
const assets = [
  ['mf77-front.png', 'https://parismetrosimulator.appspot.com/metro/images/voiture1MF77.png'],
  ['mf77-car.png', 'https://parismetrosimulator.appspot.com/metro/images/voiture2MF77.png'],
  ['mf77-back.png', 'https://parismetrosimulator.appspot.com/metro/images/voiture3MF77.png'],
];
for (const [name, url] of assets) {
  const destination = new URL(name, directory);
  try { await access(destination); continue; } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Asset ${name}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71) throw new Error(`Asset ${name} is not a PNG`);
  await writeFile(destination, data);
  console.log(`Downloaded ${name} from Paris Metro Simulator. See data/SOURCES.md for attribution.`);
}
