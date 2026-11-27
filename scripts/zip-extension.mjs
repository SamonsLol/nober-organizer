// Empaqueta la extensión del navegador (extension/ + íconos de public/icons) en public/extension/nober-extension.zip.
// Sin dependencias: ZIP con deflate de zlib. Se ejecuta al compilar la imagen (Dockerfile) o a mano: node scripts/zip-extension.mjs
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const files = readdirSync(join(root, "extension"))
  .filter((f) => !f.startsWith("."))
  .map((f) => [f, readFileSync(join(root, "extension", f))]);
files.push(["icons/icon-192.png", readFileSync(join(root, "public/icons/icon-192.png"))]);

const local = [];
const central = [];
let offset = 0;
const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
for (const [name, data] of files) {
  const n = Buffer.from(`nober-extension/${name}`);
  const z = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(z.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
  local.push(h, n, z);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20);
  c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, n);
  offset += h.length + n.length + z.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync(join(root, "public/extension"), { recursive: true });
writeFileSync(join(root, "public/extension/nober-extension.zip"), Buffer.concat([...local, cd, end]));
console.log(`extensión: ${files.length} archivos → public/extension/nober-extension.zip`);
