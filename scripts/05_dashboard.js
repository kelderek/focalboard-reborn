#!/usr/bin/env node
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKLOG = path.join(__dirname,"../data/backlog.json");
if (!fs.existsSync(BACKLOG)) { console.error("No backlog.json"); process.exit(1); }
const bl = JSON.parse(fs.readFileSync(BACKLOG,"utf8"));
const args = process.argv.slice(2);
let items = bl;
const ci=args.indexOf("--category"); if(ci>-1) items=items.filter(i=>i.triage.category===args[ci+1]);
const si=args.indexOf("--status");   if(si>-1) items=items.filter(i=>i.status===args[si+1]);
if(args.includes("--json")){console.log(JSON.stringify(items,null,2));process.exit(0);}
const PL={security:"🔴 Security",crash:"🔴 Crash","data-loss":"🔴 Data loss",bug:"🟠 Bug",performance:"🟡 Perf",feature:"🟢 Feature",enhancement:"🟢 Enhancement",documentation:"🔵 Docs",i18n:"⚪ i18n",chore:"⚪ Chore",unknown:"❓ Unknown"};
const SI={"open":"○","in-progress":"◑","done":"●","failed":"✕"};
const W=100; const L="─".repeat(W);
console.log("\n"+"═".repeat(W));
console.log("  FOCALBOARD REBORN — AGENT BACKLOG");
console.log("═".repeat(W));
console.log(`\n  Total:${bl.length}  Open:${bl.filter(i=>i.status==="open").length}  Done:${bl.filter(i=>i.status==="done").length}  Failed:${bl.filter(i=>i.status==="failed").length}  Auto-eligible:${bl.filter(i=>i.triage.auto_attempt&&i.status==="open").length}  Human-only:${bl.filter(i=>!i.triage.auto_attempt).length}\n`);
const byC={};
for(const i of items){byC[i.triage.category]??=[];byC[i.triage.category].push(i);}
for(const cat of ["security","crash","data-loss","bug","performance","feature","enhancement","documentation","i18n","chore","unknown"]){
  const g=byC[cat]; if(!g?.length) continue;
  console.log(`\n  ${PL[cat]||cat} (${g.length})`); console.log("  "+L.substring(0,W-2));
  console.log(`  ${"#".padEnd(6)} ${"Status".padEnd(13)} ${"Auto".padEnd(5)} ${"Cmplx".padEnd(8)} ${"Att".padEnd(4)} Title`);
  for(const i of g) console.log(`  ${String(i.fork_issue_number||`u${i.number}`).padEnd(6)} ${((SI[i.status]||"?")+` ${i.status}`).padEnd(13)} ${(i.triage.auto_attempt?"✓":"✗").padEnd(5)} ${i.triage.complexity.padEnd(8)} ${String(i.attempts).padEnd(4)} ${i.title.substring(0,W-47)}`);
}
const nxt=bl.filter(i=>i.triage.auto_attempt&&i.status==="open"&&i.attempts<3);
if(nxt.length){console.log("\n\n  NEXT UP (top 5)"); console.log("  "+L.substring(0,W-2));
  for(const i of nxt.slice(0,5)) console.log(`  #${String(i.fork_issue_number||`u${i.number}`).padEnd(6)} ${(PL[i.triage.category]||i.triage.category).padEnd(20)} ${i.title.substring(0,60)}`);}
const prs=bl.filter(i=>i.pr_url);
if(prs.length){console.log("\n\n  RECENT PRS"); console.log("  "+L.substring(0,W-2));
  for(const i of prs.slice(-10)) console.log(`  #${i.fork_issue_number} ${i.title.substring(0,50).padEnd(52)} ${i.pr_url}`);}
console.log("\n"+"═".repeat(W)+"\n");
