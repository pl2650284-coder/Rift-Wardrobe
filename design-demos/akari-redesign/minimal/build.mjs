import { readFileSync, writeFileSync } from 'node:fs';
import {
  ArrowUpRight, ChartNoAxesColumnIncreasing, ChevronDown, ChevronRight, Copy,
  Gamepad2, Search, Settings, Shield, UserRound, Wrench, X, Zap,
} from 'lucide';
import { champions, matches, modes, players, profiles, skinChoices } from './demo-data.mjs';

const at = name => new URL(name, import.meta.url);
const read = name => readFileSync(at(name), 'utf8');
const assets = JSON.parse(read('../../akari-merge/assets/ddragon.json'));
const assetNames = JSON.parse(read('../../akari-merge/assets/ddragon-meta.json'));
const skinAssets = JSON.parse(read('../../companion/assets.json'));
const logo = 'data:image/svg+xml;base64,' + readFileSync(at('../../../ui/public/app-mark.svg')).toString('base64');
const css = read('styles.css');
const js = read('prototype.js');
const directions = [
  ['a', '展开列表', '最接近参考图。浅色战绩行保留出装，点开即可看双方数据。'],
  ['b', '左右分栏', '左边选一局，右边固定显示装备、数据和双方阵容。'],
  ['c', '紧凑表格', '深色界面，固定列对比每场表现。详情从右侧打开。'],
  ['d', '侧边档案', '段位与账号固定在侧边，战绩列表独立滚动。'],
  ['e', '按日期分组', '列表按对局日期分组，方便回到同一晚的连续战绩。'],
  ['f', '赛果优先', '用清晰的胜负栏分隔每局，其他信息共用一套列宽。'],
];

const runes = Object.fromEntries(assetNames.runes.flatMap(tree => tree.slots.flat()).map(rune => [rune.id, rune.name]));
const assetKeys = [
  ...Object.keys(champions).map(key => 'c:' + key),
  ...new Set(matches.flatMap(match => match.gear.map(id => 'i:' + id))),
  ...new Set(matches.map(match => 'r:' + match.rune)),
  ...['SummonerFlash', 'SummonerSnowball', 'SummonerHeal', 'SummonerSmite', 'SummonerDot', 'SummonerTeleport'].map(key => 's:' + key),
];
const images = { logo };
for (const key of assetKeys) {
  if (!assets[key]) throw new Error('Missing Data Dragon asset: ' + key);
  images[key] = assets[key];
}
const iconNodes = {
  arrow: ArrowUpRight, history: ChartNoAxesColumnIncreasing, down: ChevronDown,
  right: ChevronRight, copy: Copy, match: Gamepad2, search: Search,
  settings: Settings, shield: Shield, user: UserRound, tools: Wrench, close: X, auto: Zap,
};

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function svg([name, attrs, children = []]) {
  const entries = name === 'svg'
    ? { ...attrs, width: 18, height: 18, class: 'icon', 'aria-hidden': 'true', focusable: 'false' }
    : attrs;
  const attributes = Object.entries(entries).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
  return `<${name}${attributes}>${children.map(svg).join('')}</${name}>`;
}

const demo = {
  modes, champions, profiles, matches, players, skinChoices,
  titles: { items: assetNames.items, spells: assetNames.spells, runes },
  icons: Object.fromEntries(Object.entries(iconNodes).map(([name, value]) => [name, svg(value)])),
};
const wardrobeImages = Object.fromEntries(skinChoices.map(({ key }) => [key, skinAssets[key]]));

