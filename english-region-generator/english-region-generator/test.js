"use strict";
const fs=require("fs");
const files=fs.readdirSync("./src").filter(f=>f.endsWith(".js")).sort();
let code="";
for(const f of files)code+=fs.readFileSync("./src/"+f,"utf8")+"\n";
code+="\n;globalThis.generate=generate;globalThis.REGIONS=REGIONS;globalThis.LU=LU;globalThis.LU_META=LU_META;";
require("vm").runInThisContext(code,{filename:"bundle.js"});

function summarize(world){
  const {N}=world;
  let seaC=0,builtC=0,riverC=0;
  for(let i=0;i<N*N;i++){if(world.sea[i])seaC++;if(world.landUse[i]>0)builtC++;if(world.river[i]>=2)riverC++;}
  console.log(`  town: ${world.main.name} (${world.main.origin}) pop=${world.main.pop}`);
  console.log(`  totPop=${Math.round(world.totPop)} settlements=${world.settlements.length} wards=${world.wards.length}`);
  console.log(`  sea%=${(100*seaC/(N*N)).toFixed(1)} built%=${(100*builtC/(N*N)).toFixed(1)} riverCells=${riverC}`);
  console.log(`  rivers: ${world.rivers.map(r=>r.name+(r.major?"*":"")).join(", ")}`);
  console.log(`  roads=${world.roads.length} rail=${world.rail.length} stations=${world.stations.length} motorway=${world.motorway?world.motorway.name:"-"}`);
  console.log(`  landmarks: ${world.landmarks.map(l=>l.type).join(",")}`);
  const ws=world.wards.slice().sort((a,b)=>b.pop-a.pop);
  const w=ws[0];
  console.log(`  biggest ward: ${w.name} pop=${w.pop} imd=${w.imd} deg=${(w.degree*100).toFixed(0)}% WB=${w.eth[0].toFixed(0)}% leM=${w.leM} air=${w.airMean} inc=£${w.income}`);
  const poor=ws.reduce((a,b)=>a.imd<b.imd?a:b);
  console.log(`  most deprived: ${poor.name} imd=${poor.imd} leM=${poor.leM} unemp=${(poor.unemployment*100).toFixed(1)}%`);
  const divW=ws.reduce((a,b)=>a.eth[0]<b.eth[0]?a:b);
  console.log(`  most diverse: ${divW.name} WB=${divW.eth[0].toFixed(0)}% (Pak ${divW.eth[2].toFixed(1)} Ind ${divW.eth[3].toFixed(1)} BlkAfr ${divW.eth[5].toFixed(1)}) stu=${(divW.students*100).toFixed(0)}%`);
  const airW=ws.reduce((a,b)=>a.airMean>b.airMean?a:b);
  console.log(`  worst air: ${airW.name} ${airW.airMean} ug/m3; noisiest=${Math.max(...ws.map(w=>w.noiseMean))} dB; bio range ${Math.min(...ws.map(w=>w.bioMean))}-${Math.max(...ws.map(w=>w.bioMean))}`);
  if(world.graph){const mx=world.graph.edges.reduce((a,e)=>Math.max(a,e.vc),0);console.log(`  max v/c=${mx.toFixed(2)}; rail loads=${world.rail.filter(l=>!l.disused&&!l.mineral).map(l=>(l.loadFactor||0).toFixed(2)).join(",")}`);}
  console.log(`  hotspots=${world.hotspots?world.hotspots.length:0} story: ${world.story.slice(0,180)}...`);
  // sanity checks
  const errs=[];
  if(world.main.pop<30000)errs.push("main town too small");
  if(world.wards.length<5)errs.push("too few wards");
  for(const wd of world.wards){
    const sum=wd.eth.reduce((a,b)=>a+b,0);
    if(Math.abs(sum-100)>1)errs.push("eth not normalised "+sum);
    if(wd.leM<70||wd.leM>90)errs.push("LE out of range "+wd.leM);
    if(wd.pop<0)errs.push("negative pop");
    break;
  }
  if(errs.length)console.log("  !! "+errs.join("; "));
  return errs.length===0;
}

const tests=[
  {seed:"alpha", region:"yorkshire", size:"large", km:26, edges:{N:"flat",E:"flat",S:"flat",W:"mountains"}, rivers:[["W","E"]]},
  {seed:"bravo", region:"north-east", size:"medium", km:24, edges:{N:"flat",E:"sea",S:"flat",W:"mountains"}, rivers:[["W","E"]]},
  {seed:"charlie", region:"south-west", size:"small", km:22, edges:{N:"mountains",E:"flat",S:"sea",W:"sea"}, rivers:[["N","S"]]},
  {seed:"delta", region:"east", size:"medium", km:24, edges:{N:"flat",E:"sea",S:"flat",W:"flat"}, rivers:[]},
  {seed:"echo", region:"south-east", size:"large", km:26, edges:{N:"flat",E:"flat",S:"sea",W:"flat"}, rivers:[["N","S"]]},
  {seed:"fox", region:"west-midlands", size:"large", km:26, edges:{N:"flat",E:"flat",S:"flat",W:"flat"}, rivers:[["N","S"]]},
  {seed:"golf", region:"north-west", size:"medium", km:24, edges:{N:"mountains",E:"mountains",S:"flat",W:"sea"}, rivers:[["E","W"]]},
  {seed:"hotel", region:"east-midlands", size:"small", km:22, edges:{N:"mountains",E:"flat",S:"flat",W:"flat"}, rivers:[["N","E"]]},
];
let ok=true;
for(const t of tests){
  console.log(`\n=== ${t.seed}: ${t.region} ${t.size} ===`);
  const t0=Date.now();
  try{
    const w=generate(t);
    console.log(`  gen ${Date.now()-t0} ms`);
    if(!summarize(w))ok=false;
  }catch(e){ok=false;console.log("  ERROR:",e.message,"\n",e.stack.split("\n").slice(0,4).join("\n"));}
}
console.log(ok?"\nALL OK":"\nFAILURES");
