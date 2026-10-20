import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const code=ts.transpileModule(readFileSync(new URL("../ui/src/rankings-view.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function module(invoke=async()=>{throw new Error("unexpected call");}) {
  const exports={};new Function("exports","require",code)(exports,name=>{assert.equal(name,"@tauri-apps/api/core");return {invoke};});return exports;
}
const { selectRankingRows }=module();
const hero={heroId:112,name:"机械先驱",title:"维克托",roles:["mage"],iconPath:"/lol-game-data/assets/v1/champion-icons/112.png",iconUrl:null};
function row(overrides={}) {return {...hero,key:"112:mid",rank:2,tier:"T1",lane:"mid",lanes:["mid"],winRate:51.61,pickRate:9.35,banRate:24.59,rankChange:"-2",counters:[],...overrides};}
const baseRows=[row(),row({key:"112:bottom",lane:"bottom",lanes:["bottom"],winRate:54.08,pickRate:3.1})];
function snapshot(query,overrides={}) {return {...query,version:query.mode==="rift"?query.version??"16.20":null,statsDate:"20261019",rows:baseRows,versions:[{value:"16.20",label:"16.20版本"},{value:"16.19",label:"16.19版本"}],tiers:[{value:"26",label:"翡翠+"},{value:"255",label:"所有段位"}],warnings:[],...overrides};}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function controller(invoke,isNative=true){let active="rift";const renders=[];const {createRankingsView}=module(invoke);const view=createRankingsView({isNative,activeMode:()=>active,render:()=>renders.push(active),escape:s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"),icon:()=>"",image:(name,_color,_path,url)=>'<span title="'+name.replaceAll('<','&lt;').replaceAll(String.fromCharCode(34),'&quot;')+'" data-test-icon="'+(url??"")+'"></span>'});return {view,renders,activate:mode=>active=mode};}
test("sorting preserves both lanes of the same Rift hero and filters professions without mutating input",()=>{
  const sorted=selectRankingRows(baseRows,"维克托","all",{field:"winRate",asc:false});
  assert.deepEqual(sorted.map(r=>r.key),["112:bottom","112:mid"]);assert.equal(baseRows[0].key,"112:mid");
  assert.equal(selectRankingRows(baseRows,"112","mage",{field:"rank",asc:true}).length,2);
  assert.equal(selectRankingRows(baseRows,"","tank",{field:"rank",asc:true}).length,0);
  const grades=[row({tier:null}),row({tier:"T4"}),row({tier:"T0"})];assert.deepEqual(selectRankingRows(grades,"","all",{field:"tier",asc:true}).map(r=>r.tier),["T0","T4",null]);
});
test("Rift requests carry lane tier and version, and late responses cannot overwrite a newer filter",async()=>{
  const first=deferred(),second=deferred();const queries=[];
  const {view}=controller(async(command,args)=>{assert.equal(command,"get_official_ranking");queries.push(args.query);return queries.length===1?first.promise:second.promise;});
  const initial=view.load("rift");view.setFilter("rift",{lane:"top",tier:255,version:"16.19"});
  assert.deepEqual(queries[1],{mode:"rift",lane:"top",tier:255,version:"16.19"});
  second.resolve(snapshot(queries[1],{statsDate:"20261011",rows:[row({heroId:114,key:"114:top",lane:"top",name:"无双剑姬"})]}));await settle();
  first.resolve(snapshot(queries[0]));await initial;
  const html=view.renderPage("rift","MODE NAV");assert.match(html,/无双剑姬/);assert.doesNotMatch(html,/机械先驱/);assert.match(html,/2026-10-11/);assert.ok(html.startsWith("MODE NAV"));
});
test("three modes keep independent responses and classic assets never map onto modern hero IDs",async()=>{
  const {view,activate}=controller(async(_command,{query})=>snapshot(query,query.mode==="classic"?{rows:[row({heroId:60011,name:"易",title:"无极剑圣",key:"60011:all",lane:null,iconPath:null,iconUrl:"https://game.gtimg.cn/images/lol/act/img/jade/championsHeadICON/60011.png"})]}:{rows:[row({tier:null,banRate:null})]}));
  await view.load("rift");activate("classic");await view.load("classic");activate("aram");await view.load("aram");
  const classic=view.renderPage("classic","");assert.match(classic,/jade\/championsHeadICON\/60011.png/);assert.match(classic,/data-ranking-row="60011:all"/);assert.doesNotMatch(classic,/data-ranking-filter="tier"/);
  const aram=view.renderPage("aram","");assert.doesNotMatch(aram,/>T级|>禁用率|hex-tier/);assert.match(aram,/英雄职业/);
  assert.match(view.renderPage("rift",""),/data-ranking-filter="tier"/);
});
test("failed or mismatched official requests stay retryable and never reuse another mode's rows",async()=>{
  let calls=0;const {view}=controller(async(_command,{query})=>{calls++;if(calls===1)throw new Error("官网连接失败");if(calls===2)return snapshot(query,{mode:"classic"});return snapshot(query);});
  await view.load("rift");assert.match(view.renderPage("rift",""),/官网连接失败/);
  await view.load("rift",true);assert.match(view.renderPage("rift",""),/筛选条件不匹配/);assert.doesNotMatch(view.renderPage("rift",""),/data-ranking-row=/);
  await view.load("rift",true);assert.match(view.renderPage("rift",""),/data-ranking-row=/);
});
test("cached requests are shared, refresh bypasses cache, and empty results can be retried",async()=>{
  const pending=deferred();let calls=0;const {view}=controller(async(_command,{query})=>{calls++;return calls===1?pending.promise:snapshot(query,{rows:[]});});
  const first=view.load("rift");await view.load("rift");assert.equal(calls,1);
  pending.resolve(snapshot({mode:"rift",lane:"all",tier:26,version:null}));await first;await view.load("rift");assert.equal(calls,1);
  await view.load("rift",true);assert.equal(calls,2);await view.load("rift");assert.equal(calls,3);
});
test("browser preview cannot fabricate official rows and untrusted labels are escaped",async()=>{
  const browser=controller(async()=>assert.fail("native request from preview"),false);await browser.view.load("rift");assert.match(browser.view.renderPage("rift",""),/请在桌面应用中/);
  const {view}=controller(async(_command,{query})=>snapshot(query,{rows:[row({name:'<script>alert(1)</script>'})]}));await view.load("rift");assert.doesNotMatch(view.renderPage("rift",""),/<script>/);assert.match(view.renderPage("rift",""),/&lt;script>/);
});
