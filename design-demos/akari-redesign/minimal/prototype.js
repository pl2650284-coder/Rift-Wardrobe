const demo = JSON.parse(document.querySelector('#demo').textContent);
const { icons, images, champions, modes, matches, players, profiles, skinChoices, titles } = demo;
const direction = document.body.dataset.direction;
const narrow = matchMedia('(max-width: 920px)');
const nav = { history: '战绩', match: '对局', auto: '自动化', tools: '工具集', settings: '设置' };
const outcomes = { win: '胜利', loss: '失败', remake: '重开' };
const state = {
  page: 'history', profile: 0, mode: '', outcome: '', expanded: null, selected: 1,
  phase: '英雄选择', matchTab: 'lineup', skin: 0, equipped: 0,
  automation: { '自动接受对局': true, '断线时自动重连': true, '自动应用出场皮肤': false },
  settings: { '列表显示出装': true, '紧凑列表': false },
};
const number = new Intl.NumberFormat('zh-CN');
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const profile = () => profiles[state.profile];
const riotId = person => person.name + '#' + person.tag;
const image = (key, name = '', className = '') => `<img class="${className}" src="${images[key]}" alt="${/^[irs]:/.test(key) ? escape(name) : ''}"${name ? ' title="' + escape(name) + '"' : ''}>`;
const portrait = (key, className = 'champion') => image('c:' + key, champions[key], className);
const score = match => `<span class="score">${match.score[0]}<i> / </i><b>${match.score[1]}</b><i> / </i>${match.score[2]}</span>`;
const kda = match => match.result === 'remake' ? '—' : ((match.score[0] + match.score[2]) / Math.max(match.score[1], 1)).toFixed(2);
const gear = match => Array.from({ length: 6 }, (_, index) => {
  const id = match.gear[index];
  return id ? image('i:' + id, titles.items[id], 'item-icon') : '<span class="empty-slot"></span>';
}).join('');
const abilities = match => {
  let spell = 'SummonerSnowball';
  if (match.mode === 'ranked') {
    spell = { JarvanIV: 'SummonerSmite', Gwen: 'SummonerTeleport', Ahri: 'SummonerDot' }[match.champ] ?? 'SummonerHeal';
  }
  return `<span class="spell-stack">${['SummonerFlash', spell].map(key => image('s:' + key, titles.spells[key])).join('')}</span>
    ${image('r:' + match.rune, titles.runes[match.rune], 'rune-icon')}`;
};
const loadout = (match, withAbilities = false) => `<span class="loadout">${withAbilities ? abilities(match) : ''}<span class="gear">${gear(match)}</span></span>`;
const outcome = match => `<strong class="outcome ${match.result}">${outcomes[match.result]}</strong>`;
const format = value => number.format(value);

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('visible'), 2600);
}

function optionList(options, active) {
  return Object.entries(options).map(([id, label]) => `<option value="${id}"${id === active ? ' selected' : ''}>${label}</option>`).join('');
}

