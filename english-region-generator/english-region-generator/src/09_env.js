"use strict";
/* ============================================================
   ENVIRONMENT + ORCHESTRATION
   - NO2 proxy: rural background ~6 ug/m3, urban increment,
     traffic kernel (dominant term, as in UK monitoring),
     industrial point sources with a NE-trending plume
     (prevailing SW wind).
   - Noise: Lden-style, distance-decayed from roads (by class &
     volume), railways, industry, airfield.
   - Biodiversity: UK habitat-scoring flavour — estuary/marsh &
     ancient woodland at the top; improved arable at the bottom;
     brownfield mosaic (reclaimed spoil) scoring surprisingly
     well, which is true and often surprises people.
   ============================================================ */

function blur(arr,N,passes){
  const tmp=new Float32Array(N*N);
  for(let p=0;p<passes;p++){
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      let s=0,c=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        s+=arr[Y*N+X];c++;
      }
      tmp[y*N+x]=s/c;
    }
    arr.set(tmp);
  }
  return arr;
}

function buildEnv(world){
  const {N}=world;const idx=(x,y)=>y*N+x;
  const {landUse,cover,sea,river,trafficRaster,elev}=world;

  /* ---- air (NO2 proxy, ug/m3) ---- */
  const air=world.air=new Float32Array(N*N);
  const urban=new Float32Array(N*N);
  for(let i=0;i<N*N;i++){
    air[i]=sea[i]?4:6.2;
    if(landUse[i]>0&&LU_META[landUse[i]])urban[i]=1;
  }
  blur(urban,N,4);
  const src=new Float32Array(N*N);
  for(let i=0;i<N*N;i++){
    src[i]+= (trafficRaster?Math.min(26,Math.pow(trafficRaster[i]/120,0.75)):0);
    const lu=landUse[i];
    if(lu===LU.heavyInd)src[i]+=9;
    if(lu===LU.lightInd||lu===LU.docks)src[i]+=4;
    if(lu===LU.power){ // plume to NE
      const x=i%N,y=(i/N)|0;
      for(let t=0;t<18;t++){const X=x+Math.round(t*0.7),Y=y-Math.round(t*0.7);
        if(X<0||Y<0||X>=N||Y>=N)break;src[idx(X,Y)]+=Math.max(0,7-t*0.4);}
      src[i]+=8;
    }
  }
  blur(src,N,3);
  for(let i=0;i<N*N;i++)air[i]+=urban[i]*6.5+src[i];

  /* ---- noise (Lden dB proxy) ---- */
  const noise=world.noise=new Float32Array(N*N);
  /* vegetation and open water disperse and deposit particulates */
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=y*N+x;if(sea[i])continue;
    let veg=0,wat=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const j2=idx(x+dx,y+dy);
      if(world.landUse[j2]===LU.park||world.landUse[j2]===LU.common||(!world.landUse[j2]&&world.cover[j2]===2))veg++;
      if(sea[j2]||world.river[j2]>=2)wat++;
    }
    air[i]-=Math.min(2.2,veg*0.35)+Math.min(0.9,wat*0.3);
    if(air[i]<3.5)air[i]=3.5;
  }

  for(let i=0;i<N*N;i++)noise[i]=sea[i]?40:42;
  /* urban density and the night-time economy are noise sources in
     their own right, not just their traffic */
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=y*N+x;
    if(world.cellPop[i]>0)noise[i]+=Math.min(6,world.cellPop[i]/40);
    const lu2=world.landUse[i];
    if(lu2===LU.highStreet||lu2===LU.cbd){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
        noise[idx(x+dx,y+dy)]+=(dx||dy)?2.5:5;
    }
  }
  const nsrc=new Float32Array(N*N);
  for(let i=0;i<N*N;i++){
    const rc=world.roadRaster[i];
    if(rc>=ROADCLASS.motorway)nsrc[i]=Math.max(nsrc[i],34);
    else if(rc>=ROADCLASS.Adual)nsrc[i]=Math.max(nsrc[i],28);
    else if(rc>=ROADCLASS.A)nsrc[i]=Math.max(nsrc[i],22+(trafficRaster&&trafficRaster[i]>800?4:0));
    else if(rc>=ROADCLASS.B)nsrc[i]=Math.max(nsrc[i],15);
    if(world.railRaster[i])nsrc[i]=Math.max(nsrc[i],24);
    const lu=landUse[i];
    if(lu===LU.heavyInd||lu===LU.docks)nsrc[i]=Math.max(nsrc[i],22);
    if(lu===LU.lightInd||lu===LU.mill)nsrc[i]=Math.max(nsrc[i],16);      // vans, fans, forklifts
    if(lu===LU.colliery||lu===LU.quarry)nsrc[i]=Math.max(nsrc[i],18);
    if(lu===LU.retailPark)nsrc[i]=Math.max(nsrc[i],14);                  // car parks and servicing
    if(lu===LU.airfield)nsrc[i]=Math.max(nsrc[i],28);
    if(lu===LU.cbd||lu===LU.highStreet)nsrc[i]=Math.max(nsrc[i],18);
  }
  const rawN=Float32Array.from(nsrc);
  blur(nsrc,N,3);
  for(let i=0;i<N*N;i++)noise[i]+=Math.max(rawN[i]*0.95,nsrc[i]*1.5);

  /* ---- biodiversity (0-100), habitat + configuration ----
     Base habitat value, then landscape ecology: riparian buffers,
     hedgerow field margins, woodland edge/interior, and a
     connectivity term (isolated green in a built matrix scores
     less than the same habitat in a green network). */
  const bio=world.bio=new Float32Array(N*N);
  const nz=makeNoise2D(world.rng.int(0,1e9));

  const habitat=new Float32Array(N*N);
  const green=new Uint8Array(N*N);           // 1 if semi-natural
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);
    let b;
    if(sea[i]){b=72;habitat[i]=b;green[i]=1;bio[i]=b;continue;}
    const lu=landUse[i];
    if(lu>0){
      b=({[LU.park]:46,[LU.cemetery]:52,[LU.allotment]:56,[LU.golf]:34,[LU.common]:60,[LU.reservoir]:44,
         [LU.pitSpoil]:56,[LU.victVilla]:40,[LU.interwar]:38,[LU.late20]:36,[LU.modernEstate]:33,[LU.georgian]:30,
         [LU.victTerrace]:14,[LU.medieval]:17,[LU.postwarEstate]:25,[LU.modernFlats]:9,[LU.caravan]:30,
         [LU.airfield]:40,[LU.promenade]:20})[lu]??8;
      if([LU.park,LU.cemetery,LU.allotment,LU.common,LU.golf].includes(lu))green[i]=1;
    } else {
      const cv=cover[i];
      b=({0:16,1:34,2:82,3:70,4:78,5:88,6:60,7:56})[cv]??30;
      if(cv>=2)green[i]=1;
      // hedgerow / wall network from the shared field-parcel system
      if(cv<=1&&world.hedge&&world.hedge[i]){
        b+=cv===1?14:9;
        if(cv===1)green[i]=1;
      }
    }
    // riparian buffer: everything within ~1 cell of a channel
    if(river[i]>=1)b=Math.max(b,58+river[i]*4);
    habitat[i]=b;
  }
  // riparian spillover + woodland interior bonus (2-pass)
  const buf=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);let add=0;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
      const j=idx(X,Y);
      if(river[j]>=2)add=Math.max(add,10);
      if(cover[j]===2&&cover[i]===2)add=Math.max(add,6); // woodland interior
    }
    buf[i]=add;
  }
  // connectivity: fraction of green in a 5x5 neighbourhood
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);if(sea[i]){bio[i]=72;continue;}
    let g=0,c2=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
      g+=green[idx(X,Y)];c2++;
    }
    const conn=g/c2;                          // 0..1
    let b=habitat[i]+buf[i];
    b*=(0.78+0.34*conn);                      // isolated habitat penalised
    b+=nz(x/N*5,y/N*5)*2.2;
    bio[i]=clamp(b,2,98);
  }
  if(world.soilClass)for(let i=0;i<N*N;i++){
    if(world.soilClass[i]===5)bio[i]+=14;       // peat: high-value habitat
    else if(world.soilClass[i]===4)bio[i]+=6;   // alluvial corridors
  }
  // spatial coherence: one smoothing pass (habitat varies at field scale, not per cell)
  for(let pass2=0;pass2<2;pass2++){
    const tmp=new Float32Array(N*N);tmp.set(bio);
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=idx(x,y);
      if(sea[i])continue;
      bio[i]=(tmp[i]*3+tmp[i-1]+tmp[i+1]+tmp[i-N]+tmp[i+N])/7;
    }
  }
  // disused railway corridors: linear reserves that also aid connectivity
  for(const line of world.rail){
    if(!line.disused)continue;
    for(const [x,y] of line.pts){const i=idx(x,y);if(!sea[i]&&landUse[i]===0)bio[i]=Math.max(bio[i],68);}
  }
  /* named wildlife designations from the best patches */
  {
    const desig=[];const seenD=new Uint8Array(N*N);
    const cands=[];
    for(let i=0;i<N*N;i++)if(!sea[i]&&bio[i]>78&&landUse[i]===0)cands.push(i);
    cands.sort((a,b)=>bio[b]-bio[a]);
    const nm=world.names;
    for(const i0 of cands){
      if(seenD[i0]||desig.length>=6)continue;
      const q=[i0];seenD[i0]=1;const cells=[i0];
      while(q.length&&cells.length<2500){
        const i=q.pop();const x=i%N,y=(i/N)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          const j=idx(X,Y);if(!seenD[j]&&bio[j]>70&&landUse[j]===0){seenD[j]=1;q.push(j);cells.push(j);}
        }
      }
      if(cells.length<6)continue;
      let cx=0,cy=0,cv0={};for(const c of cells){cx+=c%N;cy+=(c/N)|0;cv0[cover[c]]=(cv0[cover[c]]||0)+1;}
      cx/=cells.length;cy/=cells.length;
      const dom=+Object.entries(cv0).sort((a,b)=>b[1]-a[1])[0][0];
      const nearEstuary=(()=>{for(const c of cells)if(river[c]>=3&&elev[c]<12)return true;return false;})();
      const kind=nearEstuary?"estuary":
                 dom===5?"marsh":dom===2?"wood":dom===3?"moor":dom===7?"heath":dom===1?"meadow":"meadow";
      const areaHa=Math.round(cells.length*world.cellKm*world.cellKm*100);
      const tier=areaHa>400?"SSSI":areaHa>90?"Local Nature Reserve":"County Wildlife Site";
      const gen=nm.settlementName({village:true}).split(" ")[0];
      const label={estuary:gen+" Estuary",marsh:gen+" Marshes",wood:gen+" Wood",moor:gen+" Moor",heath:gen+" Heath",meadow:gen+" Meadows"}[kind];
      if(desig.some(d=>d.name===label))continue;
      desig.push({name:label,tier,areaHa,x:cx,y:cy,kind});
    }
    world.designations=desig;
  }

  /* ---- ward aggregation ---- */
  for(const w of world.wards){
    let a=0,n=0,b=0,green=0,c=0;
    for(const i of w.cells){
      a+=world.air[i];n+=world.noise[i];b+=world.bio[i];c++;
      const lu=landUse[i];
      if(lu===LU.park||lu===LU.common||lu===LU.golf||lu===LU.allotment||(lu===0&&cover[i]!==255))green++;
    }
    w.airMean=+(a/Math.max(1,c)).toFixed(1);
    w.noiseMean=+(n/Math.max(1,c)).toFixed(0);
    w.bioMean=+(b/Math.max(1,c)).toFixed(0);
    w.greenShare=green/Math.max(1,c);
  }

  /* ---- late couplings: crime, pollution, noise, schooling,
     congestion and bus frequencies only exist by this point, so the
     indicators that depend on them are finalised here rather than
     computed earlier from defaults ---- */
  for(const w of world.wards){
    if(!w.cells||!w.cells.length||w.noResidents)continue;
    let cong=0,cn=0;
    if(world.trafficRaster)for(const i of w.cells){
      if(world.trafficRaster[i]>600){cong+=Math.min(1,(world.trafficRaster[i]-600)/1400);cn++;}
    }
    const congF=cn?cong/cn:0;
    if(w.roadAccess!=null)w.roadAccess=+(Math.max(0.03,w.roadAccess*(1-0.25*congF))).toFixed(2);
    {
      let bd2=1e9;
      for(const st2 of world.stations)if(st2.open)bd2=Math.min(bd2,dist(st2.x,st2.y,w.cx,w.cy)*world.cellKm);
      const railA=bd2<1e8?Math.exp(-bd2/2.2):0;
      const busF=(w.busPerHour||0)+(w.urban?2:0);
      w.ptAccess=+(Math.min(1,busF/18*0.62+railA*0.5)).toFixed(2);
    }
    if(w.hospKm!=null){
      // car time over the strategic-and-local network (congestion is
      // already inside roadAccess), against a bus-and-walk alternative
      const carKmh=22+30*(w.roadAccess||0);
      const ptKmh=9+15*(w.ptAccess||0);
      w.hospMin=Math.round(Math.min(w.hospKm/carKmh*60*1.25,   // 1.25: roads are not straight lines
                                    w.hospKm/ptKmh*60*1.3+9)); // wait and walk
    }
    if(w.price){
      let m3=1;
      m3*=1-0.15*Math.min(1,(w.crime?w.crime.total:60)/140);
      m3*=1-0.10*Math.min(1,Math.max(0,(w.airMean||6)-8)/14);
      m3*=1-0.08*Math.min(1,Math.max(0,(w.noiseMean||45)-52)/18);
      if(w.schoolPressure!=null)m3*=1-0.05*Math.min(1,Math.max(0,w.schoolPressure-1.2)/2);
      w.price=Math.round(w.price*m3/1000)*1000;
      const p91=w.price/4.6;
      w.ctBand=p91<40000?"A":p91<52000?"B":p91<68000?"C":p91<88000?"D":p91<120000?"E":p91<160000?"F":p91<320000?"G":"H";
    }
  }
}

