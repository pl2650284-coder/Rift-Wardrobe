import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const assets = JSON.parse(readFileSync(join(dir, '..', 'companion', 'assets.json'), 'utf8'));
const slim = { Vayne: assets.Vayne, Ahri: assets.Ahri, Jinx: assets.Jinx, Lux: assets.Lux, Leona: assets.Leona };
const loader = '<script id="assets" type="application/json">' + JSON.stringify(slim) + '</script>';
const src = readFileSync(join(dir, 'src', 'index.html'), 'utf8');
const out = src.replace('<!--ASSETS-->', loader);
writeFileSync(join(dir, 'index.html'), out, 'utf8');
console.log('built profile-minimal/index.html', Math.round(Buffer.byteLength(out) / 1024) + ' KiB');
