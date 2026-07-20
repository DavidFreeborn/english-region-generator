"use strict";
/* ============================================================
   STREET SKELETON - the growth medium
   Each era first extends a settlement's street graph (era-
   specific geometry), and only land within reach of a street
   becomes developable. Land use therefore follows streets, and
   the drawn street network IS the structure the town grew on.
   ============================================================ */

function initSkeletons(world){
  world.streets=[];
  world.devMask=new Uint8Array(world.N*world.N);
  for(const s of world.settlements)s.skel=null;
}

function skelTheta(world,s){
  let best=1e9,th=world.rng.range(0,3.14);
  for(const r of world.roads){
    if(r.cls==="lane")continue;
    for(let k=4;k<r.pts.length-4;k+=4){
      const d=dist(r.pts[k][0],r.pts[k][1],s.x,s.y);
      if(d<best){best=d;th=Math.atan2(r.pts[k+2][1]-r.pts[k-2][1],r.pts[k+2][0]-r.pts[k-2][0]);}
    }
  }
  return th;
}

function extendSkeleton(world,s,era,needCells0){
  const needCells=Math.ceil(needCells0*1.35)+4;
  const {N,rng}=world;const idx=(x,y)=>y*N+x;
  if(!s.skel)s.skel={tips:[],theta:skelTheta(world,s),newDev:0};
  const K=s.skel;
  if(!K.tips.length){
    // seed junctions on the nearest classified road through the settlement
    let seeded=false;
    for(const r of world.roads){
      if(r.cls==="lane")continue;
      for(let k2=2;k2<r.pts.length-2;k2+=3){
        if(dist(r.pts[k2][0],r.pts[k2][1],s.x,s.y)<3.5){
          const rh=Math.atan2(r.pts[k2+1][1]-r.pts[k2-1][1],r.pts[k2+1][0]-r.pts[k2-1][0]);
          K.tips.push({x:r.pts[k2][0],y:r.pts[k2][1],h:rh+Math.PI/2});
          K.tips.push({x:r.pts[k2][0],y:r.pts[k2][1],h:rh-Math.PI/2});
          seeded=true;
        }
      }
      if(seeded)break;
    }
    if(!seeded)for(let q=0;q<4;q++)K.tips.push({x:s.x+0.5,y:s.y+0.5,h:K.theta+q*Math.PI/2+rng.range(-0.15,0.15)});
  }
  K.newDev=0;
  const okCell=(x,y)=>{
    const X=Math.round(x),Y=Math.round(y);
    if(X<6||Y<6||X>=N-6||Y>=N-6)return false;
    const i=idx(X,Y);
    if(world.sea[i]||world.river[i]>=2||world.slope[i]>0.20)return false;
    return true;
  };
  const stampDev=(x,y)=>{
    const cx0=Math.round(x),cy0=Math.round(y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const X=cx0+dx,Y=cy0+dy;
      if(X<0||Y<0||X>=N||Y>=N)continue;
      const i=idx(X,Y);
      if(!world.devMask[i]&&okCell(X,Y)){world.devMask[i]=1;K.newDev++;}
    }
  };
  let guard=0;
  while(K.newDev<needCells&&guard++<needCells*40){
    if(!K.tips.length){
      // reseed from this settlement's existing street ends
      const own=world.streets.filter(st=>st.sid===s.id);
      if(!own.length)break;
      for(let q=0;q<4;q++){
        const st=own[rng.int(0,own.length-1)];
        const a=st.pts[0],b=st.pts[st.pts.length-1];
        K.tips.push({x:b[0],y:b[1],h:Math.atan2(b[1]-a[1],b[0]-a[0])+rng.range(-0.3,0.3)});
      }
    }
    const ti=rng.int(Math.max(0,K.tips.length-8),K.tips.length-1); // extend recent growth
    const tip=K.tips[ti];
    let h=tip.h,len;
    if(era<=1){h+=rng.range(-0.55,0.55);len=rng.range(0.9,1.7);}                 // organic core
    else if(era===2){                                                            // bye-law grid
      const rel=((h-K.theta)/(Math.PI/2));
      h=K.theta+Math.round(rel)*Math.PI/2+rng.range(-0.06,0.06);
      len=rng.range(1.2,2.2);
    } else {h+=rng.range(-0.45,0.45)+0.25*Math.sin(guard*0.7);len=rng.range(1.1,2.0);} // curving suburbs
    const nx=tip.x+Math.cos(h)*len, ny=tip.y+Math.sin(h)*len;
    if(!okCell(nx,ny)||!okCell((tip.x+nx)/2,(tip.y+ny)/2)){K.tips.splice(ti,1);continue;}
    // spacing: reject most segments that land on already-developable ground going the same way
    const mi=idx(Math.round((tip.x+nx)/2),Math.round((tip.y+ny)/2));
    if(world.devMask[mi]&&rng.chance(era===2?0.35:0.5)){K.tips.splice(ti,1);continue;}
    world.streets.push({pts:[[tip.x,tip.y],[nx,ny]],sid:s.id,era});
    for(let t=0;t<=1;t+=0.34)stampDev(lerp(tip.x,nx,t),lerp(tip.y,ny,t));
    // continue + branch
    K.tips[ti]={x:nx,y:ny,h};
    const pb=era<=1?0.42:era===2?0.58:0.38;
    if(rng.chance(pb)){
      const bh=era===2?h+(rng.chance(0.5)?1:-1)*Math.PI/2
                      :h+(rng.chance(0.5)?1:-1)*rng.range(1.1,1.9);
      K.tips.push({x:nx,y:ny,h:bh});
    }
    if(K.tips.length>60)K.tips.splice(0,K.tips.length-60);
  }
}