function prototype([id, name], thumbnail = false) {
  const payload = JSON.stringify({ ...demo, images: thumbnail ? images : { ...images, ...wardrobeImages } }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name} · 峡谷衣橱</title>
  <style>${css}</style>
</head>
<body data-direction="${id}">
  <div id="app"></div>
  <dialog id="search-dialog" class="search-dialog" aria-labelledby="search-title"></dialog>
  <dialog id="match-dialog" class="match-dialog" aria-labelledby="drawer-title"></dialog>
  <div class="toast" id="toast" role="status"></div>
  <script type="application/json" id="demo">${payload}</script>
  <script>${js}</script>
</body>
</html>`;
}

const reviewCss = `
*{box-sizing:border-box}
body{margin:0;background:#f3f5f6;color:#15232c;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}
main{width:min(1360px,100% - 48px);margin:48px auto}
header{margin-bottom:30px}
.brand{display:flex;align-items:center;gap:9px;font-weight:650}
.brand img{width:26px;height:26px}
h1{font-size:32px;line-height:1.25;margin:20px 0 7px;letter-spacing:-.025em}
h2{font-size:18px;line-height:1.3;margin:0}
p{color:#52636e;margin:6px 0 0}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{display:block;overflow:hidden;background:#fff;border:1px solid #d7dfe4;border-radius:10px;color:inherit;text-decoration:none}
.card:hover,.card:focus-visible{border-color:#246652;outline:2px solid #246652;outline-offset:2px}
.card>img{display:block;width:100%;aspect-ratio:1118/803;object-fit:cover;object-position:top;background:#e9eef1;border-bottom:1px solid #d7dfe4}
.card-text,figcaption{padding:16px 18px}
.card-text h2{display:flex;justify-content:space-between;gap:12px}
.card-text span{color:#246652;font-size:14px;font-weight:600}
.more{display:inline-block;margin-top:24px;color:#246652}
.sample{margin:0;border:1px solid #d7dfe4;border-radius:10px;overflow:hidden;background:#fff}
.sample-view{position:relative;aspect-ratio:1118/735;overflow:hidden;background:#e9eef1}
.sample-view iframe{display:block;width:1118px;height:735px;border:0;transform-origin:top left;pointer-events:none}
figcaption small{font-size:13px;color:#52636e}
@media(max-width:1020px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){main{width:calc(100% - 32px);margin:26px auto}.cards{grid-template-columns:1fr}h1{font-size:26px}}
`;

function reviewPage(title, description, contents, script = '') {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · 峡谷衣橱</title><style>${reviewCss}</style></head>
<body><main><header><div class="brand"><img src="${logo}" alt="">峡谷衣橱</div><h1>${title}</h1><p>${description}</p></header>${contents}</main>${script}</body></html>`;
}

const published = directions.slice(0, 3);
for (const direction of published) {
  writeFileSync(at('dir-' + direction[0] + '.html'), prototype(direction));
}

const cards = published.map(([id, name, desc]) => `<a class="card" href="dir-${id}.html">
  <img src="screenshots/${id}-1118.png" alt="">
  <div class="card-text"><h2>${id.toUpperCase()}　${name}<span>体验</span></h2><p>${desc}</p></div>
</a>`).join('');
writeFileSync(at('index.html'), reviewPage('战绩页重设计', '围绕同一组战绩，比较列表展开、分栏查看与表格速读。',
  `<div class="cards">${cards}</div><a class="more" href="thumbs.html">查看六个候选方向</a>`));

const samples = directions.map((direction, index) => {
  const [id, name, desc] = direction;
  return `<figure class="sample"><div class="sample-view"><iframe title="${name}缩略图"
    aria-hidden="true" tabindex="-1" data-direction="${id}"></iframe></div>
    <figcaption><h2>${id.toUpperCase()}　${name}</h2><p><small>${desc}${index > 2 ? '（备选）' : ''}</small></p></figcaption>
  </figure>`;
}).join('');
const previewTemplate = JSON.stringify(prototype(['a', '方向缩略图'], true)).replace(/</g, '\\u003c');
writeFileSync(at('thumbs.html'), reviewPage('战绩页候选方向', '各版使用同一组对局。A、B、C 提供完整交互预览。',
  `<div class="cards">${samples}</div><a class="more" href="index.html">返回交互初稿</a>`,
  `<script type="application/json" id="preview-template">${previewTemplate}</script>
  <script>
    const template = JSON.parse(document.querySelector('#preview-template').textContent);
    const observer = new ResizeObserver(entries => {
      for (const { target, contentRect } of entries) {
        target.firstElementChild.style.transform = 'scale(' + contentRect.width / 1118 + ')';
      }
    });
    document.querySelectorAll('.sample-view').forEach(view => {
      const frame = view.firstElementChild;
      frame.srcdoc = template.replace('data-direction="a"', 'data-direction="' + frame.dataset.direction + '"');
      observer.observe(view);
    });
  </script>`));
