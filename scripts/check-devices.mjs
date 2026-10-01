// Device files are loaded by glob at runtime, so a malformed or duplicate one fails silently.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/devices/', import.meta.url);
const seen = new Map();
let failed = false;
const fail = (file, msg) => { console.error(`${file}: ${msg}`); failed = true; };

for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json')) { fail(file, 'not a .json file; the app never loads it'); continue; }
  let device;
  try { device = JSON.parse(readFileSync(new URL(file, dir), 'utf8')); }
  catch (e) { fail(file, e.message); continue; }
  for (const key of ['name', 'productId', 'mainType']) if (!device[key]) fail(file, `missing ${key}`);
  const id = `${device.mainType}:${parseInt(device.productId, 16)}`;
  if (seen.has(id)) fail(file, `same productId as ${seen.get(id)}`);
  seen.set(id, file);
}

if (failed) process.exit(1);
console.log(`${seen.size} device files OK`);
