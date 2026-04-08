#!/usr/bin/env node
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKLOG = path.join(__dirname,"../data/backlog.json");
const PM={security:1,crash:2,"data-loss":2,bug:3,performance:4,feature:5,enhancement:5,documentation:6,i18n:7,translation:7,chore:8};
const load=()=>{if(!fs.existsSync(BACKLOG)){console.error("No backlog.json");process.exit(1);}return JSON.parse(fs.readFileSync(BACKLOG,"utf8"));};
const save=d=>{fs.writeFileSync(BACKLOG,JSON.stringify(d,null,2));console.log("Saved.");};
const idx=(d,n)=>{const i=d.findIndex(x=>x.fork_issue_number===parseInt(n,10));if(i===-1){console.error(`#${n} not found`);process.exit(1);}return i;};
const [,,cmd,...rest]=process.argv;
if(cmd==="list-failed"){const d=load();const f=d.filter(i=>i.status==="failed"||i.attempts>=3);if(!f.length){console.log("No failed items.");process.exit(0);}for(const i of f)console.log(`#${i.fork_issue_number} [${i.triage.category}/${i.triage.complexity}] attempts=${i.attempts} ${i.title}`);}
else if(cmd==="reset"){const d=load();const i=idx(d,rest[0]);d[i].status="open";d[i].attempts=0;d[i].last_attempt=null;console.log(`Reset #${rest[0]}`);save(d);}
else if(cmd==="skip"){const d=load();const i=idx(d,rest[0]);d[i].triage.auto_attempt=false;d[i].triage.skip_reason=rest.slice(1).join(" ")||"Manually skipped";save(d);}
else if(cmd==="promote"){const d=load();const i=idx(d,rest[0]);const c=rest[1];if(!PM[c]){console.error(`Unknown: ${c}`);process.exit(1);}d[i].triage.category=c;d[i].triage.priority=PM[c];const co={trivial:0,small:1,medium:2,large:3,unknown:4};d.sort((a,b)=>a.triage.priority!==b.triage.priority?a.triage.priority-b.triage.priority:(co[a.triage.complexity]??4)-(co[b.triage.complexity]??4));console.log(`#${rest[0]} → ${c}`);save(d);}
else if(cmd==="set-auto"){const d=load();const i=idx(d,rest[0]);d[i].triage.auto_attempt=rest[1]==="true";if(d[i].triage.auto_attempt)d[i].triage.skip_reason=null;console.log(`#${rest[0]} auto_attempt → ${rest[1]}`);save(d);}
else if(cmd==="dump"){const d=load();console.log(JSON.stringify(d[idx(d,rest[0])],null,2));}
else console.log("Usage: list-failed | reset <n> | skip <n> [reason] | promote <n> <cat> | set-auto <n> <true|false> | dump <n>");
