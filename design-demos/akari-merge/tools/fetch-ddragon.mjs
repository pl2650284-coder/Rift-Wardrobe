// Downloads the official Riot Data Dragon icons used by the merged prototype.
// Run once (needs network): node design-demos/akari-merge/tools/fetch-ddragon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = '16.21.1';
const CDN = 'https://ddragon.leagueoflegends.com/cdn';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

const CHAMPS = ['Vayne', 'Jinx', 'Ezreal', 'Kaisa', 'Caitlyn', 'Ashe', 'MissFortune', 'Jhin', 'Thresh', 'Leona', 'Nautilus', 'Lulu', 'Senna',
  'LeeSin', 'JarvanIV', 'Viego', 'Khazix', 'Graves', 'Ahri', 'Yasuo', 'Lux', 'Orianna', 'Zed', 'Syndra', 'Gwen', 'Darius', 'Garen',
  'Aatrox', 'Sett', 'Camille', 'Yone', 'Sylas', 'Ornn', 'Seraphine'];
const ITEMS = [3031, 3006, 3153, 3046, 3072, 3036, 6672, 3085, 3124, 3091, 3026, 3047, 3020, 3157, 3089, 6653, 3135, 3742, 3190, 3340,
  3364, 1055, 3094, 6675, 3033, 3009, 3111, 3158, 3065, 3075, 3143, 3071, 6631, 3053, 4645, 3165, 3116, 3100, 3107, 3222, 3087, 3115, 3302, 1001, 2003];
const SPELLS = ['SummonerFlash', 'SummonerHeal', 'SummonerDot', 'SummonerTeleport', 'SummonerSmite', 'SummonerExhaust', 'SummonerBarrier', 'SummonerHaste', 'SummonerSnowball', 'SummonerBoost'];
const PROFILE_ICONS = [4568, 5367, 588, 6, 29, 4834, 5212, 23, 3505, 4655];

const json = async (url) => (await fetch(url)).json();
async function b64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const type = res.headers.get('content-type') || 'image/png';
  return 'data:' + type.split(';')[0] + ';base64,' + Buffer.from(await res.arrayBuffer()).toString('base64');
}

const assets = {};
const meta = { version: V, champions: {}, items: {}, spells: {}, runes: [], allChampions: [] };

const champData = (await json(`${CDN}/${V}/data/zh_CN/champion.json`)).data;
meta.allChampions = Object.values(champData).map((c) => ({ id: c.id, name: c.name, title: c.title, tags: c.tags }));
for (const id of CHAMPS) {
  const key = Object.keys(champData).find((k) => k.toLowerCase() === id.toLowerCase());
  if (!key) { console.warn('missing champion', id); continue; }
  try { assets['c:' + key] = await b64(`${CDN}/${V}/img/champion/${key}.png`); meta.champions[key] = champData[key].name; } catch (e) { console.warn(e.message); }
}

const itemData = (await json(`${CDN}/${V}/data/zh_CN/item.json`)).data;
for (const id of ITEMS) {
  if (!itemData[id]) { console.warn('missing item', id); continue; }
  try { assets['i:' + id] = await b64(`${CDN}/${V}/img/item/${id}.png`); meta.items[id] = itemData[id].name; } catch (e) { console.warn(e.message); }
}

const spellData = (await json(`${CDN}/${V}/data/zh_CN/summoner.json`)).data;
for (const id of SPELLS) {
  if (!spellData[id]) { console.warn('missing spell', id); continue; }
  try { assets['s:' + id] = await b64(`${CDN}/${V}/img/spell/${id}.png`); meta.spells[id] = spellData[id].name; } catch (e) { console.warn(e.message); }
}

const trees = await json(`${CDN}/${V}/data/zh_CN/runesReforged.json`);
for (const tree of trees) {
  const t = { id: tree.id, key: tree.key, name: tree.name, slots: [] };
  try { assets['r:' + tree.id] = await b64(`${CDN}/img/${tree.icon}`); } catch (e) { console.warn(e.message); }
  for (const slot of tree.slots) {
    const row = [];
    for (const rune of slot.runes) {
      try { assets['r:' + rune.id] = await b64(`${CDN}/img/${rune.icon}`); } catch (e) { console.warn(e.message); }
      row.push({ id: rune.id, name: rune.name });
    }
    t.slots.push(row);
  }
  meta.runes.push(t);
}

for (const id of PROFILE_ICONS) {
  try { assets['p:' + id] = await b64(`${CDN}/${V}/img/profileicon/${id}.png`); } catch (e) { console.warn(e.message); }
}

writeFileSync(join(out, 'ddragon.json'), JSON.stringify(assets));
writeFileSync(join(out, 'ddragon-meta.json'), JSON.stringify(meta, null, 1));
console.log('assets', Object.keys(assets).length, 'KB', Math.round(JSON.stringify(assets).length / 1024));
