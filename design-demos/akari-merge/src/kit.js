/* 峡谷衣橱 × LeagueAkari · 融合原型 — 工具函数与图标（离线演示，不连接客户端） */
const ASSETS = JSON.parse(document.getElementById('assets').textContent);
const META = JSON.parse(document.getElementById('meta').textContent);
const CN = {};
META.allChampions.forEach(function (c) { CN[c.id] = c.title; });
const ICON_CHAMPS = Object.keys(META.champions);

const P = {
  match: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
  players: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  guide: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  auto: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  tools: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  play: '<path d="m6 3 14 9-14 9z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="11" width="7" height="7" rx="1"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7h2a5.6 5.6 0 0 0 5.5-5.6C22 6 17.5 2 12 2"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10"/>',
  eyeoff: '<path d="M10.7 5.1A10.7 10.7 0 0 1 22 12c-.4.9-.9 1.7-1.5 2.5M14.1 14.2a3 3 0 0 1-4.2-4.2M17.5 17.5A10.7 10.7 0 0 1 2 12a10.8 10.8 0 0 1 4.4-5.4M2 2l20 20"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
  wand: '<path d="m21.6 2.4-1.2-1.2a1.2 1.2 0 0 0-1.7 0L2.4 17.4a1.2 1.2 0 0 0 0 1.7l1.3 1.3a1.2 1.2 0 0 0 1.7 0L21.6 4.1a1.2 1.2 0 0 0 0-1.7M14 7l3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7z"/><path d="M5 20h14"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01M13 4.6v16.2a1 1 0 0 1-1.2 1L5 20V5.6a2 2 0 0 1 1.5-1.9l5-1.3A1.2 1.2 0 0 1 13 3.6z"/>',
  sparkle: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'
};
function ic(name, size) { return '<svg class="i" viewBox="0 0 24 24"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + ' aria-hidden="true">' + (P[name] || P.info) + '</svg>'; }
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
function cname(id) { return CN[id] || id; }
function champ(id, cls) {
  const src = ASSETS['c:' + id];
  if (src) return '<img class="ci ' + (cls || '') + '" src="' + src + '" alt="' + esc(cname(id)) + '" />';
  return '<span class="ci ph ' + (cls || '') + '">' + esc(cname(id).slice(0, 1)) + '</span>';
}
function item(id, cls) {
  if (!id) return '<span class="ii empty ' + (cls || '') + '"></span>';
  return '<img class="ii ' + (cls || '') + '" src="' + ASSETS['i:' + id] + '" alt="' + esc(META.items[id] || '') + '" title="' + esc(META.items[id] || '') + '" />';
}
function spell(id, cls) { return '<img class="ii ' + (cls || '') + '" src="' + ASSETS['s:' + id] + '" alt="' + esc(META.spells[id]) + '" title="' + esc(META.spells[id]) + '" />'; }
function rune(id, cls) { return '<img class="ri ' + (cls || '') + '" src="' + ASSETS['r:' + id] + '" alt="' + esc(runeName(id)) + '" title="' + esc(runeName(id)) + '" />'; }
function picon(id, cls) { return '<img class="' + (cls || '') + '" src="' + ASSETS['p:' + id] + '" alt="" />'; }
function runeName(id) {
  for (const t of META.runes) { if (t.id === id) return t.name; for (const s of t.slots) for (const r of s) if (r.id === id) return r.name; }
  return '';
}
function tree(id) { return META.runes.find(function (t) { return t.id === id; }); }
function sw(key, on, label) { return '<button class="switch ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label || '') + '" data-act="toggle" data-k="' + key + '"></button>'; }
function seg(key, value, options) {
  return '<div class="seg" role="group">' + options.map(function (o) {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<button class="' + (String(value) === String(v) ? 'on' : '') + '" data-act="set" data-k="' + key + '" data-v="' + esc(v) + '">' + esc(l) + '</button>';
  }).join('') + '</div>';
}
function sel(key, value, options, attrs) {
  return '<select class="select" data-change="set" data-k="' + key + '" ' + (attrs || '') + '>' + options.map(function (o) {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<option value="' + esc(v) + '"' + (String(value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('') + '</select>';
}
function row(title, desc, ctl, opts) {
  opts = opts || {};
  return '<div class="row ' + (opts.sub ? 'sub' : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><div class="row-copy"><h3>' + title + '</h3>' + (desc ? '<p>' + desc + '</p>' : '') + '</div><div class="row-ctl">' + (ctl || '') + '</div></div>';
}
function tabs(key, value, list) {
  return '<nav class="tabs">' + list.map(function (t) {
    return '<button class="tab ' + (value === t[0] ? 'on' : '') + '" data-act="set" data-k="' + key + '" data-v="' + t[0] + '"' + (value === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + (t[2] != null ? '<span class="n">' + t[2] + '</span>' : '') + '</button>';
  }).join('') + '</nav>';
}
function sec(title, body, opts) {
  opts = opts || {};
  return '<section class="sec"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><header class="sec-h"><h2>' + title + '</h2>' + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + (opts.right ? '<div class="right">' + opts.right + '</div>' : '') + '</header>' + body + '</section>';
}
function delayChips(key, value, max) {
  let h = '<div class="chips">';
  for (let i = 0; i <= max; i++) h += '<button class="chip ' + (value === i ? 'on' : '') + '" data-act="set" data-k="' + key + '" data-v="' + i + '" data-num="1">' + i + '</button>';
  return h + '<span class="muted" style="align-self:center;margin-left:4px;font-size:12px">秒</span></div>';
}
function getK(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, S); }
function setK(path, value) {
  const keys = path.split('.'); let o = S;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
function nowTime() { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':'); }
function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
