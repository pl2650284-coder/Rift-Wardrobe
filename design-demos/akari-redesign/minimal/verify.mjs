import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const at = name => new URL(name, import.meta.url);
const userData = mkdtempSync(join(tmpdir(), 'akari-history-'));
mkdirSync(at('screenshots/'), { recursive: true });
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*',
  '--remote-debugging-port=0', '--user-data-dir=' + userData, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
edge.on('error', error => console.error(error.message));

async function waitFor(read, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = await read();
    if (found) return found;
    await delay(80);
  }
  throw new Error('Timed out waiting for ' + description);
}

async function endpoint() {
  const port = await waitFor(() => {
    try {
      return readFileSync(join(userData, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    } catch {
      return '';
    }
  }, 'Edge DevTools');
  const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(4000) });
  const tabs = await response.json();
  return tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('No DevTools response for ' + method));
    }, 8000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { call, errors, close: () => socket.close() };
}

const report = [];
let page;
try {
  page = await connect(await endpoint());
  const { call } = page;
  await call('Page.enable');
  await call('Runtime.enable');

  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }

  async function load(file, width, height) {
    const url = at(file).href;
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url });
    await waitFor(() => evaluate('location.href === ' + JSON.stringify(url) + ' && document.readyState === "complete" && !!document.querySelector("h1")'), file);
    await waitFor(() => evaluate('Array.from(document.images).every(image => image.complete)'), file + ' images');
  }

  async function screenshot(name) {
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(at('screenshots/' + name + '.png'), Buffer.from(data, 'base64'));
  }

  async function click(selector) {
    assert.equal(await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element?.getClientRects().length) return false;
      element.focus();
      element.click();
      return true;
    })()`), true, 'Could not click ' + selector);
  }

  async function setFilter(id, value) {
    await evaluate(`(() => {
      const select = document.querySelector(${JSON.stringify('#' + id)});
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  async function inspect() {
    return evaluate(`(() => {
      const containers = ['.topbar', '.canvas', '.match-row', '.table-frame', '.teams'];
      return {
        width: innerWidth, height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        clipping: containers.flatMap(selector => [...document.querySelectorAll(selector)]
          .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1).map(() => selector)),
        brokenImages: [...document.images].filter(image => image.complete && !image.naturalWidth).length,
        visibleRecords: [...document.querySelectorAll('[data-match]')].filter(element => element.getBoundingClientRect().bottom <= innerHeight).length,
      };
    })()`);
  }

  async function checkLayout(label) {
    const result = await inspect();
    assert.equal(result.overflow, false, label);
    assert.deepEqual(result.clipping, [], label);
    assert.equal(result.brokenImages, 0, label);
    report.push({ view: label, ...result });
  }

  for (const id of ['a', 'b', 'c']) {
    for (const [width, height] of [[1440, 900], [1118, 803], [980, 700], [761, 700], [760, 700], [601, 812], [561, 812], [375, 812]]) {
      await load('dir-' + id + '.html', width, height);
      await checkLayout(id + '-' + width);
      if ([1440, 1118, 375].includes(width)) await screenshot(id + '-' + width);
      const matchSelector = id === 'c' ? '[data-match="2"] button' : '[data-match="2"]';
      await click(matchSelector);
      const scope = id === 'c' ? '#match-dialog[open]' : id === 'b' && width > 920 ? '#match-inspector' : '#game-2:not([hidden])';
      assert.equal(await evaluate('document.querySelectorAll(' + JSON.stringify(scope + ' .team li') + ').length'), 10);
      assert.equal(await evaluate('document.querySelector(' + JSON.stringify(scope + ' .detail-stats dd') + ').textContent'), '38,973');
      if (width === 1118) await screenshot(id + '-detail-1118');
      if (id === 'c') await click('#match-dialog [data-close]');
      assert.equal(await evaluate('document.querySelector("#match-dialog").open'), false);
    }

    await load('dir-' + id + '.html', 1118, 803);
    await setFilter('mode', 'ranked');
    assert.equal(await evaluate('document.querySelectorAll("[data-match]").length'), 4);
    await setFilter('outcome', 'remake');
    assert.equal(await evaluate('document.querySelectorAll("[data-match]").length'), 1);
    await setFilter('mode', 'hex');
    assert.equal(await evaluate('document.querySelectorAll("[data-match]").length'), 0);
    await click('[data-action="clear-filters"]');
    assert.equal(await evaluate('document.querySelectorAll("[data-match]").length'), 8);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
    assert.equal(await evaluate('document.querySelector("#search-dialog").open && document.activeElement.id'), 'player-query');
    await evaluate('document.querySelector("#player-query").value = "夏日"; document.querySelector("#player-query").dispatchEvent(new Event("input", { bubbles: true }))');
    assert.equal(await evaluate('document.querySelectorAll("#search-results button").length'), 1);
    await click('#search-results button');
    assert.equal(await evaluate('document.querySelector("h1").textContent'), '夏日回声');
    assert.equal(await evaluate('document.querySelectorAll("[data-match]").length'), 3);
    await click('[data-action="own-profile"]');
    assert.equal(await evaluate('document.querySelector("h1").textContent'), '晚风落在峡谷');

    await click('.nav [data-page="auto"]');
    await click('[data-toggle="automation"][aria-checked="false"]');
    assert.equal(await evaluate('document.querySelector("#auto-count").textContent'), '3');
    await click('.nav [data-page="match"]');
    assert.equal(await evaluate('document.querySelectorAll(".game-roster li").length'), 10);
    await click('[data-match-tab="skin"]');
    await click('[data-skin="1"]');
    await click('[data-action="apply-skin"]');
    assert.equal(await evaluate('document.querySelector(".skin-info p").textContent'), '当前演示皮肤');
    await click('.nav [data-page="tools"]');
    await click('[data-action="client-status"]');
    assert.equal(await evaluate('document.querySelector("#client-status").textContent'), '当前未连接客户端');
    await click('.nav-button[data-page="settings"]');
    await click('[data-setting="紧凑列表"]');
    assert.equal(await evaluate('document.body.classList.contains("dense")'), true);
  }

  await load('index.html', 1440, 820);
  await checkLayout('comparison');
  await screenshot('comparison');
  await load('thumbs.html', 1440, 1040);
  const frameCondition = 'Array.from(document.querySelectorAll("iframe")).every(frame => frame.contentDocument?.querySelector("h1") && [...frame.contentDocument.images].every(image => image.complete && image.naturalWidth))';
  await waitFor(() => evaluate(frameCondition), 'six thumbnail frames');
  await checkLayout('six-directions');
  await screenshot('six-directions');
  assert.deepEqual(page.errors, [], 'Browser runtime errors');
  writeFileSync(at('validation.json'), JSON.stringify({ layouts: report, runtimeErrors: page.errors }, null, 2) + '\n');
  console.log('Verified 3 drafts, 8 viewport sizes, navigation, filters, details, player search and comparison pages.');
} finally {
  page?.close();
  edge.kill();
}
