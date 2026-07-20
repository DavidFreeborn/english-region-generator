"use strict";
/* Headless UI smoke test: stub DOM + canvas, then execute every
   browser-only code path node's model tests skip. Any ReferenceError
   or TypeError in render/legend/panel/readout code fails loudly. */
const fs=require("fs");
const mkCtx=()=>new Proxy({},{get:(t,k)=>{
  if(k==="canvas")return {width:800,height:800};
  if(k==="measureText")return()=>({width:40});
  if(k==="createLinearGradient"||k==="createRadialGradient")return()=>({addColorStop(){}});
  if(k==="createImageData")return(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if(k==="getImageData")return(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if(k==="putImageData"||k==="drawImage")return()=>{};
  if(typeof k==="string"&&!(k in t))return()=>{};
  return t[k];
},set:()=>true});
const mkEl=(id)=>({id,innerHTML:"",textContent:"",value:"1",checked:false,disabled:false,
  style:{},dataset:{},options:[1,2,3],selectedIndex:0,
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  addEventListener(){},appendChild(){},querySelectorAll:()=>[],
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:800}),
  getContext:()=>mkCtx(),setPointerCapture(){},
  width:800,height:800,click(){},
});
const els={};
global.document={
  getElementById:(id)=>els[id]||(els[id]=mkEl(id)),
  createElement:(tag)=>mkEl(tag),
  querySelectorAll:()=>[],
  addEventListener(){},
  body:{appendChild(){},classList:{add(){},remove(){},toggle(){},contains:()=>false}},
};
global.window={devicePixelRatio:1,innerWidth:1400,innerHeight:900,addEventListener(){}};
global.requestAnimationFrame=(f)=>f();
global.Blob=function(){};global.URL={createObjectURL:()=>"",revokeObjectURL(){}};
global.ResizeObserver=class{observe(){}disconnect(){}};
global.location={search:""};


const code=fs.readFileSync(__dirname+"/imaginary-county.html","utf8").match(/<script>([\s\S]*)<\/script>/)[1];
require("vm").runInThisContext(code,{filename:"bundle"});

const LENSES_IDS=["map","relief","geology","soil","flood","landuse","function","era","density",
  "age","eth","degree","income","price","gva","imd","crime","le","transport","traffic",
  "noise","air","bio","wards","politics"];
let fails=0;
const tryStep=(name,fn)=>{try{fn();}catch(e){fails++;console.log("FAIL",name,"->",e.constructor.name+": "+e.message);}};

