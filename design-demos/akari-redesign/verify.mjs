import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
const dir=dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir,'screenshots'),{recursive:true});
const port=9348;
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${join(tmpdir(),'wardrobe-style-review-'+Date.now())}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(p){let r=await fetch(`http://127.0.0.1:${port}${p}`);return r.json()}
function connect(url){return new Promise((resolve,reject)=>{let ws=new WebSocket(url),id=0,pending=new Map(),errors=[];ws.onopen=()=>resolve({call(method,params={}){return new Promise((res,rej)=>{let n=++id;pending.set(n,{res,rej});ws.send(JSON.stringify({id:n,method,params}))})},errors,close:()=>ws.close()});ws.onerror=reject;ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.id){let p=pending.get(m.id);pending.delete(m.id);m.error?p?.rej(Error(JSON.stringify(m.error))):p?.res(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''))}})}
const report=[];
let browser;
try{
 for(let n=0;n<100;n++){try{browser=await connect((await json('/json/version')).webSocketDebuggerUrl);break}catch{await sleep(200)}}
 if(!browser)throw Error('Edge did not start');
 const {targetId}=await browser.call('Target.createTarget',{url:'about:blank'});
 const info=(await json('/json/list')).find(t=>t.id===targetId);
 const page=await connect(info.webSocketDebuggerUrl);
 await page.call('Page.enable');await page.call('Runtime.enable');
 const evaluate=async expression=>{const r=await page.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value};
 const load=async(file,w,h)=>{await page.call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await page.call('Page.navigate',{url:pathToFileURL(join(dir,file)).href});for(let n=0;n<100;n++){await sleep(60);if(await evaluate("document.readyState==='complete' && !!document.querySelector('h1')"))break}await sleep(150)};
 const click=async selector=>{let found=await evaluate(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true})()`);if(!found)throw Error('Missing interaction '+selector)};
 const screenshot=async name=>{const r=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(dir,'screenshots',name),Buffer.from(r.data,'base64'))};
 const check=async()=>evaluate(`(()=>({width:innerWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:!!document.querySelector('#main')&&document.querySelector('#main').scrollWidth>document.querySelector('#main').clientWidth+1,brokenImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.alt),title:document.title}))()`);
 for(const v of ['a','b','c']){
  await load(`dir-${v}.html`,1440,900);report.push({variant:v,view:'1440',...await check()});await screenshot(`${v}-1440.png`);
  const fullHeight=await evaluate("Math.max(900,document.querySelector('#main').scrollHeight+document.querySelector('.titlebar').offsetHeight+document.querySelector('.navigation').offsetHeight*(document.body.dataset.variant==='a'?1:0)+90)");
  await page.call('Emulation.setDeviceMetricsOverride',{width:1440,height:fullHeight,deviceScaleFactor:1,mobile:false});await screenshot(`${v}-full.png`);await page.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await click('[data-player="0"]');await evaluate("document.querySelector('#note').value='再次相遇：配合默契'");await click('[data-do="save-note"]');await click('[data-tag="配合默契"]');await click('[data-do="close"]');
  await click('[data-key="tab"][data-value="wardrobe"]');await click('[data-key="skin"][data-value="1"]');await click('[data-do="apply-skin"]');await click('[data-do="save-preset"]');await screenshot(`${v}-wardrobe.png`);
  await click('[data-page="auto"]');await click('[data-key="autoTab"][data-value="出场预设"]');if(!await evaluate("document.querySelector('.saved-preset').textContent.includes('觅心猎手')"))throw Error('Shared preset mismatch');await screenshot(`${v}-automation.png`);
  await click('[data-key="autoTab"][data-value="选英雄"]');await click('[data-rule="选英雄"]');await click('[data-move="1"]');
  await click('[data-page="history"]');await click('[data-expand="0"]');await screenshot(`${v}-history.png`);
  await click('[data-page="guide"]');await click('[data-key="guideMode"][data-value="海克斯"]');await click('[data-key="guideChampion"][data-value="Ahri"]');await click('[data-do="save-preset"]');
  await click('[data-page="tools"]');await click('[data-tool-title="修复窗口尺寸"]');await click('[data-do="tool-confirm"]');
  await click('[data-do="search"]');await evaluate("document.querySelector('#search-input').value='晚风';document.querySelector('#search-input').dispatchEvent(new Event('input',{bubbles:true}))");await click('[data-search-player="0"]');
  await click('[data-page="match"]');await click('[data-key="tab"][data-value="overview"]');await click('[data-do="mini"]');await click('.mini-window [data-do="mini"]');
  for(const phase of ['房间','匹配','游戏中','结算']){await evaluate(`document.querySelector('[data-field="phase"]').value=${JSON.stringify(phase)};document.querySelector('[data-field="phase"]').dispatchEvent(new Event('change',{bubbles:true}))`);report.push({variant:v,phase,...await check()})}
  for(const [w,h] of [[980,700],[375,812]]){await load(`dir-${v}.html`,w,h);report.push({variant:v,view:String(w),...await check()});await screenshot(`${v}-${w}.png`);for(const route of ['history','guide','auto','tools','settings']){await click(`[data-page="${route}"]`);report.push({variant:v,view:String(w),route,...await check()})}}
 }
 await load('index.html',1440,1100);await screenshot('comparison.png');
 await load('thumbs.html',1530,900);await screenshot('six-directions.png');
 report.push({runtimeErrors:page.errors});
 writeFileSync(join(dir,'validation.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:report.length,failures:report.filter(r=>r.bodyOverflow||r.mainOverflow||r.brokenImages?.length),runtimeErrors:page.errors},null,2));
 await browser.call('Browser.close');page.close();browser.close();
}finally{edge.kill()}
