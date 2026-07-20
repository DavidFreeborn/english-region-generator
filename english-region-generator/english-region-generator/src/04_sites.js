"use strict";
/* ============================================================
   SETTLEMENT SITING
   Real English settlement logic:
   - the main town of a river basin sits at the LOWEST BRIDGING
     POINT of the major river (London, York, Exeter, Norwich...)
     or at a sheltered harbour / estuary head;
   - market towns space out at roughly a day's return walk
     (8-13 km) — Christaller before Christaller;
   - villages sit at spring-lines along scarp feet (chalk/
     limestone aquifer meeting clay), at small crossings, on
     dry gravel patches in clay vales — parish spacing 2-4 km;
   - industrial-era settlements ignore all of that and follow
     the resource: pit villages on the exposed coalfield, mill
     hamlets up gritstone valleys with water power, fishing
     coves on hard coasts, planted resorts on the rail line.
   ============================================================ */

function siteAndSeed(world){
  const {N,rng,region,regionKey,edges}=world;
  const idx=(x,y)=>y*N+x;
  const {elev,sea,river,slope,acc,stratum,cover,soil}=world;
  const nm = world.names = new NameFactory(world);
  const cellKm=world.cellKm;

  const lithAt=i=>LITH[world.lithIndex[world.stratum[i]]];

  /* --- name the rivers (Brittonic survivals) --- */
  // find distinct major river systems: trace mouths (class3 flowing to sea/border)
  world.riverNames=new Map(); // rootIndex->name
  const mouths=[];
  for(let i=0;i<N*N;i++){
    if(river[i]<2)continue;
    const j=world.flowTo[i];
    if(j<0||sea[j]) mouths.push(i);
  }
  mouths.sort((a,b)=>acc[b]-acc[a]);
  const riverOf=new Int32Array(N*N).fill(-1);
  // label upstream from each mouth along max-acc path network
  const inflows=new Map();
  for(let i=0;i<N*N;i++){const j=world.flowTo[i];if(j>=0&&river[i]>=1){if(!inflows.has(j))inflows.set(j,[]);inflows.get(j).push(i);}}
  let rid=0; world.rivers=[];
  for(const m of mouths.slice(0,6)){
    if(riverOf[m]>=0)continue;
    const name=nm.riverName(acc[m]>world.maxAcc*0.4);
    const cells=[]; let q=[m];
    while(q.length){const c=q.pop();if(riverOf[c]>=0)continue;riverOf[c]=rid;cells.push(c);
      for(const u of (inflows.get(c)||[])) if(river[u]>=1) q.push(u);}
    world.rivers.push({id:rid,name,mouth:m,cells,major:acc[m]*cellKm*cellKm>110});
    rid++;
  }

  /* ---- requested-river realization check: the methodology promises
     each requested corridor yields a substantial watercourse; verify
     against the FINAL network and record the result rather than
     letting a silent failure stand ---- */
  {
    const {N}=world;
    const nearEdge=(i,side,tol)=>{
      const x=i%N,y=(i/N)|0;
      return side==="N"?y<tol:side==="S"?y>=N-tol:side==="W"?x<tol:x>=N-tol;
    };
    world.diagnostics=world.diagnostics||{};
    world.diagnostics.riversRequested=(world.riverSpecs||[]).map(([a,b])=>{
      // realized if a substantial named river (>=40 cells, class>=2
      // water) reaches the outlet edge region; sea-sourced requests
      // re-anchor inland, so the source edge is checked only when it
      // is a land edge
      /* sector tests: the SOURCE must lie in the third of the sheet
         nearest edge a, the OUTLET in the third nearest edge b, and
         the channel must span at least half the sheet along the a-b
         axis. Sea cells near the wrong coast no longer count. */
      const sector=(i,side)=>{
        const x=i%N,y=(i/N)|0,t=N/3;
        return side==="N"?y<t:side==="S"?y>=N-t:side==="W"?x<t:x>=N-t;
      };
      const axisPos=(i,side)=>{const x=i%N,y=(i/N)|0;
        return (side==="N"||side==="S")?y:x;};
      const ends=r2=>{
        let srcI=r2.cells[0],mnA=1e18,mxA=-1;
        for(const i of r2.cells){const A=acc[i];if(A<mnA){mnA=A;srcI=i;}if(A>mxA)mxA=A;}
        return {srcI,mouthI:r2.mouth,mxA};
      };
      const half=(i,side)=>{const x=i%N,y=(i/N)|0,t=N/2;
        return side==="N"?y<t:side==="S"?y>=N-t:side==="W"?x<t:x>=N-t;};
      const aSea=world.edges[a]==="sea",bSea=world.edges[b]==="sea";
      let ok;
      if(aSea&&bSea){
        /* island split: TWO substantial rivers, one to each requested
           coast. The bars scale to the geometry the divide creates: a
           branch's basin is a half-island, so it is held to class-2
           substantiality (>34 km2) and to spanning most of ITS OWN
           run from divide to coast, not to full-sheet major-river
           figures it cannot physically reach. */
        const q=side=>world.rivers.some(r2=>{
          if(r2.cells.length<24)return false;
          const {srcI,mouthI,mxA}=ends(r2);
          if(!sector(mouthI,side))return false;
          const span=Math.abs(axisPos(mouthI,side)-axisPos(srcI,side));
          // how much land the branch HAD along its axis
          let coastPos=axisPos(mouthI,side);
          const divide=axisPos(srcI,side);
          const avail=Math.abs(coastPos-divide)||1;
          if(span<avail*0.55)return false;
          return mxA*cellKm*cellKm>34;
        });
        ok=q(a)&&q(b);
      }else{
        ok=world.rivers.some(r2=>{
          if(r2.cells.length<40)return false;
          const {srcI,mouthI,mxA}=ends(r2);
          // source in the half nearest a (sea sources re-anchor inland,
          // but must still rise on the requested side), outlet in the
          // third nearest b, spanning most of the sheet
          if(!half(srcI,a))return false;
          if(!sector(mouthI,b))return false;
          if(Math.abs(axisPos(mouthI,b)-axisPos(srcI,b))<N*0.45)return false;
          if(mxA*cellKm*cellKm<=110)return false;
          return true;
        });
      }
      return {from:a,to:b,realized:ok};
    });
  }
  world.riverOf=riverOf;

  /* --- site scores --- */
  const inland=(x,y)=>x>3&&y>3&&x<N-4&&y<N-4;
  function shelter(x,y){ // concavity of coast around a coastal cell => natural harbour
    let seaC=0,tot=0;
    for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
      if(dx*dx+dy*dy>49)continue; tot++;
      if(sea[idx(X,Y)])seaC++;
    }
    return clamp(0.5-Math.abs(seaC/tot-0.30)*2.2,0,0.5)*2; // best when a bay bites in
  }
  const isCoastal=(x,y)=>{if(sea[idx(x,y)])return false;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<N&&Y<N&&sea[idx(X,Y)])return true;}return false;};

  // lowest bridging point of the biggest river: furthest-downstream class-3 cell that
  // is still narrow (not estuary) with firm ground both banks
  let lbp=-1;
  const bigRiver=world.rivers.find(r=>r.major);
  if(bigRiver){
    let best=-1,bi=-1;
    const margin=Math.round(N*0.09);
    for(const c of bigRiver.cells){
      if(river[c]!==3)continue;
      const x=c%N,y=(c/N)|0;
      if(x<margin||y<margin||x>=N-margin||y>=N-margin)continue;
      if(elev[c]<1.5&&world.hasSea)continue;        // tidal/estuarine — too wide
      let firm=0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const j=idx(x+dx,y+dy);if(!sea[j]&&slope[j]<0.06&&!river[j])firm++;}
      if(firm<2)continue;
      // furthest downstream = greatest accumulated flow
      if(acc[c]>best){best=acc[c];bi=c;}
    }
    lbp=bi;
  }

  function genericScore(x,y){
    const i=idx(x,y);
    if(sea[i]||river[i]===3)return 0;
    const L=lithAt(i);
    let s=0.18;
    s+=soil[i]*0.35;
    s-=slope[i]*4;
    if(cover[i]===3)s-=0.5;                        // moor
    if(cover[i]===5)s-=0.6;                        // marsh
    if(world.stratum[i]===world.lithIndex.indexOf("alluvium"))s-=0.35; // floodplain
    // water access: small stream nearby
    let water=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;if(river[idx(X,Y)]>=1)water=1;}
    s+=water*0.22;
    // spring-line: aquifer here or up-dip, clay adjacent down-dip
    if(L.aquifer){for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const L2=lithAt(idx(X,Y));if(!L2.aquifer&&L2.resist<0.4){s+=0.28;break;}}}
    if(elev[i]>320)s-=0.4;
    return s;
  }
  function crossingScore(x,y){
    const i=idx(x,y);
    if(river[i]<1||river[i]>2||sea[i])return 0;
    let firm=0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);if(!sea[j]&&slope[j]<0.05&&!river[j])firm++;}
    return firm>=2? 0.45+0.15*river[i] :0;
  }

  /* --- main town --- */
  const sizeTargets={small:[42000,68000],medium:[88000,135000],large:[175000,260000]};
  const targetPop=Math.round(rng.range(...sizeTargets[world.sizeClass]));
  let mainSite=null, origin=null, originStory="";
  const portProp=(region.industry.ship||0)*0.5+(region.industry.fish||0)*0.3+(region.industry.naval||0)*0.4;

  // candidate: harbour
  let harb=null,harbS=0;
  if(world.hasSea){
    for(let y=4;y<N-4;y++)for(let x=4;x<N-4;x++){
      if(!isCoastal(x,y))continue;
      const i=idx(x,y);
      let s=shelter(x,y)+0.3*(river[i]>=2?1:0)+(lithAt(i).softCoast?0:0.1)-(cover[i]===5?0.4:0);
      // estuary banks: firm land beside tidal water
      if(elev[i]>2&&elev[i]<40)s+=0.15;
      if(s>harbS){harbS=s;harb={x,y};}
    }
  }

  const wantsPort = world.hasSea && harb && (portProp>0.35 || !bigRiver) && rng.chance(0.35+portProp*0.55);
  if(lbp>=0 && !wantsPort){
    mainSite={x:lbp%N,y:(lbp/N)|0};
    const romanP={"north-east":0.5,"yorkshire":0.55,"north-west":0.5,"east-midlands":0.5,"west-midlands":0.5,"east":0.5,"south-east":0.6,"south-west":0.5}[regionKey];
    origin=rng.wpick([["roman",romanP],["burh",0.25],["minster",0.2],["norman",0.15]]);
    originStory=`grew at the lowest bridging point of the ${bigRiver?("River "+world.rivers.find(r=>r.major).name):"river"}`;
  } else if(harb){
    mainSite=harb; origin=rng.wpick([["harbour",0.6],["roman",0.15],["norman",0.15],["minster",0.1]]);
    originStory="grew around its sheltered natural harbour";
  } else {
    // best generic inland site
    let bs=0,bx=N>>1,by=N>>1;
    for(let y=8;y<N-8;y++)for(let x=8;x<N-8;x++){
      const s=genericScore(x,y)+crossingScore(x,y)+0.2*(1-dist(x,y,N/2,N/2)/(N*0.7));
      if(s>bs){bs=s;bx=x;by=y;}
    }
    mainSite={x:bx,y:by};
    origin=rng.wpick([["minster",0.3],["burh",0.25],["market",0.25],["roman",0.2]]);
    originStory="grew from an early market and church settlement at a meeting of routes";
  }

  const mi=idx(mainSite.x,mainSite.y);
  let mainRiver = world.riverOf[mi]>=0? world.rivers[world.riverOf[mi]] :
                    (bigRiver&&dist(mainSite.x,mainSite.y,bigRiver.mouth%N,(bigRiver.mouth/N)|0)<N*0.5? bigRiver:null);
  if(!mainRiver&&world.rivers.length){ // nearest registered river within reach
    let bd=1e9;for(const rv of world.rivers){for(const c of rv.cells){
      const d=dist(mainSite.x,mainSite.y,c%N,(c/N)|0);
      if(d<bd){bd=d;if(d<N*0.28)mainRiver=rv;}}}
  }
  const nearMouth = (()=>{
    if(!mainRiver||!world.hasSea)return false;
    // require a substantial channel within ~3 cells of the town site
    const mx2=mainSite.x,my2=mainSite.y;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const X=Math.round(mx2+dx),Y=Math.round(my2+dy);
      if(X<0||Y<0||X>=N||Y>=N)continue;
      if(world.river[Y*N+X]>=2)return true;
    }
    return false;
  })();
  const cityFeat={crossing:origin!=="harbour"&&lbp>=0,harbour:origin==="harbour",mouth:nearMouth&&origin==="harbour",onSea:isCoastal(mainSite.x,mainSite.y),market:true,riverAffix:(mainRiver&&rng.chance(0.3))?mainRiver.name:null};
  const cityName = world.forcedName || nm.cityName(origin,mainRiver?mainRiver.name:null,cityFeat);

  const settlements=[];
  const main={x:mainSite.x,y:mainSite.y,name:cityName,kind:"main",origin,originStory,target:targetPop,pop:targetPop,features:{}};
  settlements.push(main);
  world.main=main;

  /* --- market towns --- */
  const nMkt = world.sizeClass==="large"? rng.int(2,4): world.sizeClass==="medium"? rng.int(2,4): rng.int(3,4);
  const mktMin = 9/cellKm;
  const mkts=bestCandidateSites(rng.fork("mkt"),N,nMkt*3,mktMin,(x,y)=>{
    if(dist(x,y,mainSite.x,mainSite.y)<7.5/cellKm)return 0;
    return genericScore(x,y)+crossingScore(x,y)*1.4+(isCoastal(x,y)?shelter(x,y)*0.9:0);
  }).slice(0,nMkt);
  for(const s of mkts){
    const i=idx(s.x,s.y);
    const coastal=isCoastal(s.x,s.y);
    const onR=river[i]>=1;
    const kind= coastal&&rng.chance(0.6)?"port-town":"market-town";
    const feat={crossing:onR&&rng.chance(0.7),harbour:kind==="port-town",onSea:coastal,market:true,affixBoost:0.8};
    const mktRange={small:[2800,8500],medium:[4500,15000],large:[7000,26000]}[world.sizeClass];
    settlements.push({x:s.x,y:s.y,name:nm.settlementName(feat),kind,origin:"market",target:Math.round(rng.range(...mktRange)),features:{}});
  // rank-size: town targets follow a Zipf tail under the main town
  // (alpha ~0.9), so a 120k main town carries a ~45k second town and
  // a ~28k third rather than a cliff down to market towns
  {
    const towns=settlements.filter(s2=>["market-town","port-town","resort"].includes(s2.kind))
      .sort((a2,b2)=>b2.target-a2.target);
    towns.forEach((t2,r2)=>{
      const zipf=Math.round(targetPop*0.42/Math.pow(r2+1,0.9)*rng.range(0.85,1.15));
      t2.target=Math.max(t2.target,Math.min(zipf,Math.round(targetPop*0.5)));
    });
  }
  }

  /* --- villages (parish spacing) --- */
  const nVil = Math.round((world.km*world.km)/38);   // ~1 per 38 km^2 outside towns
  const vils=bestCandidateSites(rng.fork("vil"),N,nVil*2,2.7/cellKm,(x,y)=>{
    for(const s of settlements) if(dist(x,y,s.x,s.y)< (s.kind==="main"?5.5:3.2)/cellKm) return 0;
    return genericScore(x,y)+crossingScore(x,y);
  }).slice(0,nVil);
  for(const s of vils){
    const i=idx(s.x,s.y);
    const feat={village:true,crossing:river[i]>=1&&rng.chance(0.5),spring:lithAt(i).aquifer,underHill:elev[i]>140,valleySW:slope[i]>0.03,westBoost:1.6*(1-s.x/N)};
    settlements.push({x:s.x,y:s.y,name:nm.settlementName(feat),kind:"village",origin:"anglo-saxon",target:Math.round(rng.range(180,2200)),features:{}});
  }

  /* --- industrial-era plantings --- */
  const coalIx=world.lithIndex.indexOf("coalMeas");
  if(coalIx>=0 && region.industry.coal>0.5){
    const nPit=rng.int(3,7);
    const pits=bestCandidateSites(rng.fork("pit"),N,nPit*3,2.2/cellKm,(x,y)=>{
      const i=idx(x,y);
      if(world.stratum[i]!==coalIx||sea[i])return 0;
      for(const s of settlements) if(s.kind!=="village"&&dist(x,y,s.x,s.y)<3.5/cellKm)return 0;
      return 0.5-slope[i]*3;
    }).slice(0,nPit);
    for(const s of pits){
      settlements.push({x:s.x,y:s.y,name:nm.settlementName({colliery:true,affixBoost:0.2}),kind:"pit-village",origin:"victorian",target:Math.round(rng.range(900,4200)),features:{colliery:true}});
    }
  }
  const granIx=world.lithIndex.indexOf("granite");
  if(granIx>=0 && region.industry.mining==="tin"){
    const mines=bestCandidateSites(rng.fork("tin"),N,6,3/cellKm,(x,y)=>{
      const i=idx(x,y);
      const L=lithAt(i);
      if(!(world.stratum[i]===granIx||L===LITH.slate))return 0;
      // metamorphic aureole: slate adjacent to granite
      let aur=false;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;if(world.stratum[idx(X,Y)]===granIx&&world.stratum[i]!==granIx)aur=true;}
      return aur?0.6:0;
    }).slice(0,rng.int(2,4));
    for(const s of mines) settlements.push({x:s.x,y:s.y,name:nm.settlementName({westBoost:2}),kind:"mining-hamlet",origin:"georgian",target:Math.round(rng.range(250,1200)),features:{tin:true}});
  }
  // mill hamlets in steep well-watered valleys (textile regions)
  if(region.industry.textile==="wool"||region.industry.textile==="cotton"){
    const mills=bestCandidateSites(rng.fork("mill"),N,10,2.4/cellKm,(x,y)=>{
      const i=idx(x,y);
      if(river[i]<1||river[i]>2)return 0;
      if(elev[i]<80||slope[i]<0.02)return 0;
      for(const s of settlements) if(dist(x,y,s.x,s.y)<2.2/cellKm)return 0;
      return 0.55;
    }).slice(0,rng.int(3,6));
    for(const s of mills) settlements.push({x:s.x,y:s.y,name:nm.settlementName({valleySW:true}),kind:"mill-village",origin:"georgian",target:Math.round(rng.range(500,3000)),features:{mill:true}});
  }
  // fishing coves on hard coasts
  if(world.hasSea&&region.industry.fish>0.4){
    const coves=bestCandidateSites(rng.fork("cove"),N,8,4/cellKm,(x,y)=>{
      if(!isCoastal(x,y))return 0;
      for(const s of settlements) if(dist(x,y,s.x,s.y)<3.5/cellKm)return 0;
      return shelter(x,y);
    }).slice(0,rng.int(1,3));
    for(const s of coves) settlements.push({x:s.x,y:s.y,name:nm.settlementName({harbour:true,onSea:true}),kind:"fishing-village",origin:"medieval",target:Math.round(rng.range(300,1800)),features:{harbour:true}});
  }
  // Victorian resort on the coast (rail-era planting)
  if(world.hasSea&&region.industry.resort>0.45&&rng.chance(region.industry.resort)){
    const res=bestCandidateSites(rng.fork("res"),N,6,5/cellKm,(x,y)=>{
      const i=idx(x,y);
      if(!isCoastal(x,y))return 0;
      if(cover[i]===5)return 0;
      for(const s of settlements) if(s.kind!=="village"&&dist(x,y,s.x,s.y)<5/cellKm)return 0;
      return 0.3+(cover[i]===6?0.3:0)+0.2*(1-slope[i]*5);
    }).slice(0,1);
    for(const s of res) settlements.push({x:s.x,y:s.y,name:nm.settlementName({onSea:true,resort:true}),kind:"resort",origin:"victorian",target:Math.round(rng.range(4000,18000)),features:{resort:true}});
  }

  /* rank-size (Zipf) discipline for the town tier: real English county
     systems follow pop_r ~ pop_1 / r^~0.9. Rescale the market/port/resort
     towns to that curve, preserving the tier total. */
  {
    const towns=settlements.filter(s=>["market-town","port-town","resort"].includes(s.kind));
    if(towns.length>1){
      const tot=towns.reduce((a,s)=>a+s.target,0);
      towns.sort((a,b)=>b.target-a.target);
      const alpha=0.9;
      const weights=towns.map((_,r)=>1/Math.pow(r+2,alpha)); // ranks 2..n under the main town
      const wTot=weights.reduce((a,b)=>a+b,0);
      towns.forEach((s,r)=>{s.target=Math.max(1500,Math.round(tot*weights[r]/wTot*rng.range(0.88,1.12)));});
    }
  }
  world.settlements=settlements;
  world.mainRiver=mainRiver||null;
}