for(const seed of ["ui-a","ui-b"]){
  const w=generate({seed,region:seed==="ui-a"?"yorkshire":"south-west",size:"medium",km:24,
    edges:{N:"flat",E:"sea",S:"flat",W:"mountains"},rivers:[["W","E"]]});
  APP.world=w;
  APP.state={lens:"map",view:{z:1,tx:0,ty:0},selWard:w.wards.findIndex(x=>x.urban&&x.pop>1000),voteEra:2026};
  const cv=mkEl("cv");
  for(const lens of LENSES_IDS){
    APP.state.lens=lens;
    if(w._lensCache)delete w._lensCache[lens];
    tryStep(seed+"/drawScene:"+lens,()=>drawScene(cv,w,APP.state));
    tryStep(seed+"/legend:"+lens,()=>renderLegend());
  }
  APP.state.voteEra=2024;delete (w._lensCache||{}).politics;
  tryStep(seed+"/politics-2024",()=>drawScene(cv,w,APP.state));
  tryStep(seed+"/summary",()=>renderSummary(w));
  tryStep(seed+"/wardPanel",()=>renderWardPanel());
  tryStep(seed+"/economy",()=>renderEconomy(w));
  APP.state.showBounds=true;APP.state.showRoads=false;APP.state.showRail=false;APP.state.showMarks=false;
  tryStep(seed+"/toggles-off",()=>drawScene(cv,w,APP.state));
  // hover path: every lens's readout must run without throwing
  tryStep(seed+"/hover-all-lenses",()=>{
    const pts=[[Math.round(w.N*0.3),Math.round(w.N*0.3)],[Math.round(w.N*0.55),Math.round(w.N*0.5)],[Math.round(w.N*0.7),Math.round(w.N*0.72)]];
    for(const [id2] of LENSES){
      APP.state.lens=id2;
      for(const [px,py] of pts)updateReadout(px,py,{clientX:10,clientY:10});
    }
  });
  // ---- regression assertions: past bugs stay dead ----
  tryStep(seed+"/requested-rivers-realized",()=>{
    const rr=w.diagnostics.riversRequested||[];
    const bad=rr.filter(r=>!r.realized);
    if(bad.length)throw new Error(JSON.stringify(bad));
  });
  tryStep(seed+"/population-identity",()=>{
    const pi=w.diagnostics.popIdentity;
    if(!pi||!pi.holds)throw new Error(JSON.stringify(pi));
  });
  tryStep(seed+"/labour-conserved",()=>{
    const L=w.labour;
    if(!L)throw new Error("no labour ledger");
    if(Math.abs(L.internal+L.outbound-L.residentWorkers)>1)throw new Error("R != I+O");
    if(Math.abs(L.internal+L.inbound-L.jobs)>1)throw new Error("J != I+B: "+JSON.stringify(L));
    if(L.maxCellFill>1.001)throw new Error("cell over capacity: "+L.maxCellFill);
    if(L.inbound<0||L.outbound<0)throw new Error("negative margin");
  });
  tryStep(seed+"/wards-connected",()=>{
    let broken=0;
    for(const wd of w.wards){
      if(!wd.cells||wd.cells.length<2)continue;
      const mine=new Set(wd.cells);
      const q=[wd.cells[0]];const seen=new Set(q);
      while(q.length){const c=q.pop();const x=c%w.N,y=(c/w.N)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const j=(y+dy)*w.N+(x+dx);
          if(x+dx<0||y+dy<0||x+dx>=w.N||y+dy>=w.N)continue;
          if(mine.has(j)&&!seen.has(j)){seen.add(j);q.push(j);}
        }}
      if(seen.size!==wd.cells.length)broken++;
    }
    if(broken)throw new Error(broken+" disconnected wards");
  });
  tryStep(seed+"/no-zero-pop-districts",()=>{
    // a SMALL district with nobody in it is a defect; a vast sparse
    // moor holding a few dozen (2/km2, Dartmoor-style) is England
    const bad=w.wards.filter(x=>x.cells.length&&((x.pop||0)<30||((x.pop||0)<50&&x.cells.length<800))).length;
    if(bad)throw new Error(bad+" under-populated districts");
  });
  tryStep(seed+"/district-size-bounds",()=>{
    const mx=Math.max(...w.wards.filter(x=>x.cells.length).map(x=>x.pop||0));
    if(mx>13000)throw new Error("ward pop "+mx);
    // urban wards bind tightly; populated rural parishes may be larger
    // (upland civil parishes genuinely are); near-empty upland exempt
    const mcU=Math.max(0,...w.wards.filter(x=>x.cells.length&&x.urban).map(x=>x.cells.length));
    const mcR=Math.max(0,...w.wards.filter(x=>x.cells.length&&!x.urban&&(x.pop||0)>=140).map(x=>x.cells.length));
    if(mcU>Math.round(w.N*w.N/24))throw new Error("urban ward cells "+mcU);
    if(mcR>Math.round(w.N*w.N/18))throw new Error("rural ward cells "+mcR);
  });
  tryStep(seed+"/stations-exist",()=>{
    if(w.stations.filter(s2=>s2.open).length<2)throw new Error("only "+w.stations.filter(s2=>s2.open).length+" open stations");
  });
  tryStep(seed+"/eth-legend-pills",()=>{
    APP.state.lens="eth";renderLegend();
    const html=document.getElementById("legend").innerHTML;
    if((html.match(/ethPill/g)||[]).length<10)throw new Error("ethnicity pills missing");
    if(html.includes("ethModeOpt"))throw new Error("stale radio UI returned");
  });
  tryStep(seed+"/lens-chips-covered",()=>{
    // every lens id must paint or be a base view; spot the grey-chip regression
    const src2=require("fs").readFileSync(__dirname+"/imaginary-county.html","utf8");
    const lensBlock=src2.match(/const LENSES=\[[\s\S]*?\];/)[0];
    const lensIds=[...lensBlock.matchAll(/\["([a-zA-Z]+)"/g)].map(m2=>m2[1]);
    const chipBlock=src2.match(/const CHIP=\{[\s\S]*?\};/)[0];
    const missing=lensIds.filter(id=>!chipBlock.includes(id+":")&&!chipBlock.includes('"'+id+'"'));
    if(missing.length)throw new Error("chips missing for: "+missing.join(","));
  });
}
console.log(fails===0?"UI SMOKE OK":"UI SMOKE: "+fails+" FAILURES");
process.exit(fails?1:0);
