/* Shared demo data and interactions for the three homepage directions. Offline only; no client calls. */
var A = window.ASSETS;
var SKINS = [
  { key: 'classic', name: '经典', owned: true },
  { key: 'heart', name: '觅心猎手', owned: true },
  { key: 'spirit', name: '灵魂莲华', owned: true },
  { key: 'project', name: '源计划：净化', owned: true },
  { key: 'soul', name: '摄魂使者', owned: false }
];
var ALLIES = [
  { id: 'a1', who: '你', champ: '薇恩', a: 'Vayne', role: '下路', rate: 58, kda: '4.2', rec: '3胜2负' },
  { id: 'a2', who: '队友', champ: '嘉文四世', a: 'JarvanIV', role: '打野', rate: 62, kda: '3.6', rec: '4胜1负' },
  { id: 'a3', who: '队友', champ: '格温', a: 'Gwen', role: '上路', rate: 54, kda: '2.9', rec: '3胜2负' },
  { id: 'a4', who: '队友', champ: '金克丝', a: 'Jinx', role: '中路', rate: 51, kda: '3.1', rec: '2胜3负' },
  { id: 'a5', who: '队友', champ: '蕾欧娜', a: 'Leona', role: '辅助', rate: 56, kda: '2.4', rec: '3胜2负' }
];
var ENEMIES = [
  { id: 'e1', who: '对手', champ: '亚索', a: 'Yasuo', role: '中路', rate: 53, kda: '3.3', rec: '3胜2负' },
  { id: 'e2', who: '对手', champ: '阿狸', a: 'Ahri', role: '下路', rate: 57, kda: '3.8', rec: '4胜1负' },
  { id: 'e3', who: '对手', champ: '锤石', a: 'Thresh', role: '辅助', rate: 49, kda: '2.5', rec: '2胜3负' },
  { id: 'e4', who: '对手', champ: '李青', a: 'LeeSin', role: '打野', rate: 61, kda: '3.7', rec: '4胜1负' },
  { id: 'e5', who: '对手', champ: '拉克丝', a: 'Lux', role: '上路', rate: 52, kda: '2.8', rec: '3胜2负' }
];
var NAV = [['match', '对局'], ['player', '玩家'], ['guide', '攻略'], ['settings', '设置']];
var S = { route: 'match', skin: 2, used: 2, autoAccept: true, autoSkin: false, player: null, team: 'ally' };

function esc(v) { return String(v).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
function findPlayer(id) { return ALLIES.concat(ENEMIES).filter(function (p) { return p.id === id; })[0]; }
function useLabel() { var s = SKINS[S.skin]; return !s.owned ? '未拥有' : S.used === S.skin ? '正在使用' : '使用这款'; }
function useDisabled() { var s = SKINS[S.skin]; return !s.owned || S.used === S.skin; }
var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function rerender() { window.render(); window.fillAssets(document.getElementById('app')); }

document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-route],[data-skin],[data-use],[data-toggle],[data-player],[data-close],[data-team]');
  if (!el) return;
  var d = el.dataset;
  if (d.route) { S.route = d.route; S.player = null; }
  else if (d.skin !== undefined) { S.skin = Number(d.skin); }
  else if (d.use !== undefined) { if (useDisabled()) return; S.used = S.skin; toast('已选用「' + SKINS[S.skin].name + '」（演示）'); }
  else if (d.toggle) { S[d.toggle] = !S[d.toggle]; }
  else if (d.player) { S.player = S.player === d.player ? null : d.player; }
  else if (d.team) { S.team = d.team; }
  else if (d.close !== undefined) { if (ev.target !== el && el.classList.contains('scrim')) return; S.player = null; }
  rerender();
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && S.player) { S.player = null; rerender(); }
  if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && S.route === 'match' && !S.player) {
    S.skin = (S.skin + (ev.key === 'ArrowRight' ? 1 : SKINS.length - 1)) % SKINS.length; rerender();
  }
});
