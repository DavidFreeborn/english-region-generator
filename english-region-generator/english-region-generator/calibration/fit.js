"use strict";
/* Calibration/validation over the real ONS atlas.
   1. Deterministic 60/40 train/holdout split by LAD-code hash.
   2. Fit: class-level priors per region from TRAINING LADs only,
      pooling across regions where a region lacks a class example.
      Every fitted cell records its evidence (n, pooled or direct).
   3. Validate: generate scenario ensembles per holdout LAD's
      region+class, compare synthetic borough-level composition
      against the real LAD values. Report per-group errors and
      whether real values fall inside the ensemble envelope. */
const fs=require("fs");
const atlas=JSON.parse(fs.readFileSync(__dirname+"/atlas_ethnicity_2021.json","utf8"));
require("vm").runInThisContext(fs.readFileSync(__dirname+"/../imaginary-county.html","utf8").match(/<script>([\s\S]*)<\/script>/)[1],{filename:"bundle"});

const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const train=[],hold=[];
for(const l of atlas.lads)((hash(l.code)%10)<6?train:hold).push(l);
console.log("split: train",train.length,"holdout",hold.length);
console.log("  train:",train.map(l=>l.name).join(", "));
console.log("  holdout:",hold.map(l=>l.name).join(", "));

/* ---- fit class priors ---- */
const REGIONS8=["north-east","north-west","yorkshire","east-midlands","west-midlands","east","south-east","south-west"];
const CLASSES=["city","town","rural","millTown"];
const mean=rows=>{const m=new Array(10).fill(0);for(const r of rows)for(let g=0;g<10;g++)m[g]+=r.v[g]/rows.length;return m.map(x=>+x.toFixed(2));};
const fitted={};
for(const cls of CLASSES){
  const pool=train.filter(l=>l.cls===cls);
  for(const reg of REGIONS8){
    const local=pool.filter(l=>l.region===reg);
    const rows=local.length?local:pool;
    if(!rows.length)continue;
    fitted[reg+"/"+cls]={v:mean(rows),n:rows.length,evidence:local.length?"region-direct":"pooled-national"};
  }
}
console.log("\nfitted cells (region/class -> WB%, evidence):");
for(const k in fitted)console.log(" ",k,fitted[k].v[0]+"% WB,",fitted[k].n,"LADs,",fitted[k].evidence);
fs.writeFileSync(__dirname+"/fitted_priors.json",JSON.stringify({split:{train:train.map(l=>l.code),holdout:hold.map(l=>l.code)},fitted},null,1));

/* ---- holdout validation ---- */
const cfgFor=l=>({
  seed:"val-"+l.code, region:REGIONS8.includes(l.region)?l.region:"east",
  size:l.cls==="rural"?"small":l.cls==="city"?"large":"medium",
  km:l.cls==="rural"?16:l.cls==="city"?32:24,
  edges:{N:"flat",E:"sea",S:"flat",W:"flat"},rivers:[["W","E"]]});
const SEEDS=3;
console.log("\nholdout validation (synthetic borough % vs real LAD %):");
const G=atlas.provenance.group_order;
let within=0,total=0,absErr=[];
for(const l of hold){
  const envMin=new Array(10).fill(1e9),envMax=new Array(10).fill(-1e9);
  for(let s=0;s<SEEDS;s++){
    const cfg=cfgFor(l);cfg.seed+="-"+s;
    const w=generate(cfg);
    // borough-level composition aggregated from the microsimulated households
    const agg=new Array(10).fill(0);let n=0;
    for(let h=0;h<w.pops.n;h++){agg[w.pops.eth[h]]+=1;n++;}
    for(let g=0;g<10;g++){const v=agg[g]/n*100;envMin[g]=Math.min(envMin[g],v);envMax[g]=Math.max(envMax[g],v);}
  }
  const errs=[];
  for(let g=0;g<10;g++){
    const real=l.v[g];
    const inEnv=real>=envMin[g]-1.5&&real<=envMax[g]+1.5; // 1.5pp tolerance ~ ensemble spread floor
    if(l.v[g]>=0.5){total++;if(inEnv)within++;}
    errs.push(Math.abs((envMin[g]+envMax[g])/2-real));
  }
  absErr.push(errs.reduce((a,b)=>a+b,0)/10);
  console.log(" ",l.name,"("+l.region+"/"+l.cls+") mean |err| "+(errs.reduce((a,b)=>a+b,0)/10).toFixed(1)+"pp; WB real "+l.v[0]+"% vs synth "+((envMin[0]+envMax[0])/2).toFixed(0)+"%");
}
console.log("\ncoverage: real values within ensemble envelope (+/-1.5pp) for "+within+"/"+total+" group-cells ("+(within/total*100).toFixed(0)+"%)");
console.log("mean absolute composition error: "+(absErr.reduce((a,b)=>a+b,0)/absErr.length).toFixed(1)+" percentage points");