/* ============================================================
   ORCHESTRATOR
   ============================================================ */
function generate(params){
  const rng=new RNG(params.seed);
  const world={
    seed:params.seed, rng,
    N:params.N||216,
    km:params.km||24,
    regionKey:params.region,
    region:REGIONS[params.region],
    edges:params.edges,             // {N:'sea'|'mountains'|'flat',...}
    riverSpecs:params.rivers||[],   // [["N","E"],...]
    sizeClass:params.size,          // small|medium|large
    forcedName:params.name||null,
  };
  world.cellKm=world.km/world.N;
  const T0=params.timing?((s,f)=>{const t0=Date.now();const r=f();console.log("  ["+s+"]",((Date.now()-t0)/1000).toFixed(1)+"s");return r;}):((s,f)=>f());
  const T=(s,f)=>{if(globalThis.__stage)globalThis.__stage(s);return T0(s,f);};
  T("terrain",()=>generateTerrain(world));
  T("sites",()=>siteAndSeed(world));
  T("roads",()=>buildHistoricRoads(world));
  T("grow",()=>growWorld(world));
  for(const r of world.roads) if(!r.draw) r.draw=chaikin(r.pts,2);
  for(const L of world.rail) if(!L.draw) L.draw=chaikin(L.pts,2);
  T("streets",()=>backfillStreets(world));
  T("economy",()=>buildEconomy(world));
  T("fields",()=>buildFields(world));
  T("pops",()=>buildPops(world));
  T("wards",()=>buildWards(world));
  T("traffic",()=>runTraffic(world));
  T("env",()=>buildEnv(world));
  {
    const N=world.N;const idx=(x,y)=>y*N+x;
    const GREEN=new Set([LU.park,LU.common,LU.allotment,LU.cemetery]);
    const R=Math.max(1,Math.round(0.3/world.cellKm));   // 300 m in cells
    let near=0,tot=0;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=y*N+x;const p2=world.cellPop[i];
      if(p2<=0)continue;tot+=p2;
      let ok=false;
      for(let dy=-R;dy<=R&&!ok;dy++)for(let dx=-R;dx<=R&&!ok;dx++){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        if(GREEN.has(world.landUse[idx(X,Y)]))ok=true;
      }
      if(ok)near+=p2;
    }
    world.greenspaceAccess=tot>0?near/tot:0;
  }
  /* organic linework: smooth + gently meander the drawn geometry of
     roads and rivers (display only; routing rasters unchanged) */
  {
    const N=world.N;
    const jr=world.rng.fork("linework");
    const chaikin=(pts,n)=>{
      let P=pts;
      for(let k=0;k<n;k++){
        const Q=[P[0]];
        for(let i2=0;i2<P.length-1;i2++){
          const a=P[i2],b=P[i2+1];
          Q.push([a[0]*0.72+b[0]*0.28,a[1]*0.72+b[1]*0.28]);
          Q.push([a[0]*0.28+b[0]*0.72,a[1]*0.28+b[1]*0.72]);
        }
        Q.push(P[P.length-1]);P=Q;
      }
      return P;
    };
    const meander=(pts,amp,wl)=>{
      /* natural sinuosity: two incommensurate noise octaves with a
         drifting phase, not a sine; amplitude tapers to zero at both
         ends so confluences and mouths stay pinned and runs cannot
         cross their neighbours */
      const ph=jr.range(0,6.28),ph2=jr.range(0,6.28),f2=1.9+jr.f()*1.3;
      const n=pts.length;
      return pts.map((p2,i2)=>{
        if(i2===0||i2===n-1)return p2;
        const a=pts[i2-1],b=pts[i2+1];
        let tx=b[0]-a[0],ty=b[1]-a[1];const L=Math.hypot(tx,ty)||1;tx/=L;ty/=L;
        const taper=Math.min(1,Math.min(i2,n-1-i2)/4);
        const t2=i2/wl;
        const off=(Math.sin(t2*6.28+ph)*0.6
                  +Math.sin(t2*6.28*f2+ph2)*0.34
                  +Math.sin(t2*6.28*0.37+ph*1.7)*0.45)
                  *Math.min(amp,1.5)*taper;
        return [p2[0]-ty*off,p2[1]+tx*off];
      });
    };
    for(const r of world.roads){
      const noM=["motorway","Adual","A"].includes(r.cls);
      const amp=noM?0:r.cls==="B"?0.05:0.22;
      r.draw=chaikin(amp>0?meander(r.pts,amp,r.cls==="lane"?3.2:4.5):r.pts,2);
    }
    const owner=new Map();   // cell -> displaced [x,y] on the chain that drew it (global across rivers)
    for(const rv of world.rivers){
      /* r.cells is a tributary TREE, not a path: rebuild real chains by
         walking flowTo from each source. Meander is applied to each
         WHOLE chain (not per width-class run: independently phased
         runs used to shear apart at class boundaries), the longest
         chain is displaced first and owns the shared stem, and every
         tributary's tail is pinned to the stem's DISPLACED position at
         the confluence, so joins land on the water they join. */
      const inSet=new Set(rv.cells);
      const hasUp=new Set();
      for(const c of rv.cells){const j2=world.flowTo[c];if(inSet.has(j2))hasUp.add(j2);}
      rv.drawRuns=[];
      const sources=rv.cells.filter(c=>!hasUp.has(c));
      const rawChains=[];
      for(const s0 of sources){
        const full=[];let c=s0,g=0;
        while(g++<5000){
          full.push(c);
          const j2=world.flowTo[c];
          if(j2<0||!inSet.has(j2))break;   // stop on the last land cell
          c=j2;
        }
        if(full.length>=3)rawChains.push(full);
      }
      rawChains.sort((q,w)=>w.length-q.length);   // mainstem first
      for(const full of rawChains){
        // cut at the join: run 2 cells into the already-drawn stem
        const path=[];let joinTail=0;
        for(const c of full){
          path.push(c);
          if(owner.has(c)){joinTail++;if(joinTail>2)break;}
        }
        if(path.length<3)continue;
        let pts=path.map(cc=>[cc%N,(cc/N)|0]);
        // chain-level sinuosity: straight lowland reaches swing more
        const a2=pts[0],b2=pts[pts.length-1];
        const chord=Math.hypot(b2[0]-a2[0],b2[1]-a2[1]);
        const straightness=pts.length>6?chord/(pts.length-1):0;
        let amp=Math.min(0.85,0.22+Math.max(1,world.river[path[Math.floor(path.length/2)]]||1)*0.17);
        let wl=3.0;
        if(straightness>0.8){amp=Math.min(1.5,0.45+pts.length*0.03);wl=6+jr.f()*5;}
        if(pts.length>20){
          const ampL=Math.min(2.6,pts.length*0.055)*Math.max(0.35,straightness);
          pts=meander(pts,ampL,20+jr.f()*16);
        }
        pts=meander(pts,amp,wl);
        /* pin the tail: points on the owned stem take the stem's
           displaced coordinates exactly, and the approach is eased in
           by translating the last few free points toward the junction's
           displacement, so the tributary lands ON the drawn stem */
        let firstOwned=-1;
        for(let k2=0;k2<path.length;k2++)if(owner.has(path[k2])){firstOwned=k2;break;}
        if(firstOwned>=0){
          const dJ=owner.get(path[firstOwned]);
          const raw=[path[firstOwned]%N,(path[firstOwned]/N)|0];
          const dx2=dJ[0]-raw[0],dy2=dJ[1]-raw[1];
          for(let b3=1;b3<=4;b3++){
            const q2=firstOwned-b3;if(q2<0)break;
            const w2=1-b3/5;
            pts[q2]=[pts[q2][0]+dx2*w2,pts[q2][1]+dy2*w2];
          }
          for(let k2=firstOwned;k2<path.length;k2++){
            const d2=owner.get(path[k2]);
            if(d2)pts[k2]=[d2[0],d2[1]];
          }
        }
        for(let k2=0;k2<path.length;k2++)
          if(!owner.has(path[k2]))owner.set(path[k2],pts[k2]);
        // split the displaced chain into class runs so width steps downstream
        let run=null,cls0=-1;
        for(let k2=0;k2<path.length;k2++){
          const cl=Math.max(1,world.river[path[k2]]||1);
          if(cl!==cls0){
            if(run&&run.pts.length>1)rv.drawRuns.push(run);
            run={cls:cl,pts:run?[run.pts[run.pts.length-1]]:[]};cls0=cl;
          }
          run.pts.push(pts[k2]);
        }
        if(run&&run.pts.length>1)rv.drawRuns.push(run);
      }
      // estuary flag, corner-cut, and coastline trim per run
      for(const rr of rv.drawRuns){
        const last=rr.pts[rr.pts.length-1];
        const li=Math.round(last[1])*N+Math.round(last[0]);
        rr.mouth=world.sea[li]?1:0;
        rr.pts=chaikin(rr.pts,2);
        // smoothing can overshoot the coastline: trim to the last land point
        while(rr.pts.length>2){
          const q2=rr.pts[rr.pts.length-1];
          const qi=Math.round(q2[1])*N+Math.round(q2[0]);
          if(qi>=0&&qi<N*N&&world.sea[qi])rr.pts.pop();else break;
        }
      }
    }
    for(const line of world.rail)line.draw=chaikin(line.pts,2);   // rail stays engineered
  }
  world.story=writeStory(world);
  return world;
}

