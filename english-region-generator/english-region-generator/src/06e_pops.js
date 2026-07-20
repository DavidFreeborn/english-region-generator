"use strict";
/* ============================================================
   POPS: household microsimulation
   The borough's people are simulated as individual households
   in a columnar store. Three stages:
   1. SYNTHESIS: the housing stock defines dwelling capacity per
      cell; households are created to fill it, with a socio-
      economic segment drawn from the stock (terrace vs villa vs
      estate) and an ethnicity drawn from regional priors -
      the priors give the borough-level rates, but WHERE groups
      live is not painted on:
   2. DYNAMICS: a few rounds of residential choice. Recent-
      migration communities have a chain-migration preference
      for living near their own group (the mechanism behind real
      English ethnic geography); everyone prefers stock they can
      afford. Segregation therefore EMERGES from the dynamics
      and its strength is a tunable constant calibrated against
      census-style ward extremes.
   3. MATCHING: each working household is matched to actual jobs
      (sector-resolved cells) by segment-weighted preference and
      distance decay. The commuting matrix used by the traffic
      model is the aggregate of these real matches.
   Ward statistics downstream AGGREGATE this population.
   ============================================================ */

function buildPops(world){
  const {N,rng,region,regionKey}=world;
  const idx=(x,y)=>y*N+x;
  const {cellPop,landUse,settleOf,jobsSec,jobs}=world;

  /* ---- 1. synthesis ---- */
  // dwelling capacity from the painted stock (persons -> households)
  const capacity=new Float32Array(N*N);
  const resCells=[];
  for(let i=0;i<N*N;i++){
    if(cellPop[i]>0){capacity[i]=cellPop[i]/2.32;resCells.push(i);}
  }
  const totHH=Math.round(resCells.reduce((a,i)=>a+capacity[i],0)*0.965);
  const H={
    n:0,
    home:new Int32Array(totHH),
    seg:new Uint8Array(totHH),       // 0 routine, 1 intermediate, 2 professional
    eth:new Uint8Array(totHH),       // ETH group index
    size:new Float32Array(totHH),
    workers:new Uint8Array(totHH),
    work:new Int32Array(totHH).fill(-1),
    student:new Uint8Array(totHH),
    aged:new Uint8Array(totHH),      // 1 = retired household
  };
  // segment prior from stock affluence
  const segFor=(lu)=>{
    const a=AFFLUENCE[lu]??0.5;
    const pProf=clamp(a*0.62,0.04,0.6), pRoutine=clamp(0.66-a*0.62,0.08,0.62);
    const r=rng.f();
    return r<pProf?2:r<pProf+(1-pProf-pRoutine)?1:0;
  };
  // regional ethnicity priors per settlement class (reuses the census-
  // calibrated tables; these set the BOROUGH rate, not the geography)
  // millTown prior applies only when this scenario ACTUALLY grew a
  // textile economy (mills on the map), not merely by region label -
  // a defect exposed by holdout validation against ONS profiles
  let millCells=0;for(let i=0;i<N*N;i++)if(landUse[i]===LU.mill)millCells++;
  const isMill=region.demo.millTown&&millCells>=8&&(region.industry.textile==="wool"||region.industry.textile==="cotton");
  const settleById={};for(const s2 of world.settlements)settleById[s2.id]=s2;
  const ethPrior=(sid,lu)=>{
    let cls;
    if(sid===world.main.id){
      cls=(isMill&&region.demo.millTown)?"millTown"
        :world.sizeClass==="large"?"city"
        :world.sizeClass==="medium"?"town"
        :"small";                                   // small main uses SMALL, not town
    }else{
      const st=settleById[sid];
      const p2=st?(st.pop||st.target||0):0;
      cls=p2>12000?"town":p2>2500?"small":"village"; // real towns use town priors
    }
    let P0=region.demo[cls]||region.demo.town;
    /* the fitted sample holds no big diverse cities, so large-city
       composition is anchored to England's actual metropolitan
       boroughs (Census 2021 White British %: Birmingham 43,
       Wolverhampton 61, Coventry 66, Leicester 33, Bradford 57,
       Manchester 48). A 150k+ town in a high-diversity region sits
       nearer two-thirds White British than nine-tenths. */
    if(cls==="city"||cls==="millTown"){
      const CITY_WB={"west-midlands":60,"east-midlands":64,"yorkshire":66,"north-west":64,
        "east":74,"south-east":74,"london-fringe":62,"north-east":82,"south-west":86}[world.regionKey];
      if(CITY_WB!=null){
        /* the census figure is a PERSON share, but priors draw
           HOUSEHOLDS, and South Asian households are census-true
           larger (drawn at ~1.5x persons). Anchoring household
           shares directly therefore lands cities 7-12 points too
           diverse. Solve the household-space target that yields the
           person-space census figure; three fixed-point steps
           converge to under half a point. */
        // effective person-weights fold in the age structure: urban WB
        // households skew aged and small, minority households young and
        // large; ratios measured from the model's own draws
        const SZ=g=>(g>=2&&g<=4)?1.72:(g===0?1:1.14);
        const personWB=P=>{let n2=0,d2=0;P.forEach((v,g)=>{d2+=v*SZ(g);if(g===0)n2=v;});return 100*n2/d2;};
        for(let it=0;it<3;it++){
          const pw=personWB(P0);
          if(Math.abs(pw-CITY_WB)<=0.5)break;
          const target=Math.min(99,Math.max(1,P0[0]*CITY_WB/Math.max(1,pw)));
          const scale=(100-target)/Math.max(1,100-P0[0]);
          P0=P0.map((v,g)=>g===0?target:+(v*scale).toFixed(2));
        }
      }
    }
    return P0;
  };
  const drawFrom=(P)=>{
    // sample against the vector's OWN total: rounding deficits must not
    // silently become extra probability for group 0 (White British)
    let tot2=0;for(let g=0;g<10;g++)tot2+=P[g];
    let r=rng.f()*tot2,acc=0;
    for(let g=0;g<10;g++){acc+=P[g];if(r<acc)return g;}
    return 9; // numerically impossible except FP dust: goes to Other
  };
  // validate every prior once per generation: negative, non-finite or
  // wildly non-normalised vectors are model defects, not data
  for(const cls2 of ["city","town","small","village","millTown"]){
    const v2=region.demo[cls2];if(!v2)continue;
    let t2=0;for(const x2 of v2){if(!isFinite(x2)||x2<0)throw new Error("invalid demographic prior "+cls2);t2+=x2;}
    if(Math.abs(t2-100)>6)throw new Error("demographic prior "+cls2+" sums to "+t2.toFixed(1));
  }
  const occupied=new Float32Array(N*N);
  const uniNear=(i)=>{
    const x=i%N,y=(i/N)|0;
    for(const lm of world.landmarks)if(lm.type==="university"&&dist(x,y,lm.x,lm.y)<1.6/world.cellKm)return true;
    return false;
  };
  const kindOf={};for(const s2 of world.settlements)kindOf[s2.id]=s2.kind;
  for(const i of resCells){
    const nHere=Math.round(capacity[i]*0.965);
    const lu=landUse[i];
    const P=ethPrior(settleOf[i],lu);
    for(let k=0;k<nHere&&H.n<totHH;k++){
      const h=H.n++;
      H.home[h]=i;occupied[i]++;
      H.seg[h]=segFor(lu);
      H.eth[h]=drawFrom(P);
      const stu=uniNear(i)&&(lu===LU.victTerrace||lu===LU.modernFlats)&&rng.chance(0.4);
      H.student[h]=stu?1:0;
      const kind=kindOf[settleOf[i]]||"";
      let pAged=lu===LU.interwar||lu===LU.victVilla?0.3:0.22;
      if(kind==="resort"||kind==="fishing-village")pAged=0.46;
      else if(kind==="village")pAged=0.36;
      else if(kind==="pit-village")pAged=0.34;
      else if(settleOf[i]===world.main.id&&(lu===LU.victTerrace||lu===LU.modernFlats))pAged=0.14;
      const aged=!stu&&rng.chance(pAged);
      H.aged[h]=aged?1:0;
      H.size[h]=stu?rng.range(2.5,4.5):aged?rng.range(1.2,2):
                (H.eth[h]>=2&&H.eth[h]<=4?rng.range(2.6,4.6):rng.range(1.7,3.1)); // larger S Asian households (census)
      H.workers[h]=stu?(rng.chance(0.3)?1:0):aged?0:(rng.chance(0.62)?(rng.chance(0.45)?2:1):1);
    }
  }

  /* ---- 2. residential dynamics AS HISTORY ----
     Three epochs reproduce the real sequence of English urban
     demography rather than a single settling pass:
       1955-75: arrival - migrant households enter cheap pre-1919
                terraces near the works (chain migration);
       1975-95: consolidation - communities cluster and grow while
                white flight moves affluent households outward;
       1995-now: dispersal - established second-generation
                households suburbanize into interwar and modern
                stock, students colonize the terraces they leave.
     Epoch membership of each cell comes from its build era, so
     the demography and the built fabric share one timeline. */
  const CHAIN=new Set([2,3,4,5,6,7]);
  const CHAIN_STRENGTH=0.95, ROUNDS=3, TOL=0.7;   // fitted 2026-07-18 vs corpus train split
  const EPOCHS=[
    {arrive:0.55, stock:i=>world.luEra[i]<=2, cluster:1.0, disperse:0},
    {arrive:0.30, stock:i=>world.luEra[i]<=3, cluster:1.2, disperse:0.05},
    {arrive:0.15, stock:i=>true,              cluster:0.6, disperse:0.28},
  ];
  const groupCount=[];for(let g=0;g<10;g++)groupCount.push(new Float32Array(N*N));
  const cellHH=new Float32Array(N*N);
  for(let h=0;h<H.n;h++){groupCount[H.eth[h]][H.home[h]]+=H.size[h];cellHH[H.home[h]]+=H.size[h];}
  const localShare=(g,i)=>{
    const x=i%N,y=(i/N)|0;let own=0,tot=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
      const j=idx(X,Y);own+=groupCount[g][j];tot+=cellHH[j];
    }
    return tot>0?own/tot:0;
  };
  const ownCellsByGroup=[];
  for(let g=0;g<10;g++){const l=[];for(const i of resCells)if(groupCount[g][i]>0)l.push(i);ownCellsByGroup.push(l);}
  for(let round=0;round<ROUNDS;round++){
    const ep=EPOCHS[round];
    // succession: majority households in rapidly-changing cells move outward
    // to newer suburban stock, freeing capacity (the mechanism behind real
    // arrival-ward transitions; without it concentration is capacity-capped)
    if(round<2){
      for(let h=0;h<H.n;h++){
        if(H.eth[h]!==0||rng.f()>0.45)continue;
        const cur=H.home[h];
        let minH=0,totH=0;
        for(let g=0;g<10;g++){const c=groupCount[g][cur];totH+=c;if(g>=2)minH+=c;}
        if(totH<3||minH/totH<0.25)continue;
        for(let t=0;t<8;t++){
          const j=resCells[rng.int(0,resCells.length-1)];
          if(occupied[j]>capacity[j]*1.05)continue;
          if(world.luEra[j]>=3){
            const szF=H.size[h];
            groupCount[0][cur]-=szF;cellHH[cur]-=szF;occupied[cur]--;
            H.home[h]=j;
            groupCount[0][j]+=szF;cellHH[j]+=szF;occupied[j]++;
            break;
          }
        }
      }
    }
    for(let h=0;h<H.n;h++){
      const g=H.eth[h];
      if(!CHAIN.has(g))continue;
      // dispersal epoch: some established households suburbanize outward
      if(ep.disperse&&rng.f()<ep.disperse){
        const cur=H.home[h];
        for(let t=0;t<8;t++){
          const j=resCells[rng.int(0,resCells.length-1)];
          if(occupied[j]>capacity[j]*1.08)continue;
          if(world.luEra[j]>=3&&AFFLUENCE[landUse[j]]>0.45){
            const sz=H.size[h];
            groupCount[g][cur]-=sz;cellHH[cur]-=sz;occupied[cur]--;
            H.home[h]=j;
            if(groupCount[g][j]<=0)ownCellsByGroup[g].push(j);
            groupCount[g][j]+=sz;cellHH[j]+=sz;occupied[j]++;
            break;
          }
        }
        continue;
      }
      if(rng.f()>CHAIN_STRENGTH*ep.cluster)continue;
      const cur=H.home[h];
      if(localShare(g,cur)>=TOL)continue;              // content where they are
      // candidate cells: half sampled from where the group already lives
      const ownCells=ownCellsByGroup[g];
      let best=-1,bs=-1;
      for(let t=0;t<12;t++){
        const j=(t<6&&ownCells.length)?ownCells[rng.int(0,ownCells.length-1)]
               :resCells[rng.int(0,resCells.length-1)];
        if(!ep.stock(j))continue;          // this epoch's accessible stock only
        if(occupied[j]>capacity[j]*1.08)continue;
        const sc=localShare(g,j)*22+((landUse[j]===landUse[cur])?0.5:0)+rng.f()*0.3
                 -dist(j%N,(j/N)|0,cur%N,(cur/N)|0)*0.004;
        if(sc>bs){bs=sc;best=j;}
      }
      if(best>=0&&bs>localShare(g,cur)*22+0.25){
        const sz=H.size[h];
        groupCount[g][cur]-=sz;cellHH[cur]-=sz;occupied[cur]--;
        H.home[h]=best;
        if(groupCount[g][best]<=0)ownCellsByGroup[g].push(best);
        groupCount[g][best]+=sz;cellHH[best]+=sz;occupied[best]++;
      }
    }
  }

  // final epoch: students take over cheap terraces near campuses
  for(let h=0;h<H.n;h++){
    if(H.student[h]||H.aged[h])continue;
    const i=H.home[h];
    if(landUse[i]===LU.victTerrace&&uniNear(i)&&rng.chance(0.18)){
      const old=H.size[h];
      H.student[h]=1;H.workers[h]=rng.chance(0.3)?1:0;H.size[h]=rng.range(2.5,4.5);
      const d=H.size[h]-old;
      groupCount[H.eth[h]][i]+=d;cellHH[i]+=d;   // rasters follow the household
    }
  }

  /* ---- 3. workplace matching ---- */
  const GWp={
    2:{office:1.6,education:1.3,health:1.1,public:0.9,retail:0.25,hospitality:0.2,manufacturing:0.3,logistics:0.2,energy:0.5,agriculture:0.1},
    1:{office:0.8,education:0.8,health:0.9,public:1,retail:0.9,hospitality:0.7,manufacturing:0.9,logistics:0.8,energy:0.8,agriculture:0.5},
    0:{office:0.2,education:0.35,health:0.6,public:0.6,retail:1.2,hospitality:1.1,manufacturing:1.6,logistics:1.5,energy:1.1,agriculture:1.2},
  };
  const LAM={2:9.8,1:8.2,0:6.6};    // fitted: mean commute -> census TTW range
  // job cell lists per sector with cumulative weights
  const secCells={};
  for(const s of SECTORS){
    const cells=[],cum=[];let a=0;
    const arr=jobsSec[s];
    for(let i=0;i<N*N;i++)if(arr[i]>1){cells.push(i);a+=arr[i];cum.push(a);}
    secCells[s]={cells,cum,tot:a};
  }
  const filled=new Float32Array(N*N);
  const sampleSector=(seg)=>{
    const w2=GWp[seg];let tot=0;const pairs=[];
    for(const s of SECTORS){const t=(secCells[s].tot||0)*(w2[s]||0.5);if(t>0){pairs.push([s,t]);tot+=t;}}
    let r=rng.f()*tot;
    for(const [s,t] of pairs){if(r<t)return s;r-=t;}
    return pairs.length?pairs[0][0]:"retail";
  };
  const sampleCell=(sec)=>{
    const sc=secCells[sec];if(!sc.tot)return -1;
    const r=rng.f()*sc.tot;
    let lo=0,hi=sc.cum.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(sc.cum[m]<r)lo=m+1;else hi=m;}
    return sc.cells[lo];
  };
  /* ---- conserved labour market ----
     resident workers R split into internal I and outbound O; local
     jobs J split into internal I and inbound B, so R = I + O and
     J = I + B hold as identities. Cell capacity is a hard constraint:
     a worker who finds no cell with headroom commutes out. */
  let RW=0;for(let h=0;h<H.n;h++)RW+=H.workers[h];
  let JT=0;for(let i=0;i<N*N;i++)JT+=jobs[i];
  const BETA=0.26;                                  // target inbound share of jobs
  const I_target=Math.min(RW,(1-BETA)*JT);
  const pOut=RW>0?Math.max(0,1-I_target/RW):0;
  const OUT=-2;                                     // works beyond the sheet
  for(let h=0;h<H.n;h++){
    if(!H.workers[h])continue;
    if(rng.f()<pOut){H.work[h]=OUT;continue;}
    const seg=H.seg[h];const hx=H.home[h]%N,hy=(H.home[h]/N)|0;
    let best=-1,bs=-1;
    for(let t=0;t<10;t++){
      const sec=sampleSector(seg);
      const j=sampleCell(sec);
      if(j<0)continue;
      if(filled[j]+H.workers[h]>jobs[j])continue;   // hard capacity
      const d=dist(hx,hy,j%N,(j/N)|0)*world.cellKm;
      const sc=Math.exp(-d/LAM[seg])*(0.7+rng.f()*0.6);
      if(sc>bs){bs=sc;best=j;}
    }
    if(best>=0){H.work[h]=best;filled[best]+=H.workers[h];}
    else H.work[h]=OUT;                             // no headroom anywhere sampled
  }
  {
    let I2=0;for(let h=0;h<H.n;h++)if(H.work[h]>=0)I2+=H.workers[h];
    const O2=RW-I2,B2=Math.max(0,JT-I2);
    let mf=0;for(let i=0;i<N*N;i++)if(jobs[i]>0)mf=Math.max(mf,filled[i]/jobs[i]);
    world.labour={residentWorkers:Math.round(RW),jobs:Math.round(JT),
      internal:Math.round(I2),outbound:Math.round(O2),inbound:Math.round(B2),
      inboundShare:JT>0?+(B2/JT).toFixed(3):0,maxCellFill:+mf.toFixed(3)};
  }

  /* write the settled population back to the raster; the group raster
     is REBUILT wholesale from the final household records, so ward
     composition is exact person-weighted truth by construction (the
     incremental move bookkeeping drifted: init added household size,
     moves added one) */
  cellPop.fill(0);
  for(let h=0;h<H.n;h++)cellPop[H.home[h]]+=H.size[h];
  for(let g=0;g<10;g++)groupCount[g].fill(0);
  for(let h=0;h<H.n;h++)groupCount[H.eth[h]][H.home[h]]+=H.size[h];
  let tp=0;for(let i=0;i<N*N;i++)tp+=cellPop[i];
  world.totPop=tp;
  // stock-flow identity: settlement populations are the SETTLED sums,
  // so sum(settlements) === totPop exactly
  {
    const acc={};let dispersed=0;
    for(let i=0;i<N*N;i++)if(cellPop[i]>0){
      const sid=world.settleOf[i];
      if(sid==null||sid<0||!world.settlements.some(st2=>st2.id===sid)){dispersed+=cellPop[i];continue;}
      acc[sid]=(acc[sid]||0)+cellPop[i];
    }
    for(const st of world.settlements)st.pop=Math.round(acc[st.id]||0);
    world.main.pop=Math.round(acc[world.main.id]||world.main.pop);
    // scattered farmsteads and smallholdings: an explicit unit, so the
    // hierarchy sums to the county total as an asserted identity
    world.dispersedRural=Math.round(dispersed);
    const hierarchy=world.settlements.reduce((a,st2)=>a+st2.pop,0)+world.dispersedRural;
    world.diagnostics=world.diagnostics||{};
    world.diagnostics.popIdentity={settlementsPlusDispersed:hierarchy,total:Math.round(tp),
      holds:Math.abs(hierarchy-tp)<=world.settlements.length};   // per-settlement rounding only
  }
  world.pops=H;
  world.popsGroupCount=groupCount;
}
