import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'prototype.css'), 'utf8') + '\n' + readFileSync(join(dir, 'home.css'), 'utf8');
const js = readFileSync(join(dir, 'prototype.js'), 'utf8');
const assets = readFileSync(join(dir, 'assets.json'), 'utf8');
const html = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>峡谷衣橱 · 综合助手原型</title><style>'
  + css + '</style></head><body><div id="app"></div><div id="toast-root" aria-live="polite"></div><script id="prototype-assets" type="application/json">'
  + assets + '</script><script>' + js + '</script></body></html>';
writeFileSync(join(dir, 'index.html'), html, 'utf8');
console.log('Wrote design-demos/companion/index.html (' + Math.round(Buffer.byteLength(html) / 1024) + ' KiB)');
