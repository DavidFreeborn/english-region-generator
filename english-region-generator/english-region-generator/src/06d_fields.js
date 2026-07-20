"use strict";
/* ============================================================
   FIELD PARCELS
   The farmed countryside is partitioned into parcels by a
   jittered-lattice Voronoi (parcel size follows regional field
   size: big arable fields in the East, small pasture closes in
   the Pennine fringe). Parcel boundaries carry the hedgerow /
   drystone-wall network; the biodiversity model and the map
   renderer both read this structure, so field pattern is one
   shared object, not two decorations.
   ============================================================ */

function buildFields(world){
  const {N,rng,region,regionKey}=world;
  const idx=(x,y)=>y*N+x;
  const {sea,cover,landUse,slope,river}=world;
  // parcel seed lattice: spacing in cells from regional field size
  const fieldKm={east:0.62,"east-midlands":0.5,"south-east":0.45,"west-midlands":0.42,
    yorkshire:0.36,"north-west":0.34,"north-east":0.38,"south-west":0.33}[regionKey]||0.42;
  const sp=Math.max(2.2,fieldKm/world.cellKm);
  const jit=sp*0.42;
  const seeds=[];
  for(let gy=0;gy<N/sp+1;gy++)for(let gx=0;gx<N/sp+1;gx++){
    seeds.push([gx*sp+rng.range(-jit,jit),gy*sp+rng.range(-jit,jit)]);
  }
  const cols=Math.ceil(N/sp)+1;
  const parcel=world.parcel=new Int32Array(N*N).fill(-1);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=idx(x,y);
    if(sea[i]||landUse[i]>0||cover[i]>=2)continue;   // only the farmed matrix
    // check the 3x3 lattice neighbourhood for the nearest seed
    const gx=Math.round(x/sp),gy=Math.round(y/sp);
    let best=-1,bd=1e9;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const k=(gy+dy)*cols+(gx+dx);
      if(k<0||k>=seeds.length)continue;
      const s=seeds[k];if(!s)continue;
      const d=dist(x,y,s[0],s[1]);
      if(d<bd){bd=d;best=k;}
    }
    parcel[i]=best;
  }
  /* hedgerow mask: farmed cells adjacent to a different parcel, a lane,
     or a watercourse. Upland regions wall rather than hedge. */
  const hedge=world.hedge=new Uint8Array(N*N);
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=idx(x,y);
    if(parcel[i]<0)continue;
    let b=0;
    for(const d of [1,-1,N,-N]){
      const j=i+d;
      if(parcel[j]>=0&&parcel[j]!==parcel[i])b=1;
      if(river[j]>=1)b=1;
    }
    if(world.roadRaster&&world.roadRaster[i]>0)b=1;
    if(b)hedge[i]=1;
  }
  /* exposed coastal fringe carries rough grass, not woodland (salt wind) */
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x;
    if(cover[i]!==2)continue;
    let coastal=false;
    for(let dy=-1;dy<=1&&!coastal;dy++)for(let dx=-1;dx<=1&&!coastal;dx++){
      const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
      if(sea[Y*N+X])coastal=true;
    }
    if(coastal)cover[i]=7;   // rough grazing
  }
  /* woodland: England is ~10% wooded, and woods are whole parcels
     (copses, shaws, estate woods) on the steep, the wet and the poor
     ground; convert the least farmable parcels until the share is met */
  {
    const stat2=new Map();
    for(let i=0;i<N*N;i++){
      const pcl=parcel[i];if(pcl<0)continue;
      if(cover[i]!==0&&cover[i]!==1)continue;
      let e2=stat2.get(pcl);if(!e2){e2={n:0,sl:0,cells:[]};stat2.set(pcl,e2);}
      e2.n++;e2.sl+=slope[i];e2.cells.push(i);
    }
    const wrng=world.rng.fork("woods");
    const ranked=[...stat2.values()].map(e2=>({e:e2,score:e2.sl/e2.n*30+wrng.f()*1.6}))
      .sort((a2,b2)=>b2.score-a2.score);
    let land=0;for(let i=0;i<N*N;i++)if(!sea[i])land++;
    const target=Math.round(land*(region.woodShare??0.10));
    let placed=0;
    for(const r2 of ranked){
      if(placed>=target)break;
      for(const i of r2.e.cells)cover[i]=2;
      placed+=r2.e.n;
    }
  }
  /* enclosure history: lowland heath near settlements was ploughed or
     improved centuries ago; heath survives on the poor, the steep and
     the remote, plus deliberate commons */
  {
    const hr=world.rng.fork("enclosure");
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=y*N+x;
      if(cover[i]!==4)continue;
      if(world.elev[i]>170||slope[i]>0.09)continue;
      let nearSet=false;
      for(const st of world.settlements){
        if(dist(st.x,st.y,x,y)*world.cellKm<2.2){nearSet=true;break;}
      }
      if(nearSet&&hr.chance(0.8))cover[i]=1;   // improved to pasture
      else if(hr.chance(0.25))cover[i]=1;      // patchy improvement elsewhere
    }
  }
  world.wallCountry = ["yorkshire","north-west","north-east"].includes(regionKey);

  /* farmland type is a PARCEL decision, not per-cell noise: whole fields
     are arable or pasture, set by regional bias, slope and drainage */
  {
    const stat=new Map(); // parcel -> {n,slope,cells[]}
    for(let i=0;i<N*N;i++){
      const pcl=parcel[i];if(pcl<0)continue;
      if(cover[i]!==0&&cover[i]!==1)continue;
      let e=stat.get(pcl);if(!e){e={n:0,sl:0,cells:[]};stat.set(pcl,e);}
      e.n++;e.sl+=slope[i];e.cells.push(i);
    }
    const bias=region.arableBias??0.5;
    const prng=world.rng.fork("fieldtype");
    for(const [pcl,e] of stat){
      const meanSl=e.sl/e.n;
      let sQ=0;for(const i of e.cells)sQ+=world.soil[i];sQ/=e.n;
      const pArable=clamp(bias+0.25-meanSl*9+(sQ-0.5)*0.5,0.04,0.94);
      const t=prng.chance(pArable)?0:1;
      for(const i of e.cells)cover[i]=t;
    }
  }
}
