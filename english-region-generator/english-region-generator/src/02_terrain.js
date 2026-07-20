"use strict";
/* ============================================================
   TERRAIN & HYDROLOGY
   Pipeline (geomorphologically ordered):
   1. Structural surface from edge boundary conditions
      (upland massif / coastal ramp / lowland) per side.
   2. Stratigraphy: bands projected along regional dip
      (oldest & most resistant toward the upland side —
      England's actual grand structure), wiggled by noise.
   3. Differential erosion: relief = structure x resistance,
      with explicit cuesta profiles (scarp at the up-dip feather
      edge of each resistant stratum, gentle dip slope behind) —
      this is what produces Downs/Edges/Vales rather than fractal
      mush.
   4. Macro river corridors requested by the user are imposed as
      lowered base-level corridors; the flow model then discovers
      them naturally.
   5. Hydrology: priority-flood depression fill (Barnes 2014),
      D8 directions, rainfall-weighted flow accumulation,
      channel classification, valley incision, estuary widening.
   6. Climate & pre-human land cover: orographic rainfall,
      soils, moor/heath/marsh/wood.
   ============================================================ */

const EDGE_VECS = {N:[0,-1], S:[0,1], E:[1,0], W:[-1,0]};

function mountainHeightFor(regionKey){
  return {"north-east":580,"north-west":640,"yorkshire":600,"east-midlands":420,
          "west-midlands":400,"east":140,"south-east":250,"south-west":520}[regionKey];
}