function writeStory(world){
  const m=world.main,r=world.region,ind=r.industry;
  const rng=world.rng.fork("story");
  const bits=[];
  const chartered=rng.int(1130,1330);
  const originTxt={
    roman:[`${m.name} began as a Roman fort; the "${r.topony.chesterForm}" in its name remembers the garrison, and ${m.originStory}.`,
           `A Roman road station stood here first. The medieval town that reused its walls ${m.originStory}.`],
    minster:[`${m.name} grew up around an early minster church. It ${m.originStory}.`,
             `An eighth-century minster drew the first lanes together here, and the town ${m.originStory}.`],
    burh:[`${m.name} was fortified as a burh against raiding. It ${m.originStory}.`,
          `The street plan still shows the burh laid out against the Danes. Afterwards it ${m.originStory}.`],
    norman:[`${m.name} is a Norman plantation: castle first, borough charter (${chartered}) after; it ${m.originStory}.`,
            `A Norman lord planted the borough beneath his castle in the ${chartered<1200?"twelfth":"thirteenth"} century, and it ${m.originStory}.`],
    harbour:[`${m.name} ${m.originStory}.`,`The harbour came before the town. ${m.name} ${m.originStory}.`],
    market:[`${m.name} ${m.originStory}.`,`${m.name} ${m.originStory}, its charter renewed in ${chartered}.`],
  };
  const opts=originTxt[m.origin]||[`${m.name} ${m.originStory}.`];
  bits.push(rng.pick(opts));
  if(m.features.cathedral==="ancient")bits.push(`Its medieval cathedral gives it city status.`);
  if(m.features.cathedral==="victorian")bits.push(`It gained a cathedral, and with it city status, in the Victorian expansion.`);
  // one distinctive early-modern event
  const events=[
    `A fire in ${rng.int(1640,1750)} took most of the timber core; the rebuilt streets account for the Georgian front ranges on medieval plots.`,
    `Plague years in the 1590s and 1660s halved the town twice; it did not regain its Tudor population until the coaching era.`,
    `The ${rng.int(1750,1790)}s turnpike trust and its coaching inns made the town before steam did.`,
    `A canal arm opened in ${rng.int(1770,1805)} and carried coal and corn until the railway undercut it within a generation.`,
    `The corporation drained the town moor in the ${rng.int(1760,1810)}s, releasing the land that later took the station and the gasworks.`,
    `An ambitious scheme of ${rng.int(1830,1859)} for a ship canal was surveyed, subscribed and quietly abandoned.`,
    `Assize week and the ${rng.pick(["horse","wool","goose","cheese"])} fair were the two fixed points of its year into living memory.`,
  ];
  if(rng.chance(0.85))bits.push(rng.pick(events));
  const drivers=[];
  if(ind.coal>0.5)drivers.push("coal");
  if(ind.textile==="cotton")drivers.push("cotton spinning and weaving");
  if(ind.textile==="wool")drivers.push("the wool textile trade");
  if(ind.textile==="hosiery")drivers.push("hosiery and knitwear");
  if(ind.metal>0.5)drivers.push("metal trades");
  if(ind.pottery>0.5)drivers.push("the potteries");
  if(ind.ship>0.5&&world.hasSea)drivers.push("shipbuilding");
  if(ind.fish>0.5&&world.hasSea)drivers.push("fishing");
  if(drivers.length){
    bits.push(rng.pick([
      `The nineteenth century rebuilt it around ${drivers.slice(0,3).join(", ")}: ${r.build.terrace} packed around the works, ${r.build.brick} throughout, villas upwind of the smoke.`,
      `Steam made it a ${drivers[0]} town. By 1900 the ${r.build.terrace} ran in unbroken grids, and the masters had moved to the villas on the higher ground.`,
    ]));
  } else bits.push(rng.pick([
    `It industrialised only lightly, in malting, market trades and later light engineering, so the Georgian and medieval grain survives well.`,
    `Heavy industry passed it by. The livestock market, the brewery and a scatter of small works carried it into the twentieth century largely unrebuilt.`,
  ]));
  const uni=[];
  if(m.features.uniOld)uni.push("a civic redbrick university (chartered c.1905)");
  if(m.features.uniNew)uni.push("a post-1960s campus institution");
  if(uni.length)bits.push(`Today it supports ${uni.join(" and ")}.`);
  const pits=world.settlements.filter(s=>s.kind==="pit-village").length;
  if(pits)bits.push(`${pits} former pit village${pits>1?"s":""} on the exposed coalfield lost their collieries between 1968 and 1985; the spoil is greened over but the wards still carry the health legacy.`);
  const closedRail=world.rail.filter(l=>l.disused&&!l.mineral).length;
  if(closedRail)bits.push(`${closedRail} railway branch${closedRail>1?"es":""} closed under Beeching and now run${closedRail>1?"":"s"} as green corridors.`);
  if(world.motorway)bits.push(rng.pick([
    `The ${world.motorway.name} arrived in the ${rng.pick(["late 1960s","early 1970s"])}, and the retail parks and distribution sheds followed its junctions.`,
    `Since the ${world.motorway.name} opened, the town has commuted further and shopped at the edge.`]));
  return bits.join(" ");
}