/* reconciliation: after growth, thread streets through any built fabric
   the era-growth skeleton did not reach, oriented to the local grain,
   so streets and development end mutually consistent. */
function backfillStreets(world){
  const {N,rng}=world;const idx=(x,y)=>y*N+x;
  const unserved=new Set();
  for(let i=0;i<N*N;i++){
    const lu=world.landUse[i];
    if(lu&&LU_META[lu]&&(LU_META[lu].res||lu===LU.highStreet||lu===LU.cbd)&&!world.devMask[i])unserved.add(i);
  }
  const S=world.settlements;
  for(const s of S){
    const mine=[...unserved].filter(i=>world.settleOf[i]===s.id);
    if(!mine.length)continue;
    const th=s.skel?s.skel.theta:skelTheta(world,s);
    const set=new Set(mine);
    const c=Math.cos(th),s2=Math.sin(th);
    let umin=1e9,umax=-1e9,vmin=1e9,vmax=-1e9;
    for(const i of set){const x=i%N,y=(i/N)|0;
      const u=x*c+y*s2,v=-x*s2+y*c;
      if(u<umin)umin=u;if(u>umax)umax=u;if(v<vmin)vmin=v;if(v>vmax)vmax=v;}
    const inSet=(x,y)=>{const X=Math.round(x),Y=Math.round(y);return X>=0&&Y>=0&&X<N&&Y<N&&set.has(idx(X,Y));};
    for(let v=vmin+0.4;v<vmax;v+=0.8){
      let run=null;
      for(let u=umin;u<=umax;u+=0.4){
        const x=u*c-v*s2,y=u*s2+v*c;
        if(inSet(x,y)){
          (run=run||[]).push([x,y]);
          world.devMask[idx(Math.round(x),Math.round(y))]=1;
        } else if(run){
          if(run.length>=2)world.streets.push({pts:run,sid:s.id,era:2,fill:true});
          run=null;
        }
      }
      if(run&&run.length>=2)world.streets.push({pts:run,sid:s.id,era:2,fill:true});
    }
  }
}

/* morphological closing of the developable area: the mask is the URBAN
   AREA the skeleton serves, not a set of line buffers. Kills striping. */
function closeDevMask(world){
  const {N}=world;const m=world.devMask;
  const tmp=new Uint8Array(N*N);
  // dilate by 1
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=y*N+x;
    if(m[i]){tmp[i]=1;continue;}
    for(const d of[1,-1,N,-N,N+1,N-1,-N+1,-N-1])if(m[i+d]){tmp[i]=1;break;}
  }
  // erode by 1 (keeps outline, fills interior gaps up to 2 wide)
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=y*N+x;
    if(!tmp[i]){continue;}
    let solid=true;
    for(const d of[1,-1,N,-N])if(!tmp[i+d]){solid=false;break;}
    m[i]=solid||m[i]?1:0;
  }
}