function generateTerrain(world){
  const {N, rng, region, regionKey, edges, riverSpecs} = world;
  const km = world.km, cell = km/N; // km per cell
  const nz = makeNoise2D(rng.int(0,1e9));
  const nz2 = makeNoise2D(rng.int(0,1e9));
  const nz3 = makeNoise2D(rng.int(0,1e9));
  const elev = new Float32Array(N*N);
  const idx=(x,y)=>y*N+x;

  /* ---- 1. structural base ---- */
  const mtnH = mountainHeightFor(regionKey);
  // choose primary upland edge for dip orientation
  const sides = ["N","E","S","W"];
  let uplandSide = sides.find(s=>edges[s]==="mountains") || null;
  let dip; // unit vector pointing DOWN-dip (from old strata toward young)
  if(uplandSide){
    const v=EDGE_VECS[uplandSide];
    // structure controls relief but is rarely parallel to it: rotate
    // the dip off the upland axis by up to ~35 degrees either way
    const th0=Math.atan2(-v[1],-v[0])+rng.range(-0.62,0.62);
    dip=[Math.cos(th0),Math.sin(th0)];
  }
  else {
    // no mountains: use England's default NW->SE structural grain, rotated a little
    const th = Math.PI*0.25 + rng.range(-0.5,0.5);
    dip=[Math.cos(th),Math.sin(th)];
  }
  // normalise diagonal case
  const dl=Math.hypot(dip[0],dip[1]); dip=[dip[0]/dl,dip[1]/dl];
  world.dip = dip; world.uplandSide = uplandSide;

  // coastline offsets per sea edge (fraction of map the sea occupies at that edge)
  const seaBand = {};
  for(const s of sides) if(edges[s]==="sea") seaBand[s]=rng.range(0.10,0.20);

  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const fx=x/(N-1), fy=y/(N-1);
    let h = 55 + 45*fbm(nz,fx*2.2,fy*2.2,4); // gentle lowland base ~10..100 m
    elev[idx(x,y)] = h;
  }
  // mountain massifs: warped inland extent, along-edge mass variation, spur ridges
  const edgeMass={};
  for(const s of sides){
    if(edges[s]!=="mountains") continue;
    edgeMass[s]={phase:rng.range(0,100),amp:rng.range(0.55,1.0),reach:rng.range(0.48,0.72)};
  }
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const fx=x/(N-1), fy=y/(N-1);
    let h=elev[idx(x,y)];
    for(const s of sides){
      if(edges[s]!=="mountains") continue;
      const em=edgeMass[s];
      let d = s==="N"?fy : s==="S"?1-fy : s==="W"?fx : 1-fx;
      const along = (s==="N"||s==="S")?fx:fy;
      // warp the inland-distance so the massif front is lobed, not a wall
      d += 0.14*fbm(nz2,along*2.1+em.phase,d*2.1+em.phase,3);
      const mass = 0.55+0.75*fbm(nz3,along*1.35+em.phase*2,em.phase,3); // big along-edge variation
      const t = 1-smoothstep(0.0,em.reach*mass+0.18,d);
      if(t<=0) continue;
      const ridge = ridged(nz2, fx*3.1+7, fy*3.1+7, 5);
      // spur ridges running down-slope off the massif
      const spur = Math.pow(Math.abs(Math.sin(along*Math.PI*rng2Spur(s)*6+em.phase)),1.5);
      h += mtnH*em.amp * Math.pow(t,1.6) * (0.40+0.62*ridge+0.22*spur*t);
    }
    elev[idx(x,y)]=h;
  }
  function rng2Spur(s){return {N:1.05,S:0.93,E:1.11,W:0.99}[s];}
  // glacial dales: U-valleys radiating inland from northern massifs
  const glacialRegions=new Set(["north-west","north-east","yorkshire"]);
  world.dales=[];
  if(glacialRegions.has(regionKey)){
    for(const s of sides){
      if(edges[s]!=="mountains") continue;
      const nDales=rng.int(2,4);
      for(let dv=0;dv<nDales;dv++){
        const f0=rng.range(0.12,0.88);
        const ev=EDGE_VECS[s]; const inward=[-ev[0],-ev[1]];
        let px=(s==="W")?N*0.04:(s==="E")?N*0.96:f0*(N-1);
        let py=(s==="N")?N*0.04:(s==="S")?N*0.96:f0*(N-1);
        if(s==="N"||s==="S")px=f0*(N-1); else py=f0*(N-1);
        let dirA=Math.atan2(inward[1],inward[0])+rng.range(-0.5,0.5);
        const len=N*rng.range(0.30,0.52), step=2.5, pts=[];
        for(let sd=0;sd<len;sd+=step){
          pts.push([px,py]);
          dirA+=rng.range(-0.22,0.22)+0.10*fbm(nz3,px*0.02+dv*13,py*0.02,2);
          px+=Math.cos(dirA)*step; py+=Math.sin(dirA)*step;
          if(px<2||py<2||px>N-3||py>N-3)break;
        }
        if(pts.length<6)continue;
        world.dales.push(pts);
        const sigD=1.9/cell;
        for(let k=0;k<pts.length;k++){
          const prog=k/(pts.length-1);
          const floor=lerp(mtnH*0.42,45,Math.pow(prog,0.8));
          const [gx,gy]=pts[k], r=Math.ceil(sigD*2.6);
          for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
            const X=Math.round(gx+dx),Y=Math.round(gy+dy);
            if(X<0||Y<0||X>=N||Y>=N)continue;
            const q=(dx*dx+dy*dy)/(sigD*sigD);
            if(q>7)continue;
            const j=idx(X,Y);
            const vfloor=floor+18*q;               // parabolic U cross-profile
            if(elev[j]>vfloor)elev[j]=lerp(elev[j],vfloor,Math.exp(-q*0.55)*0.9);
          }
        }
      }
    }
  }

  /* ---- 2+3. GEOLOGY v3: three-dimensional stratigraphy ----
     A structural surface S(x,y) in metres (folded, faulted, domed)
     carries a real stratigraphic column of formation thicknesses.
     The OUTCROP at any point is the formation found where today's
     land surface intersects that column:
         depth-into-column = S(x,y) - k*elev(x,y)
     so valleys cut down to OLDER rocks (inliers), resistant caps
     survive on hills (outliers), and outcrop boundaries make the
     V-patterns across valleys that real geological maps show.
     Relief and outcrop are then co-evolved: differential-erosion
     passes lower the soft outcrops, which changes what crops out,
     which changes the erosion — scarps and vales EMERGE from the
     feedback rather than being stamped on. */
  const strata = region.strata.map(([lith,w])=>({lith,w,L:LITH[lith]}));
  const totW = strata.reduce((a,s)=>a+s.w,0);
  const colTot=1400;                                 // column thickness, m
  const thick=strata.map(s=>s.w/totW*colTot);
  const cumTop=[];{let a=0;for(const t of thick){cumTop.push(a);a+=t;}}
  const stratum = new Uint8Array(N*N);
  let dmin=1e9,dmax=-1e9;
  for(const [cx,cy] of [[0,0],[1,0],[0,1],[1,1]]){const d=cx*dip[0]+cy*dip[1];dmin=Math.min(dmin,d);dmax=Math.max(dmax,d);}
  const strike=[-dip[1],dip[0]];
  const foldAmpM=rng.range(90,260)*(0.5+region.stratumNoise);
  const foldFreq=rng.range(1.0,2.2), foldPhase=rng.range(0,6.28), plunge=rng.range(0.3,1.0);
  const fold2AmpM=foldAmpM*rng.range(0.3,0.7), fold2Freq=foldFreq*rng.range(1.7,2.9), fold2Phase=rng.range(0,6.28);
  const faults=[];
  const nFaults=rng.int(1,3);
  for(let f=0;f<nFaults;f++){
    const th=Math.atan2(dip[1],dip[0])+Math.PI/2+rng.range(-0.6,0.6);
    faults.push({px:rng.range(0.2,0.8),py:rng.range(0.2,0.8),
                 nx:Math.cos(th+Math.PI/2),ny:Math.sin(th+Math.PI/2),
                 off:rng.range(70,240)*(rng.chance(0.5)?1:-1),   // throw in metres
                 sharp:rng.range(60,140)});
  }
  const dome=rng.chance(0.35)?{cx:rng.range(0.3,0.7),cy:rng.range(0.3,0.7),
    r:rng.range(0.16,0.3),amp:rng.range(140,320)*(rng.chance(0.5)?1:-1)}:null;
  world.dome=dome;world.faults=faults;
  // structural surface: metres of column already removed at datum
  const Sfield=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const fx=x/(N-1), fy=y/(N-1);
    const dC=((fx*dip[0]+fy*dip[1])-dmin)/(dmax-dmin);
    const sC=fx*strike[0]+fy*strike[1];
    const ampMod=0.6+0.8*Math.abs(fbm(nz2,fx*1.1+53,fy*1.1+53,2));
    let S=dC*colTot;                                   // regional dip
    S+=foldAmpM*ampMod*Math.sin(sC*foldFreq*6.283+foldPhase)*(1-plunge*0.5*dC);
    S+=fold2AmpM*ampMod*Math.sin(sC*fold2Freq*6.283+fold2Phase);
    for(const F of faults){
      const sd=(fx-F.px)*F.nx+(fy-F.py)*F.ny;
      S+=F.off/(1+Math.exp(-sd*F.sharp));
    }
    if(dome){const dd=Math.hypot(fx-dome.cx,fy-dome.cy)/dome.r;
      if(dd<1.6)S+=dome.amp*Math.exp(-dd*dd*1.2);}
    S+=region.stratumNoise*300*fbm(nz3,fx*1.4,fy*1.4,4);
    S+=34*fbm(nz2,fx*9+17,fy*9+17,3);   // contact-scale raggedness: outcrop edges are not clean curves
    Sfield[i2(x,y)]=S;
  }
  function i2(x,y){return y*N+x;}
  const kTopo=1.35;                                    // topographic coupling
  const outcropAt=(i)=>{
    let dcol=Sfield[i]-kTopo*elev[i];
    dcol=clamp(dcol,0,colTot-1);
    // binary-ish search over few formations
    let si=strata.length-1;
    for(let k=0;k<cumTop.length;k++){if(dcol<cumTop[k]+thick[k]){si=k;break;}}
    return si;
  };
  /* co-evolution: outcrop -> resistance-weighted erosion -> outcrop */
  for(let pass=0;pass<3;pass++){
    for(let i=0;i<N*N;i++)stratum[i]=outcropAt(i);
    // smooth the resistance field first: erosion responds to rock at
    // hillslope scale, so contacts make ramps and one-sided scarps,
    // not single-cell cliffs
    const Rf=new Float32Array(N*N);
    for(let i=0;i<N*N;i++)Rf[i]=strata[stratum[i]].L.resist;
    for(let pass2=0;pass2<2;pass2++){
      const t2=new Float32Array(N*N);t2.set(Rf);
      for(let y=0;y<N;y++)for(let x=0;x<N;x++){
        const i=i2(x,y);
        const xm=Math.max(0,x-1),xp=Math.min(N-1,x+1),ym=Math.max(0,y-1),yp=Math.min(N-1,y+1);
        Rf[i]=(t2[i]*2+t2[i2(xm,y)]+t2[i2(xp,y)]+t2[i2(x,ym)]+t2[i2(x,yp)])/6;
      }
    }
    const target=new Float32Array(N*N);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=i2(x,y);
      target[i]=elev[i]*(0.55+0.48*Rf[i]);
    }
    /* smooth the target a touch so relief transitions are landforms,
       not steps. The loop MUST cover the border rows: skipping them
       left a one-cell uneroded rim standing ~30 m proud along every
       sheet edge, which drew frame-hugging contour lines on land
       borders and stacked parallel contours along coasts. */
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=i2(x,y);
      const xm=Math.max(0,x-1),xp=Math.min(N-1,x+1),ym=Math.max(0,y-1),yp=Math.min(N-1,y+1);
      const m=(target[i]*4+target[i2(xm,y)]+target[i2(xp,y)]+target[i2(x,ym)]+target[i2(x,yp)])/8;
      elev[i]=lerp(elev[i],m,0.55);
    }
  }
  for(let i=0;i<N*N;i++)stratum[i]=outcropAt(i);
  /* lithology-conditioned relief character (gentle; the structure is already there) */
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=i2(x,y), fx=x/(N-1), fy=y/(N-1);
    const L=strata[stratum[i]].L;
    let h=elev[i];
    if(L.downland){ h += 38*Math.abs(fbm(nz3,fx*6+11,fy*6+11,4)) - 10*Math.pow(Math.abs(fbm(nz,fx*9+53,fy*9+53,3)),1.4); }
    if(L.moor){ h += 16*ridged(nz3,fx*4+77,fy*4+77,4); }
    if(L.fen){ h = Math.min(h, 3.0 + 2.5*fbm(nz,fx*7,fy*7,3)); }
    if(L.karst){ h += 10*Math.abs(fbm(nz2,fx*8+3,fy*8+3,3)); }
    h += 7*fbm(nz,fx*11+91,fy*11+91,4);
    // broad low swells: even the flattest English county rolls; a long
    // wavelength component lifts interfluves toward real down heights
    h += 55*Math.max(0,fbm(nz3,fx*1.7+7,fy*1.7+7,3))*(1-Math.min(1,h/260));
    elev[i]=h;
  }
  /* no upland edge requested: lowland England still rolls to real
     down heights (Chilterns 267 m, North Downs 246 m); scale the
     positive relief so the flattest county peaks near 150-220 m */
  if(!uplandSide){
    for(let i=0;i<N*N;i++)if(elev[i]>2)elev[i]=Math.min(255,2+(elev[i]-2)*2.15);
  }
  world.Sfield=Sfield;

  /* ---- coasts: erosion-controlled (bays in soft rock, headlands in hard) ---- */
  const seaEdges=sides.filter(s=>edges[s]==="sea");
  const island = seaEdges.length===4;
  if(island){
    // radial island: land where r < R(theta); R varies with noise AND rock resistance
    const icx=0.5+rng.range(-0.06,0.06), icy=0.5+rng.range(-0.06,0.06);
    const R0=rng.range(0.30,0.37);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const fx=x/(N-1), fy=y/(N-1), i=idx(x,y);
      const dxr=fx-icx, dyr=fy-icy;
      const rr=Math.hypot(dxr,dyr), th=Math.atan2(dyr,dxr);
      // periodic radius: sample fbm on the unit circle so theta wraps seamlessly
      const wob=fbm(nz2,Math.cos(th)*1.6+9,Math.sin(th)*1.6+9,4);
      const hardHere=strata[stratum[i]].L.resist;
      const Rth=R0*(1+0.34*wob) + 0.055*(hardHere-0.5); // hard rock juts out
      const margin=rr-Rth;
      if(margin>0){ elev[i]=-25-90*Math.min(1,margin*4); }
      else{
        const hard=hardHere>0.6&&!strata[stratum[i]].L.softCoast;
        const band=hard?0.03:0.10;
        const t=smoothstep(0,band+0.10,-margin);   // broader climb: no contour wall at the shore
        elev[i]=lerp(hard?Math.max(6,elev[i]*0.5):1.2, elev[i], t);
      }
    }
  } else {
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=idx(x,y), fx=x/(N-1), fy=y/(N-1);
      for(const s of seaEdges){
        const d = s==="N"?fy : s==="S"?1-fy : s==="W"?fx : 1-fx;
        const along = (s==="N"||s==="S")?fx:fy;
        const soft = 1-strata[stratum[i]].L.resist;   // local erodibility
        const coast = seaBand[s]*(0.55+0.85*fbm(nz2,along*1.7+s.charCodeAt(0),7.7,4))
                      + 0.09*soft*Math.max(0,fbm(nz3,along*3.2+19,3.3,3))  // bays bite into soft strata
                      + 0.06*fbm(nz2,along*0.9+s.charCodeAt(0)*1.7,2.2,3) // long swells: no ruler-straight coast
                      + 0.035*fbm(nz3,along*7+53,5.1,3);
        const hard = strata[stratum[i]].L.resist>0.6 && !strata[stratum[i]].L.softCoast;
        if(d<coast){ const deep=(coast-d)/Math.max(coast,1e-3); elev[i]=Math.min(elev[i],-25-70*deep); }
        else {
          // broad shore climb: no contour wall stacked at the coast
          const band = hard? 0.045 : 0.14;
          const t = smoothstep(coast,coast+band+0.14,d);
          elev[i] = lerp(hard? Math.max(6,elev[i]*0.32) : 1.5, elev[i], t);   // cliffs to ~50 m, not an 85 m wall
        }
      }
    }
  }
  world.island=island;

  /* ---- 4. requested macro rivers: meandering lowered base-level corridors ---- */
  world.riverPaths=[];
  const corridorCells=world._corridorCells=new Set();
  const corridorBoost=world._corridorBoost=new Set();   // shared-split branches: both halves stand in for off-map catchment
  /* a river cannot rise IN the sea: if the requested source edge is
     sea, the river instead rises at a high interior point and flows to
     the outlet; if BOTH edges are sea the request is realised as two
     rivers draining opposite ways from a shared inland watershed. */
  const effSpecs=[];
  for(const spec of riverSpecs){
    const [a,b]=spec;
    const aSea=edges[a]==="sea",bSea=edges[b]==="sea";
    if(aSea&&bSea)effSpecs.push({src:"interior",to:a,shared:spec},{src:"interior",to:b,shared:spec});
    else if(aSea)effSpecs.push({src:b==="interior"?"interior":b,to:a,swap:true});
    else effSpecs.push({src:a,to:b});
  }
  const interiorSource=()=>{
    let bi=idx(N>>1,N>>1),bv=-1;
    for(let t=0;t<400;t++){
      const x=rng.int(N*0.3,N*0.7),y=rng.int(N*0.3,N*0.7),i=idx(x,y);
      if(elev[i]>bv){bv=elev[i];bi=i;}
    }
    return [bi%N,(bi/N)|0];
  };
  let specIx=0;
  for(const spec of effSpecs){
    const a=spec.src,b=spec.to;
    // multiple rivers on the same corridor separate and differ in habit
    const fLo=0.24+0.30*((specIx%2)),fHi=fLo+0.20;
    const pullFloor=0.30+0.10*((specIx*0.7)%1);
    specIx++;
    const edgePoint=(s,f)=>s==="N"?[f*(N-1),0]:s==="S"?[f*(N-1),N-1]:s==="W"?[0,f*(N-1)]:[N-1,f*(N-1)];
    /* a both-sea split drains ONE watershed two ways: both branches
       must rise at the same divide, or the lower bed captures the
       other's headwaters and the second river never forms */
    if(spec.shared&&!spec.shared._src){
      /* the divide is a REAL ridge, not a point: without raised ground
         between them, the longer corridor's carve bowl overlaps the
         shorter's headwaters and captures them. The ridge is raised
         first; each branch then starts on its own side of it. */
      const [ea]=spec.shared;
      const horiz=(ea==="W"||ea==="E");
      let bi=idx(N>>1,N>>1),bv=-1;
      for(let t=0;t<400;t++){
        const x=horiz?rng.int(N*0.44,N*0.56):rng.int(N*0.30,N*0.70);
        const y=horiz?rng.int(N*0.30,N*0.70):rng.int(N*0.44,N*0.56);
        const i=idx(x,y);
        if(elev[i]>bv){bv=elev[i];bi=i;}
      }
      const dx0=bi%N,dy0=(bi/N)|0;
      spec.shared._src=[dx0,dy0];
      const L=Math.round(N*0.22);
      for(let t=-L;t<=L;t++)for(let wq=-2;wq<=2;wq++){
        const X=horiz?dx0+wq:dx0+t, Y=horiz?dy0+t:dy0+wq;
        if(X<1||Y<1||X>=N-1||Y>=N-1)continue;
        const i=idx(X,Y);
        const taper=(1-Math.abs(t)/L)*(1-Math.abs(wq)/3);
        elev[i]+=16*taper;
      }
    }
    let p0;
    if(spec.shared){
      const [dx0,dy0]=spec.shared._src;
      const [ea]=spec.shared;
      const horiz=(ea==="W"||ea==="E");
      const sideSign=(b==="W"||b==="N")?-1:1;
      p0=horiz?[clamp(dx0+sideSign*16,2,N-3),dy0]:[dx0,clamp(dy0+sideSign*16,2,N-3)];
    }else p0=a==="interior"?interiorSource():edgePoint(a,rng.range(fLo,fHi));
    let p1;
    if(spec.shared){
      /* aim the branch at the FARTHEST coast in its own half, so the
         run from divide to sea is as long as the island allows */
      const [dx0,dy0]=spec.shared._src;
      const horiz=(b==="W"||b==="E");
      let bestP=null,bd2=-1;
      for(let t2=0;t2<15;t2++){
        const off=Math.round((t2/14-0.5)*N*0.5);
        let X=horiz?(b==="W"?1:N-2):clamp(dx0+off,2,N-3);
        let Y=horiz?clamp(dy0+off,2,N-3):(b==="N"?1:N-2);
        // walk inland from the sheet edge to the first LAND cell: the coast
        const sx2=b==="W"?1:b==="E"?-1:0, sy2=b==="N"?1:b==="S"?-1:0;
        let steps2=0;
        while(elev[idx(X,Y)]<0&&steps2<N){X+=sx2;Y+=sy2;steps2++;}   // sea mask not built yet; negative elevation IS the sea here
        if(steps2>=N)continue;
        const d2=dist(X,Y,dx0,dy0);
        if(d2>bd2){bd2=d2;bestP=[X-sx2*2,Y-sy2*2];}   // just offshore of that coast
      }
      p1=bestP||edgePoint(b,rng.range(fLo,fHi));
    }else p1=edgePoint(b,rng.range(fLo,fHi));
    // biased random walk toward the outlet, curvature-correlated -> real meanders
    const pts=[[p0[0],p0[1]]];
    let cx=p0[0],cy=p0[1];
    let head=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
    let bend=0;
    const step=3.0;
    let guard=0;
    while(dist(cx,cy,p1[0],p1[1])>step*1.6 && guard++<800){
      const want=Math.atan2(p1[1]-cy,p1[0]-cx);
      // meander: AR(1) curvature + valley-scale noise + pull to outlet growing near the end
      bend=bend*0.78+rng.range(-0.20,0.20)+0.10*fbm(nz3,cx*0.015+41,cy*0.015+91,2);
      const pull=clamp(1-dist(cx,cy,p1[0],p1[1])/(N*0.9),pullFloor,0.9);
      let dTh=((want-head+Math.PI*3)%(Math.PI*2))-Math.PI;
      head+=clamp(dTh,-0.35,0.35)*pull+bend*(1-pull*0.6);
      cx=clamp(cx+Math.cos(head)*step,1,N-2);
      cy=clamp(cy+Math.sin(head)*step,1,N-2);
      pts.push([cx,cy]);
    }
    pts.push([p1[0],p1[1]]);
    world.riverPaths.push({from:a,to:b,pts});
    // carve a narrower corridor; incision + the D8 model do the rest
    const corridorKm=spec.shared?0.9:1.4, sig=corridorKm/cell;   // split branches carve narrower bowls
    const srcElev=Math.max(30,Math.min(160,elev[idx(Math.round(p0[0]),Math.round(p0[1]))]*0.6+40));
    // precomputed Gaussian kernel; radius 2.2 sigma (the ignored tail
    // moves elevation by well under a metre); stamps stride 2 cells,
    // negligible against a 12-cell sigma
    const r=Math.ceil(sig*2.2), kw=2*r+1;
    const kern=new Float32Array(kw*kw);
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)
      kern[(dy+r)*kw+(dx+r)]=Math.exp(-(dx*dx+dy*dy)/(2*sig*sig));
    for(let k=0;k<pts.length-1;k++){
      const [ax,ay]=pts[k],[bx,by]=pts[k+1];
      const steps=Math.max(1,Math.ceil(dist(ax,ay,bx,by)/2));
      for(let sstep=0;sstep<=steps;sstep++){
        const t=sstep/steps, gx=lerp(ax,bx,t), gy=lerp(ay,by,t);
        const prog=(k+t)/(pts.length-1);
        const floor = lerp(srcElev, edges[b]==="sea"?-2:6, Math.pow(prog,0.85));
        const gxi=Math.round(gx),gyi=Math.round(gy);
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          const X=gxi+dx,Y=gyi+dy;
          if(X<0||Y<0||X>=N||Y>=N)continue;
          const w=kern[(dy+r)*kw+(dx+r)];
          const j=idx(X,Y);
          elev[j]=lerp(elev[j], Math.min(elev[j], floor+(1-w)*70), w*0.9);
          if(w>0.55){corridorCells.add(j);if(spec.shared)corridorBoost.add(j);}
        }
      }
    }
  }

  /* ---- 5. hydrology ---- */
  const SEA=0; // sea level datum
  const sea=new Uint8Array(N*N);
  // flood-fill sea from edges where elev<0 (avoids inland "sea" pits)
  {
    const q=[];
    for(let x=0;x<N;x++){for(const y of [0,N-1]) if(elev[idx(x,y)]<SEA){sea[idx(x,y)]=1;q.push(idx(x,y));}}
    for(let y=0;y<N;y++){for(const x of [0,N-1]) if(elev[idx(x,y)]<SEA){sea[idx(x,y)]=1;q.push(idx(x,y));}}
    while(q.length){const i=q.pop();const x=i%N,y=(i/N)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);
        if(!sea[j]&&elev[j]<SEA){sea[j]=1;q.push(j);}
      }}
    // raise landlocked below-sea pits slightly (they'd be drained fen anyway)
    for(let i=0;i<N*N;i++) if(!sea[i]&&elev[i]<SEA) elev[i]=0.5;
  }
  world.hasSea = sides.some(s=>edges[s]==="sea");

  const filled=new Float32Array(N*N);
  const flowTo=new Int32Array(N*N).fill(-1);
  const rainArr=new Float32Array(N*N);
  const acc=new Float32Array(N*N);
  const river=new Uint8Array(N*N);
  /* the whole drainage pass is re-runnable: after estuary widening
     converts land to tidal water, flow, accumulation, channel classes
     and mouths are recomputed against the FINAL coastline instead of
     leaving the network severed at the conversion boundary */
  let _rainDone=false;
  const runHydro=()=>{
  filled.set(elev);
  // priority-flood fill (epsilon) so every land cell drains to sea/border
  {
    const heap=new MinHeap(); const seen=new Uint8Array(N*N);
    const push=(i)=>{seen[i]=1;heap.push(filled[i],i);};
    for(let x=0;x<N;x++){push(idx(x,0));push(idx(x,N-1));}
    for(let y=1;y<N-1;y++){push(idx(0,y));push(idx(N-1,y));}
    for(let i=0;i<N*N;i++) if(sea[i]&&!seen[i]) push(i);
    const EPS=0.012;
    while(heap.size){
      const [h,i]=heap.pop(); const x=i%N,y=(i/N)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);
        if(seen[j])continue;seen[j]=1;
        if(!sea[j]) filled[j]=Math.max(filled[j],h+EPS);
        heap.push(filled[j],j);
      }
    }
  }

  // D8 flow directions on filled DEM
  flowTo.fill(-1);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y); if(sea[i])continue;
    let best=-1,bh=filled[i];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);
      const hh=filled[j]+ (dx&&dy?0.0001:0); // slight cardinal preference
      if(hh<bh){bh=hh;best=j;}
    }
    flowTo[i]=best;
  }

  // rainfall (orographic + western enhancement — prevailing SW'lies);
  // rain does not change when the estuary widens, so the re-run skips it
  if(!_rainDone){_rainDone=true;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);
    const west=1-(x/(N-1));
    const base=lerp(region.rain,region.upRain,clamp(Math.max(0,elev[i])/Math.max(300,mtnH),0,1));
    rainArr[i]=base*(0.92+0.16*west)*(1+0.05*fbm(nz2,x/N*3,y/N*3,3));
    if(world._corridorCells&&world._corridorCells.has(i)){
      const mult=(world._corridorBoost&&world._corridorBoost.has(i))?2:1;   // split branches drain HALF an island each
      rainArr[i]*=1+mult*2600/world.km/world.km; // stands in for the off-map upstream catchment
    }
  }
  }

  // accumulation in topological order (sort by filled desc)
  const order=new Int32Array(N*N); for(let i=0;i<N*N;i++)order[i]=i;
  const ordArr=Array.from(order).sort((a,b)=>filled[b]-filled[a]);
  for(let i=0;i<N*N;i++) acc[i]= sea[i]?0:rainArr[i]/1000; // rain-weighted unit area
  for(const i of ordArr){ const j=flowTo[i]; if(j>=0&&!sea[i]) acc[j]+=acc[i]; }
  world.maxAcc = ordArr.reduce((m,i)=>Math.max(m,sea[i]?0:acc[i]),0);

  // channel classification (thresholds in accumulated km^2-equivalents)
  const cellArea=cell*cell;
  river.fill(0);
  for(let i=0;i<N*N;i++){
    if(sea[i])continue;
    const A=acc[i]*cellArea;
    if(A>110) river[i]=3; else if(A>34) river[i]=2; else if(A>9) river[i]=1;
  }
  };
  runHydro();
  // valley incision along channels then re-fill for consistency
  for(let i=0;i<N*N;i++) if(river[i]) elev[i]=Math.max(sea[i]?elev[i]:0.5, elev[i]-(2+3.5*river[i]));
  // estuary widening: the major channel dilates into tidal water only
  // within a bounded reach of the ORIGINAL coastline. Testing against
  // the live sea mask cascaded the conversion upstream, marching a
  // straight sea ribbon far inland along flat lowland channels.
  if(world.hasSea){
    const sea0=sea.slice();                    // pre-widening coastline
    const REACH=8;                             // cells (~0.9 km)
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=idx(x,y);
      if(river[i]===3&&elev[i]<7){
        let nearSea=false;
        for(let dy=-REACH;dy<=REACH&&!nearSea;dy++)for(let dx=-REACH;dx<=REACH;dx++){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          if(sea0[idx(X,Y)]){nearSea=true;break;}
        }
        if(nearSea){
          const r=2;
          for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
            const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);
            if(!sea[j]&&elev[j]<6){sea[j]=1;elev[j]=-2;}
          }
        }
      }
    }
    // hydrological consistency: recompute the drainage network
    // against the widened coastline
    runHydro();
  }

  // slope (per-cell, m per m)
  const slope=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);
    const e=(X,Y)=>elev[idx(clamp(X,0,N-1),clamp(Y,0,N-1))];
    const gx=(e(x+1,y)-e(x-1,y))/(2*cell*1000), gy=(e(x,y+1)-e(x,y-1))/(2*cell*1000);
    slope[i]=Math.sqrt(gx*gx+gy*gy);
  }

  /* overlay Quaternary units where hydrology dictates */
  const ALLUV=strata.length; const FENIX=strata.length+1;
  world.lithIndex = strata.map(s=>s.lith).concat(["alluvium","fen"]);
  for(let i=0;i<N*N;i++){
    if(sea[i])continue;
    if((river[i]>=2&&slope[i]<0.02) || (river[i]===3)) stratum[i]=ALLUV;
    if(regionKey==="east" && elev[i]<3.5 && !river[i] && LITH[world.lithIndex[stratum[i]]].resist<0.4) stratum[i]=FENIX;
  }

  /* ---- 6. pre-human land cover ---- */
  // 0 farmland-arable 1 farmland-pasture 2 woodland 3 moor 4 heath 5 marsh 6 beach 7 rough
  const cover=new Uint8Array(N*N);
  const soil=new Float32Array(N*N);
  const soilClass=world.soilClass=new Uint8Array(N*N); // 0 brown earth,1 calcareous,2 sandy podzol,3 clay gley,4 alluvial,5 peat,6 thin upland
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y); if(sea[i]){cover[i]=255;continue;}
    const L=LITH[world.lithIndex[stratum[i]]];
    soil[i]=clamp(L.soil + (stratum[i]===ALLUV?0.15:0) - slope[i]*2.0,0.02,1);
    soilClass[i]= stratum[i]===ALLUV?4
      : (L.moor&&elev[i]>Math.min(300,mtnH*0.42))?(rainArr[i]>1300?5:6)
      : L.heath?2
      : /chalk|limestone/i.test(L.name)?1
      : /clay|mudstone|marl/i.test(L.name)?3
      : 0;
    const rf=rainArr[i];
    if(L.moor && elev[i]>Math.min(320,mtnH*0.45)) cover[i]=3;
    else if(elev[i]>Math.min(430,mtnH*0.62)) cover[i]=3;
    else if(L.heath && rng.chance(0.6*(0.35+0.95*Math.abs(fbm(nz3,x/N*6+31,y/N*6+31,3)))) ) cover[i]=4;
    else if(!L.heath && rng.chance(0.20) && (()=>{   // heath spills a soft
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){   // 2-cell fringe
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        const L2=LITH[world.lithIndex[stratum[idx(X,Y)]]];
        if(L2.heath)return true;
      }return false;})()) cover[i]=4;
    else if(stratum[i]===FENIX) cover[i]=0;                    // drained fen = prime arable
    else if(elev[i]<2.2 && world.hasSea) cover[i]=5;           // coastal marsh
    else if(slope[i]>0.16) cover[i]= rf>900?7:2;
    else {
      const wooded=L.wooded?0.36:0.17;
      const wNoise=fbm(nz3,x/N*5+3,y/N*5+3,4);
      if(wNoise>0.93-wooded*1.5) cover[i]=2;
      else {
        const arableP = region.arableBias * soil[i]*1.6 * (rf<820?1:0.45) * (slope[i]<0.05?1:0.4);
        cover[i] = rng.chance(clamp(arableP,0.03,0.96))?0:1;
      }
    }
    // beach fringe
    if(world.hasSea&&!sea[i]&&elev[i]<3){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        if(sea[idx(X,Y)]&&L.resist<0.6){cover[i]=6;break;}
      }
    }
  }

  Object.assign(world,{elev,filled,sea,flowTo,acc,river,slope,stratum,rainArr,cover,soil,cellKm:cell});
}
