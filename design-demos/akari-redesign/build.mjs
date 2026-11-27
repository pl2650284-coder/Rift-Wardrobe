import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const assets={...JSON.parse(readFileSync(join(dir,'../companion/assets.json'),'utf8')),...JSON.parse(readFileSync(join(dir,'../akari-merge/assets/ddragon.json'),'utf8'))};
const css=readFileSync(join(dir,'styles.css'),'utf8'),js=readFileSync(join(dir,'app.js'),'utf8');
for(const v of ['a','b','c']){
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${v.toUpperCase()} · 峡谷衣橱融合原型</title><style>${css}</style></head><body data-variant="${v}"><div id="app"></div><div id="toast" role="status" aria-live="polite"></div><script type="application/json" id="assets">${JSON.stringify(assets).replace(/</g,'\\u003c')}</script><script>${js}</script></body></html>`;
 writeFileSync(join(dir,`dir-${v}.html`),html);
 console.log(`Built dir-${v}.html (${Math.round(Buffer.byteLength(html)/1024)} KiB)`);
}