function shell() {
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand">${image('logo', '', 'logo')}<strong>峡谷衣橱</strong></div>
      <nav class="nav" aria-label="主要功能">
        ${Object.keys(nav).filter(page => page !== 'settings').map(page =>
          `<button class="nav-button" data-page="${page}">${icons[page]}<span>${nav[page]}</span></button>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <button class="local-account" data-action="own-profile" title="查看本机账号战绩">
          ${portrait(profiles[0].avatar, 'local-avatar')}<span><strong>${profiles[0].name}</strong><small>本机账号</small></span>
        </button>
        <button class="nav-button" data-page="settings">${icons.settings}<span>设置</span></button>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="window-context" id="window-context"></div>
        <div class="window-actions">
          <button class="control search-button" data-action="search" aria-label="搜索玩家" title="搜索玩家（Ctrl+K）">${icons.search}<span>搜索玩家</span><kbd>Ctrl K</kbd></button>
          <button class="control auto-button" data-page="auto">${icons.auto}<span>自动化</span><strong id="auto-count"></strong></button>
          <span class="offline"><i></i>离线演示</span>
        </div>
      </header>
      <main class="canvas" id="main" aria-label="工作区"></main>
    </div>
  </div>`;
}

function profileHeader() {
  const person = profile();
  const winRate = Math.round(100 * person.wins / (person.wins + person.losses));
  return `<section class="profile" aria-label="玩家资料">
    <div class="identity">
      ${portrait(person.avatar, 'profile-avatar')}
      <div class="identity-info">
        <h1>${person.name}</h1>
        <div class="profile-meta"><span>#${person.tag}</span><span>${person.region}</span>
          <button class="icon-button copy-id" data-action="copy-id" aria-label="复制 Riot ID" title="复制 Riot ID">${icons.copy}</button>
        </div>
      </div>
    </div>
    <div class="rank-group">
      <div class="rank rank-primary">
        <span class="rank-symbol">${icons.shield}</span>
        <div><span class="rank-label">单双排</span><strong>${person.rank}<small>${person.lp} LP</small></strong><p>${person.wins} 胜 ${person.losses} 负<span class="rank-rate">${winRate}% 胜率</span></p></div>
      </div>
      <div class="rank rank-flex"><div><span class="rank-label">灵活组排</span><strong>未定级</strong></div></div>
    </div>
  </section>`;
}

function historyPage() {
  return `<div class="history-page">
    ${profileHeader()}
    <section class="history" aria-labelledby="history-title">
      <div class="history-toolbar">
        <div class="history-title"><h2 id="history-title">最近战绩</h2><span class="muted" id="history-count" aria-live="polite"></span></div>
        <div class="filters">
          <label class="select"><span class="sr-only">模式</span><select id="mode">${optionList({ '': '全部模式', ...modes }, state.mode)}</select>${icons.down}</label>
          <label class="select"><span class="sr-only">赛果</span><select id="outcome">${optionList({ '': '全部赛果', ...outcomes }, state.outcome)}</select>${icons.down}</label>
        </div>
      </div>
      <div class="history-body${direction === 'b' ? ' split' : ''}">
        <div id="records"></div>
        ${direction === 'b' ? '<aside id="match-inspector" class="match-inspector" aria-label="当前对局详情"></aside>' : ''}
      </div>
    </section>
  </div>`;
}

function distribute(total, count, offset) {
  const weights = Array.from({ length: count }, (_, index) => 2 + (index + offset) % count);
  let weightLeft = weights.reduce((sum, weight) => sum + weight, 0);
  let pointsLeft = total;
  return weights.map(weight => {
    const share = Math.floor(pointsLeft * weight / weightLeft);
    pointsLeft -= share;
    weightLeft -= weight;
    return share;
  });
}

function gameRoster(match) {
  const name = profile().name;
  const guests = players.filter(([key, guest]) => key !== match.champ && guest !== name);
  const pivot = (match.id - 1) % guests.length;
  const roster = [...guests.slice(pivot), ...guests.slice(0, pivot)];
  const [kills, deaths, assists] = match.score;
  const total = match.result === 'remake' ? 0 : Math.round((kills + assists) * 1.28);
  const opposingTotal = total ? Math.max(deaths, Math.round(total * (match.result === 'win' ? .81 : 1.2))) : 0;
  const makeSquad = (members, ownKills, ownDeaths, squadKills) => {
    const killsByMember = distribute(ownKills, members.length, match.id);
    const deathsByMember = distribute(ownDeaths, members.length, match.id + 2);
    return members.map(([champ, player], i) => ({
      champ, name: player, score: [killsByMember[i], deathsByMember[i], Math.floor((squadKills - killsByMember[i]) * (4 + i) / 12)],
    }));
  };
  return [
    [{ champ: match.champ, name, score: match.score, self: true }, ...makeSquad(roster.slice(0, 4), total - kills, opposingTotal - deaths, total)],
    makeSquad(roster.slice(4, 9), opposingTotal, total, opposingTotal),
  ];
}

function team(team, name, result) {
  const totalKills = result ? team.reduce((total, member) => total + member.score[0], 0) : null;
  return `<section class="team">
    <h3><span>${name}</span>${result ? '<span class="outcome ' + result + '">' + outcomes[result] + '</span>' : ''}</h3>
    <ul>${team.map(member => `<li${member.self ? ' class="self"' : ''}>
      ${portrait(member.champ)}<span class="roster-name" title="${member.name}">${member.name}</span>
      <span>${result ? member.score.join('/') : champions[member.champ]}</span>
    </li>`).join('')}</ul>
    ${result ? '<div class="team-total"><span>总击杀</span><strong>' + totalKills + '</strong></div>' : ''}
  </section>`;
}

function teams([ally, enemy], result) {
  const opponent = { win: 'loss', loss: 'win', remake: 'remake' }[result];
  return `<div class="teams">${team(ally, '我方阵容', result)}${team(enemy, '敌方阵容', opponent)}</div>`;
}

function matchDetail(match, inline = false) {
  const squads = gameRoster(match);
  const kills = squads[0].reduce((total, player) => total + player.score[0], 0);
  const participation = kills ? Math.round(100 * (match.score[0] + match.score[2]) / kills) + '%' : '—';
  return `<div class="match-detail">
    ${inline ? '' : `<div class="detail-summary">
      ${portrait(match.champ, 'detail-avatar')}
      <div class="detail-identity"><h2>${champions[match.champ]} ${outcome(match)}</h2><p>${modes[match.mode]}<span>${match.duration}</span></p></div>
      <div class="detail-score">${score(match)}<small>${kda(match)} KDA</small></div>
    </div>`}
    <div class="detail-overview">
      <div class="detail-build"><span>出装与符文</span>${loadout(match, true)}</div>
      <dl class="detail-stats">
        <div><dt>伤害</dt><dd>${format(match.damage)}</dd></div>
        <div><dt>参团率</dt><dd>${participation}</dd></div>
        <div><dt>补刀</dt><dd>${format(match.cs)}</dd></div>
        <div><dt>金币</dt><dd>${format(match.gold)}</dd></div>
      </dl>
    </div>
    ${teams(squads, match.result)}
  </div>`;
}

function matchLabel(match) {
  return champions[match.champ] + '，' + outcomes[match.result] + '，' + match.score.join(' / ') + '，' + match.age + '，查看对局详情';
}

function matchRow(match) {
  const open = state.expanded === match.id;
  const split = direction === 'b';
  const identity = `<span class="match-identity">${portrait(match.champ)}
    <span class="match-name"><span><strong>${champions[match.champ]}</strong>${outcome(match)}</span>
      <small>${modes[match.mode]}<span class="inline-age"> · ${match.age}</span></small></span></span>`;
  return `<div class="record ${match.result}${open ? ' expanded' : ''}">
    <button class="match-row" data-match="${match.id}" aria-label="${matchLabel(match)}"
      ${split && !narrow.matches ? 'aria-pressed="' + (state.selected === match.id) + '" aria-controls="match-inspector"' :
        'aria-expanded="' + open + '" aria-controls="game-' + match.id + '"'}>
      ${identity}
      <span class="row-score">${score(match)}<small>${kda(match)} KDA</small></span>
      ${split ? '' : `<span class="row-build">${loadout(match, true)}</span>
        <span class="row-damage"><strong>${format(match.damage)}</strong><small>伤害</small></span>
        <span class="row-time"><strong>${match.duration}</strong><small>${match.age}</small></span>`}
      <span class="row-arrow">${split ? icons.right : icons.down}</span>
    </button>
    <div class="inline-detail" id="game-${match.id}"${open ? '' : ' hidden'}>${open ? matchDetail(match, !split) : ''}</div>
  </div>`;
}

function matchTable(records) {
  return `<div class="table-frame"><table class="match-table">
    <thead><tr><th>赛果</th><th>英雄</th><th class="table-mode">模式</th><th>击杀 / 死亡 / 助攻</th>
      <th class="table-build">出装</th><th class="table-damage">伤害</th><th class="table-time">结束时间</th><th class="table-open"><span class="sr-only">详情</span></th></tr></thead>
    <tbody>${records.map(match => `<tr data-match="${match.id}" class="${match.result}">
      <td>${outcome(match)}</td>
      <td><span class="table-hero">${portrait(match.champ)}<span><strong>${champions[match.champ]}</strong><small class="table-mobile-mode">${modes[match.mode]}</small></span></span></td>
      <td class="table-mode">${modes[match.mode]}</td>
      <td><span class="row-score">${score(match)}<small>${kda(match)} KDA</small></span></td>
      <td class="table-build">${loadout(match)}</td>
      <td class="table-damage">${format(match.damage)}</td>
      <td class="table-time"><span class="row-time"><strong>${match.age}</strong><small>${match.duration}</small></span></td>
      <td class="table-open"><button class="icon-button" aria-haspopup="dialog" aria-label="${matchLabel(match)}">${icons.right}</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderHistory() {
  const sample = matches.filter(match => profile().games.includes(match.id));
  const visible = sample.filter(match => (!state.mode || match.mode === state.mode) && (!state.outcome || match.result === state.outcome));
  const current = visible.find(match => match.id === state.selected) ?? visible[0];
  state.selected = current?.id ?? null;
  if (!visible.some(match => match.id === state.expanded)) state.expanded = null;
  $('#history-count').textContent = visible.length + ' 场';
  let list = '<p class="empty">没有符合筛选条件的对局。<button class="text-button" data-action="clear-filters">清除筛选</button></p>';
  if (visible.length) {
    if (direction === 'c') list = matchTable(visible);
    else if (direction === 'e') {
      const sections = ['今天', '昨天', '更早'].map((label, index) => {
        const games = visible.filter(match => (match.age.includes('小时') ? 0 : match.age === '昨天' ? 1 : 2) === index);
        return games.length ? `<section class="date-group"><h3>${label}</h3>${games.map(matchRow).join('')}</section>` : '';
      });
      list = sections.join('');
    } else list = visible.map(matchRow).join('');
  }
  $('#records').innerHTML = list;
  const inspector = $('#match-inspector');
  if (inspector) {
    inspector.hidden = !current;
    inspector.innerHTML = current ? matchDetail(current) : '';
  }
}

function openMatch(id, opener) {
  const match = matches.find(record => record.id === id);
  if (direction === 'c') {
    const dialog = $('#match-dialog');
    dialog.innerHTML = `<header class="dialog-header"><h2 id="drawer-title">对局详情</h2><button class="icon-button" data-close aria-label="关闭详情">${icons.close}</button></header>${matchDetail(match)}`;
    opener.querySelector('button')?.focus({ preventScroll: true });
    dialog.showModal();
    return;
  }
  if (direction === 'b') state.selected = id;
  state.expanded = direction === 'b' && !narrow.matches || state.expanded === id ? null : id;
  renderHistory();
  $('#records button[data-match="' + opener.dataset.match + '"]')?.focus({ preventScroll: true });
}

function matchPage() {
  const playing = state.phase !== '等待客户端';
  const skin = skinChoices[state.skin];
  const liveTeams = [
    [{ champ: 'Vayne', name: profiles[0].name, self: true }, ...[0, 1, 2, 4].map(index => {
      const [champ, name] = players[index];
      return { champ, name };
    })],
    players.slice(5, 10).map(([champ, name]) => ({ champ, name })),
  ];
  const page = state.matchTab === 'skin'
    ? `<section class="wardrobe">
        <div class="skin-preview">${image(skin.key, skin.name)}</div>
        <div class="skin-info"><h2>${skin.name} · 薇恩</h2>
          <p class="muted">${state.equipped === state.skin ? '当前演示皮肤' : '可在原型中设为出场皮肤'}</p>
          <div class="skin-options">${skinChoices.map((item, index) => `<button class="control" data-skin="${index}" aria-pressed="${state.skin === index}">${item.name}</button>`).join('')}</div>
          <button class="control action-primary" data-action="apply-skin"${state.skin === state.equipped ? ' disabled' : ''}>设为出场皮肤</button>
        </div>
      </section>`
    : playing ? `<div class="game-roster">${teams(liveTeams)}</div>` : '<p class="empty">没有正在进行的对局。</p>';
  return `<div class="secondary-page">
    <div class="page-heading"><div><h1>本局对局</h1><p class="muted">单双排 · 召唤师峡谷</p></div>
      <label class="select"><span class="sr-only">演示阶段</span><select id="phase">${optionList({ '英雄选择': '英雄选择', '游戏中': '游戏中', '等待客户端': '等待客户端' }, state.phase)}</select>${icons.down}</label>
    </div>
    <div class="page-tabs" aria-label="对局视图">
      <button class="control" data-match-tab="lineup" aria-pressed="${state.matchTab === 'lineup'}">本局阵容</button>
      <button class="control" data-match-tab="skin" aria-pressed="${state.matchTab === 'skin'}">皮肤衣橱</button>
    </div>
    ${page}
  </div>`;
}

function switches(group, descriptions) {
  return '<div class="settings-list">' + Object.entries(state[group]).map(([name, value]) => `<div class="setting">
    <div><h2>${name}</h2><p class="muted">${descriptions[name]}</p></div>
    <button class="switch" data-toggle="${group}" data-setting="${name}" role="switch" aria-checked="${value}" aria-label="${name}"><i></i></button>
  </div>`).join('') + '</div>';
}

function secondaryPage() {
  if (state.page === 'match') return matchPage();
  if (state.page === 'auto') return `<div class="secondary-page"><div class="page-heading"><div><h1>自动化</h1><p class="muted">演示规则</p></div></div>
    ${switches('automation', { '自动接受对局': '匹配成功后确认进入。', '断线时自动重连': '中断后尝试重新进入对局。', '自动应用出场皮肤': '进入英雄选择后应用已选皮肤。' })}</div>`;
  if (state.page === 'settings') return `<div class="secondary-page"><div class="page-heading"><h1>设置</h1></div>
    ${switches('settings', { '列表显示出装': '在战绩中显示每局装备，详情始终可查看。', '紧凑列表': '减少每场战绩占用的高度。' })}</div>`;
  return `<div class="secondary-page"><div class="page-heading"><h1>工具集</h1></div><div class="settings-list">
    <div class="setting"><div><h2>当前 Riot ID</h2><p class="muted">${riotId(profile())}</p></div><button class="control" data-action="copy-id">${icons.copy}复制</button></div>
    <div class="setting"><div><h2>客户端连接</h2><p id="client-status" class="muted" aria-live="polite">离线演示</p></div><button class="control" data-action="client-status">检查状态</button></div>
  </div></div>`;
}

function updateChrome() {
  $('#window-context').innerHTML = state.page === 'history'
    ? `<span class="context-tab">${portrait(profile().avatar, 'tab-avatar')}<strong>${profile().name}</strong><span class="tab-tag">#${profile().tag}</span></span>`
    : `<span class="context-tab">${icons[state.page]}<strong>${nav[state.page]}</strong></span>`;
  const enabled = Object.values(state.automation).filter(Boolean).length;
  $('#auto-count').textContent = enabled;
  $('.auto-button').setAttribute('aria-label', '自动化，已开启 ' + enabled + ' 条规则');
  document.querySelectorAll('.nav-button').forEach(button => {
    if (button.dataset.page === state.page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.body.classList.toggle('no-gear', !state.settings['列表显示出装']);
  document.body.classList.toggle('dense', state.settings['紧凑列表']);
}

function renderPage() {
  updateChrome();
  $('#main').innerHTML = state.page === 'history' ? historyPage() : secondaryPage();
  if (state.page === 'history') renderHistory();
}

function goTo(page) {
  state.page = page;
  renderPage();
  window.scrollTo(0, 0);
}

function showProfile(index) {
  Object.assign(state, { profile: index, selected: null, expanded: null, mode: '', outcome: '' });
  $('#search-dialog').close();
  goTo('history');
}

function searchResults() {
  const query = $('#player-query').value.trim().replace(/\s+/g, '').toLowerCase();
  const results = profiles.flatMap((person, index) => riotId(person).toLowerCase().includes(query)
    ? [`<button class="search-result" data-profile="${index}" type="button">${portrait(person.avatar)}<span><strong>${person.name}</strong><small>#${person.tag} · ${person.region}</small></span>${icons.right}</button>`]
    : []);
  $('#search-results').innerHTML = results.length ? results.join('') : '<p class="empty">没有找到匹配的演示玩家。</p>';
}

function openSearch() {
  const dialog = $('#search-dialog');
  if (dialog.open || $('#match-dialog').open) return;
  dialog.innerHTML = `<header class="dialog-header"><h2 id="search-title">搜索玩家</h2><button class="icon-button" data-close aria-label="关闭搜索">${icons.close}</button></header>
    <form id="player-search">
      <label class="search-field">${icons.search}<span class="sr-only">昵称或 Riot ID</span><input id="player-query" placeholder="输入昵称或 Riot ID" autocomplete="off" autofocus></label>
      <div id="search-results" aria-live="polite"></div>
    </form>`;
  searchResults();
  dialog.showModal();
}

function clearFilters() {
  state.mode = '';
  state.outcome = '';
  $('#mode').value = '';
  $('#outcome').value = '';
  renderHistory();
  $('#mode').focus();
}

async function copyId() {
  const id = riotId(profile());
  try {
    await navigator.clipboard.writeText(id);
    toast('已复制 ' + id);
  } catch {
    toast('Riot ID：' + id);
  }
}

const actions = {
  'own-profile': () => showProfile(0),
  'search': openSearch,
  'copy-id': copyId,
  'clear-filters': clearFilters,
  'apply-skin': () => {
    state.equipped = state.skin;
    renderPage();
    toast('已选择 ' + skinChoices[state.skin].name);
  },
  'client-status': () => { $('#client-status').textContent = '当前未连接客户端'; },
};

$('#app').addEventListener('click', event => {
  const page = event.target.closest('[data-page]');
  if (page) {
    goTo(page.dataset.page);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    actions[action.dataset.action]();
    return;
  }
  const record = event.target.closest('[data-match]');
  if (record) {
    openMatch(Number(record.dataset.match), record);
    return;
  }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const { toggle: group, setting } = toggle.dataset;
    state[group][setting] = !state[group][setting];
    toggle.setAttribute('aria-checked', String(state[group][setting]));
    updateChrome();
    return;
  }
  const tab = event.target.closest('[data-match-tab]');
  const skin = event.target.closest('[data-skin]');
  if (tab || skin) {
    if (tab) state.matchTab = tab.dataset.matchTab;
    if (skin) state.skin = Number(skin.dataset.skin);
    const selector = tab ? '[data-match-tab="' + state.matchTab + '"]' : '[data-skin="' + state.skin + '"]';
    renderPage();
    $(selector)?.focus({ preventScroll: true });
  }
});

$('#app').addEventListener('change', event => {
  const { id, value } = event.target;
  if (id === 'mode' || id === 'outcome') {
    state[id] = value;
    renderHistory();
  }
  if (id === 'phase') {
    state.phase = value;
    renderPage();
    $('#phase').focus();
  }
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    const player = event.target.closest('[data-profile]');
    if (player) showProfile(Number(player.dataset.profile));
    if (event.target.closest('[data-close]') || event.target === dialog) dialog.close();
  });
}
$('#search-dialog').addEventListener('input', searchResults);
$('#search-dialog').addEventListener('submit', event => {
  event.preventDefault();
  const result = $('#search-results button');
  if (result) showProfile(Number(result.dataset.profile));
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
});
narrow.addEventListener('change', () => {
  if (direction === 'b' && state.page === 'history') renderHistory();
});

$('#app').innerHTML = shell();
renderPage();
