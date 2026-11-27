/* Offline demonstration only. No client connection or game action is performed. */
const ASSETS = JSON.parse(document.getElementById('prototype-assets').textContent);
const root = document.getElementById('app');
const iconPaths = {
  game: '<path d="M6 12h4m-2-2v4m7-2h.01M18 10h.01M7 6h10a4 4 0 0 1 3.9 3.1l1 5A3 3 0 0 1 19 18l-3.5-2H8.5L5 18a3 3 0 0 1-2.9-3.9l1-5A4 4 0 0 1 7 6Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  book: '<path d="M12 7c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Zm0 0v13"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5L15 12l-3-3 2.7-2.7Z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M5 5 19 19M19 5 5 19"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  heart: '<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
  shield: '<path d="m12 2 8 4v6c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6l8-4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a7 7 0 0 1 12-3l3 6M4 12l3 6a7 7 0 0 0 12-3"/>',
  bolt: '<path d="m13 2-9 11h7l-1 9 10-12h-7l1-8Z"/>'
};
function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (iconPaths[name] || iconPaths.chevron) + '</svg>'; }
function esc(value) { return String(value).replace(/[&<>"']/g, function (m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
const allies = [
  { id:'a1', name:'你', champion:'薇恩', asset:'Vayne', role:'下路', rate:'58%', kda:'4.2', recent:'3 胜 2 负' },
  { id:'a2', name:'队友 A', champion:'嘉文四世', asset:'JarvanIV', role:'打野', rate:'62%', kda:'3.6', recent:'4 胜 1 负' },
  { id:'a3', name:'队友 B', champion:'格温', asset:'Gwen', role:'上路', rate:'54%', kda:'2.9', recent:'3 胜 2 负' },
  { id:'a4', name:'队友 C', champion:'金克丝', asset:'Jinx', role:'中路', rate:'51%', kda:'3.1', recent:'2 胜 3 负' },
  { id:'a5', name:'队友 D', champion:'蕾欧娜', asset:'Leona', role:'辅助', rate:'56%', kda:'2.4', recent:'3 胜 2 负' }
];
const enemies = [
  { id:'e1', name:'对手 A', champion:'亚索', asset:'Yasuo', role:'中路', rate:'53%', kda:'3.3', recent:'3 胜 2 负' },
  { id:'e2', name:'对手 B', champion:'阿狸', asset:'Ahri', role:'下路', rate:'57%', kda:'3.8', recent:'4 胜 1 负' },
  { id:'e3', name:'对手 C', champion:'锤石', asset:'Thresh', role:'辅助', rate:'49%', kda:'2.5', recent:'2 胜 3 负' },
  { id:'e4', name:'对手 D', champion:'李青', asset:'LeeSin', role:'打野', rate:'61%', kda:'3.7', recent:'4 胜 1 负' },
  { id:'e5', name:'对手 E', champion:'拉克丝', asset:'Lux', role:'上路', rate:'52%', kda:'2.8', recent:'3 胜 2 负' }
];
const players = allies.concat(enemies);
const skins = [
  { name:'经典', image:'classic', owned:true },
  { name:'觅心猎手', image:'heart', owned:true },
  { name:'灵魂莲华', image:'spirit', owned:true },
  { name:'源计划：净化', image:'project', owned:true },
  { name:'摄魂使者', image:'soul', owned:false }
];
const state = { route:'match', tab:'home', team:'ally', drawer:null, skin:2, appliedSkin:2, autoAccept:true, autoSkin:false, paused:false, delay:2, guide:'峡谷', matchExpanded:null, compact:false, motion:true, favorites:new Set([2]), toolFeedback:null };
let toastTimer;
function notify(message) {
  const host = document.getElementById('toast-root');
  host.innerHTML = '<div class="toast">' + icon('check') + '<span>' + esc(message) + '</span></div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { host.innerHTML = ''; }, 3300);
}
function button(label, action, className) { return '<button class="button ' + (className || '') + '" data-action="' + action + '">' + label + '</button>'; }
function rail() {
  const items = [ ['match','game','对局'], ['players','user','玩家'], ['guide','book','攻略'], ['tools','tools','工具'], ['settings','settings','设置'] ];
  return '<aside class="rail" aria-label="主导航"><button class="brand" data-route="match" aria-label="回到本局"><img src="' + ASSETS.logo + '" alt="峡谷衣橱" /></button><nav>'
    + items.map(function (item) { return '<button class="rail-button ' + (state.route === item[0] ? 'active' : '') + '" data-route="' + item[0] + '" aria-label="' + item[2] + '" ' + (state.route === item[0] ? 'aria-current="page"' : '') + '>' + icon(item[1]) + '<span>' + item[2] + '</span></button>'; }).join('')
    + '</nav><div class="rail-bottom"><span class="dot"></span><span class="rail-note">静态原型</span></div></aside>';
}
function subnav() {
  if (state.route !== 'match') return '';
  const tabs = [['home','本局'],['wardrobe','皮肤衣橱'],['automation','自动化']];
  return '<nav class="subnav" aria-label="对局页面">' + tabs.map(function (item) { return '<button class="tab ' + (state.tab === item[0] ? 'active' : '') + '" data-tab="' + item[0] + '" ' + (state.tab === item[0] ? 'aria-current="page"' : '') + '>' + item[1] + '</button>'; }).join('') + '<span class="subnav-note">' + icon('shield') + ' 演示数据 · 不连接客户端</span></nav>';
}
function roster(team, label) {
  return '<section class="home-team" aria-label="' + label + '"><header><span class="home-team-mark ' + (label === '对方阵容' ? 'enemy' : '') + '"></span><h3>' + label + '</h3><small>点击玩家查看近期摘要</small></header>'
    + team.map(function (player) { return '<button class="home-row" data-player="' + player.id + '"><img src="' + ASSETS[player.asset] + '" alt="" /><span class="home-player"><strong>' + esc(player.name) + '</strong><small>' + esc(player.champion) + '</small></span><span class="home-role">' + esc(player.role) + '</span><span class="home-rate">' + player.rate + '<small>近 20 场</small></span>' + icon('chevron') + '</button>'; }).join('') + '</section>';
}
function home() {
  return '<div class="home-view"><section class="home-hero" aria-label="当前对局"><img src="' + ASSETS.spirit + '" alt="薇恩·灵魂莲华皮肤原画" /><div class="home-hero-shade"></div><div class="home-hero-content"><p class="home-kicker"><span class="dot"></span>选人阶段 <span class="home-sep">/</span> 演示状态</p><h1>薇恩，准备出场</h1><p class="home-lead">当前已预览「灵魂莲华」。先选好皮肤，再看看这局的阵容。</p><div class="home-hero-actions"><button class="button primary" data-tab="wardrobe">进入皮肤衣橱 ' + icon('arrow') + '</button><button class="home-quiet-action" data-tab="automation">自动化设置 ' + icon('chevron') + '</button></div></div><p class="home-art-caption">当前预览 · 灵魂莲华</p></section>'
    + '<section class="home-board" aria-label="双方阵容"><div class="home-board-head"><div><h2>双方阵容</h2><p>从这里进入玩家详情，统计均为演示数据。</p></div><span class="home-board-phase">' + icon('clock') + ' 选人中</span></div><div class="home-mobile-switch"><button data-team="ally" class="' + (state.team === 'ally' ? 'active' : '') + '">我方</button><button data-team="enemy" class="' + (state.team === 'enemy' ? 'active' : '') + '">对方</button></div><div class="home-teams"><div class="' + (state.team !== 'ally' ? 'home-mobile-hidden' : '') + '">' + roster(allies,'我方阵容') + '</div><div class="' + (state.team !== 'enemy' ? 'home-mobile-hidden' : '') + '">' + roster(enemies,'对方阵容') + '</div></div><div class="home-board-foot"><span>自动接受 ' + (state.autoAccept ? '已开启' : '已关闭') + ' · 自动应用皮肤 ' + (state.autoSkin ? '已开启' : '已关闭') + '</span><button data-tab="automation">调整规则 ' + icon('arrow') + '</button></div></section></div>';
}
function wardrobe() {
  const current = skins[state.skin];
  return '<div class="wardrobe-page"><section class="wardrobe-hero"><img src="' + ASSETS[current.image] + '" alt="' + esc(current.name) + '原画" /><div class="wardrobe-title"><p>薇恩的衣橱</p><h1>' + esc(current.name) + '</h1><small>' + (current.owned ? '已拥有 · 点击下方皮肤可预览' : '尚未拥有 · 仅可预览') + '</small></div><div class="wardrobe-action"><p>' + (state.appliedSkin === state.skin ? '当前选择 · 演示' : '仅预览 · 尚未确认') + '</p><button class="button primary" data-action="apply-skin" ' + (!current.owned || state.appliedSkin === state.skin ? 'disabled' : '') + '>' + (state.appliedSkin === state.skin ? '当前已选' : '确认使用') + '</button></div></section><div class="skin-shelf"><div class="shelf-head"><h2>皮肤列表 <small>选择后先预览</small></h2><span class="badge gold">5 款外观 · 演示</span></div><div class="skins">' + skins.map(function (skin,index) { return '<button class="skin ' + (state.skin === index ? 'active' : '') + '" data-skin="' + index + '" aria-pressed="' + (state.skin === index) + '"><img src="' + ASSETS[skin.image] + '" alt="" /><strong>' + esc(skin.name) + (skin.owned ? '' : ' · 未拥有') + '</strong></button>'; }).join('') + '</div></div><div class="wardrobe-bottom"><span>' + icon('shield') + ' 原型中的确认仅改变本页演示状态</span><button class="button subtle" data-tab="home">返回本局</button></div></div>';
}
function rule(title, description, key, value) {
  return '<div class="rule-row"><div class="rule-copy"><h3>' + title + '</h3><p>' + description + '</p></div><button class="switch ' + (value ? 'on' : '') + '" data-setting="' + key + '" role="switch" aria-checked="' + value + '" aria-label="' + title + '"></button></div>';
}
function automation() {
  return '<div class="content"><div class="heading"><div><h1>自动化</h1><p>把当前对局的自动动作放在一个地方管理。</p></div><span class="badge gold">演示设置</span></div><section class="quiet-sheet"><div class="panel-head"><div><h2>对局规则</h2><p class="muted">只在有效游戏阶段生效，手动操作始终优先。</p></div><button class="button" data-action="pause">' + (state.paused ? '继续本局' : '暂停本局') + '</button></div><div class="quiet-sheet-body">'
    + rule('自动接受对局','匹配弹窗出现后，等待设定时间再接受。','autoAccept',state.autoAccept)
    + '<div class="rule-row"><div class="rule-copy"><h3>接受延迟</h3><p>给你一点时间确认当前状态。</p></div><select id="accept-delay" aria-label="接受延迟">' + [0,1,2,3,5].map(function(n){return '<option value="'+n+'" '+(state.delay===n?'selected':'')+'>'+n+' 秒</option>';}).join('') + '</select></div>'
    + rule('自动应用皮肤','按本地收藏和当前英雄选择已拥有皮肤。','autoSkin',state.autoSkin)
    + '</div><div class="quiet-sheet-note">' + icon('shield') + ' 静态原型不会接受对局或修改客户端。</div></section></div>';
}
function playerPage() {
  const demoMatches = [ ['胜利','薇恩','下路','11 / 3 / 8','32 分钟'], ['失败','金克丝','下路','6 / 7 / 9','28 分钟'], ['胜利','阿狸','中路','9 / 4 / 12','35 分钟'], ['胜利','薇恩','下路','13 / 5 / 7','30 分钟'], ['失败','格温','上路','4 / 8 / 6','26 分钟'] ];
  return '<div class="content player-view"><div class="heading"><div><h1>玩家</h1><p>个人概览与近期战绩放在一条阅读线里。</p></div><div class="heading-actions"><label class="search">' + icon('search') + '<input id="player-search" placeholder="搜索玩家 · 原型示意" aria-label="搜索玩家" /></label><button class="button" data-action="search-player">搜索</button></div></div><section class="player-summary"><div class="player-summary-id"><div class="avatar">VN</div><div><small>当前账号 · 演示</small><h2>薇恩玩家 <span>#CN1</span></h2><p>峡谷之巅 · Lv.186</p></div></div><div class="player-summary-stats"><div><small>单双排</small><strong>钻石 III</strong><span>74 LP</span></div><div><small>近期胜率</small><strong>80%</strong><span>近 5 场</span></div><div><small>常用位置</small><strong>下路</strong><span>近 20 场</span></div></div></section><section class="player-record"><header><div><h2>最近对局</h2><p>点击一场展开演示详情。</p></div><span>近 5 场 · 演示</span></header>'
    + demoMatches.map(function (game,index) { return '<div class="record-item"><button class="record-row" data-match="' + index + '"><span class="record-result ' + (game[0]==='胜利'?'win':'loss') + '">' + game[0] + '</span><strong>' + game[1] + '</strong><span>' + game[2] + '</span><span class="record-kda">' + game[3] + '</span><small>' + game[4] + '</small>' + icon('chevron') + '</button>' + (state.matchExpanded === index ? '<div class="record-detail"><span>对局详情 · 演示数据</span><strong>参团与装备信息可在正式接入战绩后展示。</strong><button data-action="close-match">收起</button></div>' : '') + '</div>'; }).join('') + '</section><p class="page-foot">此页所有玩家与战绩数据均为演示，不代表真实客户端记录。</p></div>';
}
function guide() {
  const modes = ['峡谷','海克斯','极地','经典'];
  return '<div class="content"><div class="heading"><div><h1>攻略</h1><p>先选玩法，再看对应建议；原型暂不提供真实胜率。</p></div></div><div class="guide-modes">' + modes.map(function(mode){return '<button class="'+(state.guide===mode?'active':'')+'" data-guide="'+mode+'">'+mode+'</button>';}).join('') + '</div><section class="guide-feature"><img src="' + ASSETS.project + '" alt="源计划：净化原画" /><div class="guide-feature-copy"><span>当前玩法 · ' + state.guide + '</span><h2>薇恩</h2><p>攻略内容在此展示。正式版本需标注数据来源、版本与样本，原型不展示未经核实的推荐胜率。</p><button class="button primary" data-action="guide-preview">查看方案预览 ' + icon('arrow') + '</button></div></section><section class="guide-list"><h2>下一步可以做什么</h2><button data-action="guide-preview"><span>英雄方案</span><small>符文、技能与出装</small>' + icon('chevron') + '</button><button data-action="guide-preview"><span>阵容参考</span><small>查看当前玩法的队伍关系</small>' + icon('chevron') + '</button></section></div>';
}
function toolsPage() {
  const entries = [['客户端状态','检查连接、账号和游戏阶段','查看状态'],['房间与好友','在正式接入后统一管理邀请','查看入口'],['本地资料','查看已缓存的英雄与皮肤资源','查看资料'],['操作记录','统一核对自动动作及结果','查看记录']];
  return '<div class="content"><div class="heading"><div><h1>工具</h1><p>按任务找入口，执行结果会留在原位。</p></div></div><section class="quiet-sheet tool-sheet">' + entries.map(function(entry,index){return '<div class="tool-line"><span class="tool-line-icon">'+icon(index===0?'shield':index===1?'user':index===2?'book':'clock')+'</span><div><h2>'+entry[0]+'</h2><p>'+entry[1]+'</p></div><button class="button" data-tool="'+index+'">'+entry[2]+'</button></div>';}).join('') + '</section>' + (state.toolFeedback !== null ? '<p class="tool-feedback" role="status">' + icon('check') + ' ' + esc(entries[state.toolFeedback][0]) + '：原型入口已响应；未调用客户端。</p>' : '') + '<p class="page-foot">批量删除、领取和其他不可逆动作未在此静态原型中执行。</p></div>';
}
function settingsPage() {
  return '<div class="content"><div class="heading"><div><h1>设置</h1><p>预览界面密度与动效；只影响当前打开的原型。</p></div></div><section class="quiet-sheet"><div class="quiet-sheet-body">'
    + rule('紧凑列表','收紧本局阵容与战绩的行高。','compact',state.compact)
    + rule('界面动效','保留轻量的展开和状态反馈。','motion',state.motion)
    + '</div><div class="quiet-sheet-note">演示设置仅存在于当前页面，刷新后重置。</div></section></div>';
}
function drawer() {
  const p = players.find(function (item) { return item.id === state.drawer; });
  if (!p) return '';
  return '<div class="overlay" data-action="close-drawer"><aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '详情"><header class="drawer-head"><h2>玩家详情</h2><button class="icon-btn" data-action="close-drawer" aria-label="关闭详情">' + icon('close') + '</button></header><div class="drawer-body"><div class="drawer-profile"><img class="portrait lg" src="' + ASSETS[p.asset] + '" alt="" /><div><h2>' + esc(p.name) + '</h2><p>' + esc(p.champion) + ' · ' + esc(p.role) + ' · 演示</p></div></div><div class="drawer-metrics"><div><strong>' + p.rate + '</strong><small>近期胜率</small></div><div><strong>' + p.kda + '</strong><small>平均 KDA</small></div><div><strong>' + p.recent + '</strong><small>近 5 场</small></div></div><h3>观察笔记</h3><p class="muted">这些数据仅用于展示原型的信息层级，不构成对真实玩家的评价。</p><textarea class="note-field" rows="3" placeholder="写下仅保存在本页的临时笔记"></textarea><div class="drawer-actions"><button class="button" data-action="save-note">保存笔记</button><button class="button subtle" data-action="close-drawer">返回阵容</button></div></div></aside></div>';
}
function render() {
  const title = state.route === 'match' ? {home:'本局',wardrobe:'皮肤衣橱',automation:'自动化'}[state.tab] : {players:'玩家',guide:'攻略',tools:'工具',settings:'设置'}[state.route];
  let content = state.route === 'match' ? (state.tab === 'wardrobe' ? wardrobe() : state.tab === 'automation' ? automation() : home()) : state.route === 'players' ? playerPage() : state.route === 'guide' ? guide() : state.route === 'tools' ? toolsPage() : settingsPage();
  root.innerHTML = '<div class="app">' + rail() + '<header class="topbar"><span class="wordmark">峡谷衣橱</span><span class="crumb">' + esc(title) + '</span><div class="top-right"><span class="demo-state"><i class="dot"></i>离线演示</span><span class="window-glyph" aria-hidden="true">− □ ×</span></div></header><main class="workspace" id="workspace">' + subnav() + content + '</main>' + drawer() + '</div>';
  document.body.classList.toggle('compact',state.compact);
  document.body.classList.toggle('no-motion',!state.motion);
  document.title = title + ' · 峡谷衣橱原型';
}
root.addEventListener('click', function (event) {
  const el = event.target.closest('button,[data-action]');
  if (!el) return;
  if (el.dataset.route) { state.route = el.dataset.route; state.drawer = null; render(); return; }
  if (el.dataset.tab) { state.route = 'match'; state.tab = el.dataset.tab; state.drawer = null; render(); return; }
  if (el.dataset.team) { state.team = el.dataset.team; render(); return; }
  if (el.dataset.player) { state.drawer = el.dataset.player; render(); return; }
  if (el.dataset.skin) { state.skin = Number(el.dataset.skin); render(); return; }
  if (el.dataset.guide) { state.guide = el.dataset.guide; render(); return; }
  if (el.dataset.tool) { state.toolFeedback = Number(el.dataset.tool); render(); return; }
  if (el.dataset.match) { state.matchExpanded = state.matchExpanded === Number(el.dataset.match) ? null : Number(el.dataset.match); render(); return; }
  if (el.dataset.setting) { state[el.dataset.setting] = !state[el.dataset.setting]; render(); return; }
  if (el.dataset.action === 'close-drawer') { if (el === event.target || el.tagName === 'BUTTON') { state.drawer = null; render(); } return; }
  if (el.dataset.action === 'apply-skin') { state.appliedSkin = state.skin; render(); notify('原型演示：已切换本页选择，未写入客户端。'); return; }
  if (el.dataset.action === 'pause') { state.paused = !state.paused; render(); notify(state.paused ? '本局自动化已在原型中暂停。' : '本局自动化已在原型中恢复。'); return; }
  if (el.dataset.action === 'close-match') { state.matchExpanded = null; render(); return; }
  if (el.dataset.action === 'search-player') { notify('搜索入口示意：静态原型未连接玩家查询。'); return; }
  if (el.dataset.action === 'guide-preview') { notify('方案预览入口已响应；正式数据尚未接入。'); return; }
  if (el.dataset.action === 'save-note') { notify('笔记仅保留在当前页面输入框中。'); return; }
});
root.addEventListener('change', function (event) { if (event.target.id === 'accept-delay') { state.delay = Number(event.target.value); notify('接受延迟已调整为 ' + state.delay + ' 秒（仅原型）。'); } });
document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && state.drawer) { state.drawer = null; render(); } });
render();
