import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inline official artwork (from companion/assets.json) into each src/*.html so every page opens offline.
const dir = dirname(fileURLToPath(import.meta.url));
const assets = readFileSync(join(dir, '..', 'companion', 'assets.json'), 'utf8');
const loader = '<script id="assets" type="application/json">' + assets + '</script><script>'
  + '(function(){var A=JSON.parse(document.getElementById("assets").textContent);'
  + 'window.ASSETS=A;function fill(root){root.querySelectorAll("[data-a]").forEach(function(el){var v=A[el.dataset.a];if(!v)return;'
  + 'if(el.tagName==="IMG")el.src=v;else el.style.backgroundImage="url("+v+")";});}'
  + 'window.fillAssets=fill;fill(document);})();</script>';
mkdirSync(join(dir, 'src'), { recursive: true });
const common = '<script>' + readFileSync(join(dir, 'src', 'common.js'), 'utf8') + '</script>';
for (const file of readdirSync(join(dir, 'src')).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(dir, 'src', file), 'utf8').replace('<!--ASSETS-->', loader).replace('<!--COMMON-->', common);
  writeFileSync(join(dir, file), html, 'utf8');
  console.log('built', file, Math.round(Buffer.byteLength(html) / 1024) + ' KiB');
}
