"use strict";
/* ============================================================
   TRANSPORT NETWORKS (built in historical order)
   - Roman road: near-straight, tolerates gradient, if the town
     has Roman origins; survives as a modern A-road alignment.
   - Medieval road net: main town <-> market towns <-> villages;
     avoids slopes, marsh and river crossings except at
     established fords; later routes reuse earlier alignments
     (cost discount), which is how English road hierarchies
     actually accreted.
   - Railways (1840s-60s): ruling-gradient routing (cuttings &
     short tunnels where unavoidable), a main line through the
     principal town, branches to port/resort/market towns and
     mineral lines to collieries; a share of branches closed
     1963-66 (Beeching) and persist as green corridors.
   - Motorway (1960s-70s) skirting the built-up area; ring road.
   - Road numbering follows the real zonal system by region.
   ============================================================ */

const ROADCLASS={street:1,minor:2,B:3,A:4,Adual:5,motorway:6};

function makeRouter(world){
  const {N}=world; const idx=(x,y)=>y*N+x;
  const {elev,sea,river,slope,cover}=world;
  // static cost-noise: roads deviate for field boundaries, ownership, minor obstacles
  if(!world._costNoise){
    const cn=new Float32Array(N*N);
    const nzc=makeNoise2D(world.rng.fork("costnoise").int(0,1e9));
    for(let y=0;y<N;y++)for(let x=0;x<N;x++)
      cn[idx(x,y)]=0.55*Math.abs(fbm(nzc,x/N*9,y/N*9,3))+0.25*Math.abs(fbm(nzc,x/N*23+7,y/N*23+7,2));
    world._costNoise=cn;
  }
  const costNoise=world._costNoise;
  return function route(ax,ay,bx,by,mode,opts={}){
    const heap=new MinHeap();
    const distA=new Float64Array(N*N).fill(Infinity);
    const prev=new Int32Array(N*N).fill(-1);
    const s=idx(ax,ay),g=idx(bx,by);
    const closed=new Uint8Array(N*N);
    distA[s]=0; heap.push(0,s);
    const h=(i)=>{const x=i%N,y=(i/N)|0;return dist(x,y,bx,by);};
    const rr=world.roadRaster;
    function cellCost(i){
      if(sea[i]) return mode==="rail"&&opts.coastOk?60:Infinity;   // open water is a wall, not a toll
      const sl=slope[i];
      let c=1;
      // organic deviation: motorways engineered straighter, lanes wander most
      if(mode==="roman") c+=costNoise[i]*0.06;
      else if(mode==="motorway"||mode==="rail") c+=costNoise[i]*0.18;
      else c+=costNoise[i]*(opts.lane?1.35:mode==="rail"?0.08:0.7);
      if(mode==="roman") c+=sl*4;
      else if(mode==="road") c+=sl*sl*180+sl*4;
      else if(mode==="rail") c+=Math.min(sl*70,14);
      else if(mode==="motorway") c+=sl*sl*260+sl*5;
      if(river[i]>=1&&mode!=="rail") c+= mode==="motorway"?3:(2.5+river[i]*2.5);
      if(river[i]>=1&&mode==="rail") c+=3;
      if(cover[i]===5) c+= mode==="rail"?2:5;
      if(cover[i]===3&&mode==="road") c+=1.5;
      if(rr&&mode==="road"&&rr[i]>=ROADCLASS.minor) c*=0.42;     // reuse old alignments
      if(mode==="motorway"&&world.landUse&&world.landUse[i]>0&&world.landUse[i]<40) c+=40; // don't bulldoze the town
      if(mode==="rail"&&world.landUse&&world.landUse[i]===1) c+=25; // skirt medieval core
      if(opts.avoid&&opts.avoid(i)) c+=opts.avoidCost||30;
      return c;
    }
    let expanded=0;
    const maxExpand=opts.maxExpand||(opts.lane?15000:N*N+10);
    while(heap.size){
      const [,i]=heap.pop();
      if(i===g)break;
      if(closed[i])continue;
      closed[i]=1;
      if(++expanded>maxExpand)return null;
      const d=distA[i];
      const x=i%N,y=(i/N)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        const j=idx(X,Y);
        if(closed[j])continue;
        const step=(dx&&dy)?1.414:1;
        // ruling gradient: cost of CLIMB along the step, not just local slope.
        // This is what makes real roads contour-follow and hairpin.
        let climbC=0;
        if(!sea[i]&&!sea[j]){
          const grad=Math.abs(elev[j]-elev[i])/(step*world.cellKm*1000); // rise/run
          const g0=mode==="rail"?0.02:mode==="motorway"?0.04:mode==="roman"?0.14:0.075;
          const r2=grad/g0;
          climbC=r2*r2*(mode==="rail"?9:mode==="motorway"?6:mode==="roman"?1.2:4);
        }
        const nd=d+step*(0.5*(cellCost(i)+cellCost(j))+climbC);
        if(nd<distA[j]){distA[j]=nd;prev[j]=i;heap.push(nd+h(j)*(mode==="roman"?1.6:1.02),j);}
      }
    }
    if(prev[g]<0&&g!==s)return null;
    const pts=[];let c=g;
    while(c>=0){pts.push([c%N,(c/N)|0]);if(c===s)break;c=prev[c];}
    pts.reverse();
    return pts;
  };
}

/* Chaikin corner-cutting: engineered curves for display geometry */
function chaikin(pts,iters){
  let p=pts;
  for(let it=0;it<iters;it++){
    if(p.length<3)break;
    const q=[p[0]];
    for(let k=0;k<p.length-1;k++){
      const [ax,ay]=p[k],[bx,by]=p[k+1];
      q.push([ax*0.75+bx*0.25,ay*0.75+by*0.25],[ax*0.25+bx*0.75,ay*0.25+by*0.75]);
    }
    q.push(p[p.length-1]);
    p=q;
  }
  return p;
}

/* concatenated alignments (motorway halves, ring segments) can double
   back on themselves where the legs meet: excise any short loop where
   the path revisits a cell it passed within the last ~45 steps */
function pruneLoops(pts){
  const seen=new Map();const out=[];
  for(const p of pts){
    const k=Math.round(p[0])+","+Math.round(p[1]);
    const prev=seen.get(k);
    if(prev!==undefined&&out.length-prev<=45&&out.length-prev>=2){
      for(let j=prev+1;j<out.length;j++)seen.delete(Math.round(out[j][0])+","+Math.round(out[j][1]));
      out.length=prev+1;
    }else{seen.set(k,out.length);out.push(p);}
  }
  return out;
}

function stampRoad(world,pts,cls){
  const {N}=world;const idx=(x,y)=>y*N+x;
  for(const[x,y]of pts){const i=idx(x,y);if(world.roadRaster[i]<cls)world.roadRaster[i]=cls;}
}
function stampRail(world,pts){
  const {N}=world;const idx=(x,y)=>y*N+x;
  for(const[x,y]of pts) world.railRaster[idx(x,y)]=1;
}

function roadNumber(world,major){
  const zone={"north-east":"1","yorkshire":"6","north-west":"6","east-midlands":"6","west-midlands":"5","east":"1","south-east":"2","south-west":"3"}[world.regionKey];
  const r=world.rng;
  return "A"+zone+(major?String(r.int(0,9)):String(r.int(10,99)));
}
function motorwayNumber(world){
  const opts={"north-east":["A1(M)","M69"],"yorkshire":["M62","M1","M18"],"north-west":["M6","M61","M65"],"east-midlands":["M1","M69"],"west-midlands":["M6","M5","M54"],"east":["M11","A14(M)"],"south-east":["M2","M3","M23","M20"],"south-west":["M5","A30(M)"]}[world.regionKey];
  return world.rng.pick(opts);
}

function buildHistoricRoads(world){
  const {N,rng}=world;
  world.roadRaster=new Uint8Array(N*N);
  world.railRaster=new Uint8Array(N*N);
  world.roads=[]; world.rail=[]; world.stations=[];
  world.ferries=[];
  const route=world.route=makeRouter(world);
  const S=world.settlements, main=world.main;

  // Roman road: two straight-ish legs through the town, border to border
  if(main.origin==="roman"){
    const th=rng.range(0,Math.PI);
    /* each leg's end is walked inward from the border until it stands on
       land; a leg whose whole bearing lies over the sea is dropped (the
       road went to a port that is off this sheet) */
    const romanEnd=(sign)=>{
      for(let t=1.5;t>0.2;t-=0.02){
        const x=clamp(Math.round(main.x+sign*Math.cos(th)*N*t),1,N-2);
        const y=clamp(Math.round(main.y+sign*Math.sin(th)*N*t),1,N-2);
        if(!world.sea[y*N+x])return [x,y];
      }
      return null;
    };
    const ends=[romanEnd(1),romanEnd(-1)].filter(Boolean);
    for(const[ex,ey]of ends){
      // clip to border by walking from town outward: route to clamped end
      const p=route(main.x,main.y,ex,ey,"roman");
      if(p&&p.length>4){world.roads.push({cls:"A",pts:p,name:roadNumber(world,true),era:"roman",roman:true});stampRoad(world,p,ROADCLASS.A);}
    }
  }

  // main <-> market towns (become A-roads)
  for(const t of S.filter(s=>s.kind==="market-town"||s.kind==="port-town"||s.kind==="resort")){
    const p=route(main.x,main.y,t.x,t.y,"road");
    if(p){world.roads.push({cls:"A",pts:p,name:roadNumber(world,false),era:"medieval"});stampRoad(world,p,ROADCLASS.A);}
  }
  // market towns to nearest neighbour market town (B/A)
  const towns=S.filter(s=>s.kind!=="village"&&s.kind!=="main");
  for(let i=0;i<towns.length;i++){
    let bn=null,bd=1e9;
    for(let j=0;j<towns.length;j++){if(i===j)continue;const d=dist(towns[i].x,towns[i].y,towns[j].x,towns[j].y);if(d<bd){bd=d;bn=towns[j];}}
    if(bn){const p=route(towns[i].x,towns[i].y,bn.x,bn.y,"road");
      if(p){world.roads.push({cls:"B",pts:p,name:"B"+world.rng.int(1000,6999),era:"medieval"});stampRoad(world,p,ROADCLASS.B);}}
  }
  // villages -> nearest larger settlement (minor roads)
  for(const v of S.filter(s=>["village","pit-village","mill-village","mining-hamlet","fishing-village"].includes(s.kind))){
    let bn=main,bd=dist(v.x,v.y,main.x,main.y);
    for(const t of towns){const d=dist(v.x,v.y,t.x,t.y);if(d<bd){bd=d;bn=t;}}
    // also connect to nearest road cell if closer than settlement
    const p=route(v.x,v.y,bn.x,bn.y,"road");
    if(p){
      // trim once we touch an existing >=B road (join the network)
      let cut=p.length;
      for(let k=6;k<p.length;k++){const i=p[k][1]*N+p[k][0];if(world.roadRaster[i]>=ROADCLASS.B){cut=k+1;break;}}
      const q=p.slice(0,cut);
      world.roads.push({cls:"minor",pts:q,era:"medieval"});stampRoad(world,q,ROADCLASS.minor);
    }
  }
  // exit roads to map edges from main town (long-distance routes)
  const edgesPts=[["N",Math.round(N*0.5),1],["S",Math.round(N*0.5),N-2],["W",1,Math.round(N*0.5)],["E",N-2,Math.round(N*0.5)]]
    .filter(([sd])=>world.edges[sd]!=="sea")            // no road runs into the sea
    .map(([,x2,y2])=>[x2,y2]);
  let exits=0;
  const exitCap=Math.min(Math.max(1,edgesPts.length),world.rng.chance(0.55)?3:2);
  for(const[ex,ey]of world.rng.shuffle(edgesPts.slice())){
    if(exits>=exitCap)break;
    const i=ey*N+ex; if(world.sea[i])continue;
    const p=route(main.x,main.y,ex,ey,"road");
    if(p){world.roads.push({cls:"A",pts:p,name:roadNumber(world,exits===0),era:"turnpike"});stampRoad(world,p,ROADCLASS.A);exits++;}
  }

  /* -------- classified roads continue beyond the sheet --------
     A road that ends at a town near the survey edge did not, in
     reality, end there: it carried on to the next county. Extend such
     ends outward on their own bearing, usually but not always (a few
     genuine termini survive). */
  {
    const extended=new Set();
    for(const r of world.roads){
      if(!["A","B"].includes(r.cls)||r.roman||r.era==="turnpike")continue;
      for(const endIdx of [0,r.pts.length-1]){
        const p2=r.pts[endIdx];
        const eDist=Math.min(p2[0],p2[1],N-1-p2[0],N-1-p2[1]);
        if(eDist<5||eDist>N*0.30)continue;               // already there, or deep inland
        const tk=Math.round(p2[0]/3)+","+Math.round(p2[1]/3);
        if(extended.has(tk))continue;                     // one continuation per place
        if(!rng.chance(0.65))continue;                    // NOT always: some roads do end
        const q=r.pts[endIdx===0?Math.min(6,r.pts.length-1):Math.max(0,r.pts.length-7)];
        let hx=p2[0]-q[0],hy=p2[1]-q[1];const L2=Math.hypot(hx,hy)||1;hx/=L2;hy/=L2;
        // walk the bearing to the border; give up if it runs into the sea
        let tx=-1,ty=-1;
        for(let t=1;t<N;t++){
          const X=Math.round(p2[0]+hx*t),Y=Math.round(p2[1]+hy*t);
          if(X<1||Y<1||X>N-2||Y>N-2){tx=clamp(X,1,N-2);ty=clamp(Y,1,N-2);break;}
          if(world.sea[Y*N+X]){tx=-1;break;}
          tx=X;ty=Y;
        }
        if(tx<0)continue;
        if(Math.min(tx,ty,N-1-tx,N-1-ty)>3)continue;      // bearing never reached the edge
        const ext=route(p2[0],p2[1],tx,ty,"road");
        if(ext&&ext.length>3){
          extended.add(tk);
          if(endIdx===0)r.pts=ext.slice().reverse().concat(r.pts);
          else r.pts=r.pts.concat(ext.slice(1));
          stampRoad(world,ext,ROADCLASS[r.cls]);
        }
      }
    }
  }



  /* -------- island: ferry links replace land connections -------- */
  if(["N","E","S","W"].every(s2=>world.edges[s2]==="sea")){
    // one or two ferry routes from the main coastal town toward the
    // open sea (the mainland lies beyond the sheet)
    const m2=world.main;
    const idx=(x,y)=>y*N+x;
    let hx=m2.x,hy=m2.y,bd=1e9;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i=idx(x,y);if(world.sea[i])continue;
      let cst=false;for(const j2 of[i-1,i+1,i-N,i+N])if(j2>=0&&j2<N*N&&world.sea[j2])cst=true;
      if(cst){const d2=dist(x,y,m2.x,m2.y);if(d2<bd){bd=d2;hx=x;hy=y;}}
    }
    const nF=rng.chance(0.5)?2:1;
    for(let f=0;f<nF;f++){
      const th=rng.range(0,6.283);
      const ex=clamp(Math.round(hx+Math.cos(th)*N),0,N-1),ey=clamp(Math.round(hy+Math.sin(th)*N),0,N-1);
      world.ferries.push({from:[hx,hy],to:[ex,ey]});
    }
  }

  /* -------- rail continues beyond the sheet --------
     Main lines do not terminate at the survey edge: extend each trunk
     line from its outer terminals to the nearest sheet edge on its
     current bearing, as the real network would continue to the next
     county. */
  for(const line of world.rail){
    if(line.disused||line.mineral||line.branch)continue;
    for(const endIdx of [0,line.pts.length-1]){
      const p2=line.pts[endIdx];
      const q=line.pts[endIdx===0?Math.min(6,line.pts.length-1):Math.max(0,line.pts.length-7)];
      let hx=p2[0]-q[0],hy=p2[1]-q[1];const L=Math.hypot(hx,hy)||1;hx/=L;hy/=L;
      const edgeDist=Math.min(p2[0],p2[1],N-1-p2[0],N-1-p2[1]);
      if(edgeDist<4)continue;               // already at the edge
      const ext=route(p2[0],p2[1],
        clamp(Math.round(p2[0]+hx*edgeDist*1.6),1,N-2),
        clamp(Math.round(p2[1]+hy*edgeDist*1.6),1,N-2),"rail");
      if(ext&&ext.length>3){
        if(endIdx===0)line.pts=ext.slice().reverse().concat(line.pts);
        else line.pts=line.pts.concat(ext.slice(1));
      }
    }
  }

  /* -------- B-road densification --------
     Minor roads that connect settlements of any size were metalled and
     classified in the 1920s-30s; each settlement over ~800 also gets a
     classified link toward its second-nearest town. */
  for(const r of world.roads){
    if(r.cls!=="minor")continue;
    // does this road serve a settlement of >800?
    const end=r.pts[0], end2=r.pts[r.pts.length-1];
    const near=(p2)=>S.find(t=>dist(t.x,t.y,p2[0],p2[1])<4&&t.target>800);
    if(near(end)||near(end2)){r.cls="B";r.name="B"+world.rng.int(1000,6999);stampRoad(world,r.pts,ROADCLASS.B);}
  }
  {
    const bigs=S.filter(t=>t.target>800);
    for(const a of bigs){
      const near=bigs.filter(b=>b!==a).map(b=>[dist(a.x,a.y,b.x,b.y),b]).sort((p,q)=>p[0]-q[0]);
      if(near.length>=2){
        const b=near[1][1];
        if(near[1][0]<N*0.28){
          const p=route(a.x,a.y,b.x,b.y,"road");
          if(p){world.roads.push({cls:"B",pts:p,name:"B"+world.rng.int(1000,6999),era:"interwar"});stampRoad(world,p,ROADCLASS.B);}
        }
      }
    }
  }

  /* -------- rural lane web: every settlement to 2-3 nearest neighbours -------- */
  const allS=S.slice();
  const laneKey=(a,b)=>{const ka=a.x+","+a.y,kb=b.x+","+b.y;return ka<kb?ka+"|"+kb:kb+"|"+ka;};
  const done=new Set();
  for(const a of allS){
    const near=allS.filter(b=>b!==a)
      .map(b=>[dist(a.x,a.y,b.x,b.y),b]).sort((p,q)=>p[0]-q[0]).slice(0,2);
    const seaBetween=(p,q)=>{const st=Math.ceil(dist(p.x,p.y,q.x,q.y));
      for(let k=1;k<st;k++){const X=Math.round(lerp(p.x,q.x,k/st)),Y=Math.round(lerp(p.y,q.y,k/st));
        if(world.sea[Y*N+X])return true;}return false;};
    let linked=0;
    for(const[d,b]of near){
      if(linked>=2&&d>N*0.18)break;
      const k=laneKey(a,b); if(done.has(k))continue; done.add(k);
      if(d>N*0.30)continue;
      if(seaBetween(a,b))continue;
      const p=route(a.x,a.y,b.x,b.y,"road",{lane:true});
      if(!p)continue;
      // join the network early: trim at first existing road of >= minor class
      let cut=p.length;
      for(let k2=5;k2<p.length;k2++){const i=p[k2][1]*N+p[k2][0];if(world.roadRaster[i]>=ROADCLASS.minor){cut=k2+1;break;}}
      const q=p.slice(0,cut);
      if(q.length<4){linked++;continue;}
      world.roads.push({cls:"lane",pts:q,era:"medieval"});stampRoad(world,q,ROADCLASS.street);
      linked++;
    }
  }

  /* smooth display geometry for every road (raster keeps the raw cells) */
  for(const r of world.roads) r.draw=chaikin(r.pts,2);
}

function buildRail(world){
  const {N,rng}=world, route=world.route, main=world.main;
  const idx=(x,y)=>y*N+x;
  // main line across the map through the town: pick the two cheapest opposite border points
  const cand=[];
  for(const [x,y,side] of [[Math.round(N*0.35),1,"N"],[Math.round(N*0.65),1,"N"],[Math.round(N*0.35),N-2,"S"],[Math.round(N*0.65),N-2,"S"],[1,Math.round(N*0.35),"W"],[1,Math.round(N*0.65),"W"],[N-2,Math.round(N*0.35),"E"],[N-2,Math.round(N*0.65),"E"]]){
    if(world.sea[idx(x,y)])continue;
    if(world.edges[side]==="sea")continue;   // a sea edge is open water, not a route out
    cand.push({x,y,side});
  }
  let mainLine=null;
  const tried=new Set();
  const pairs=[];
  for(const a of cand)for(const b of cand){if(a.side===b.side)continue;const k=[a.side,b.side].sort().join("");if(tried.has(k))continue;tried.add(k);pairs.push([a,b]);}
  rng.shuffle(pairs);
  // the main line serves the towns it passes: route via the two
  // largest satellite towns (real Victorian trunks were built through
  // traffic, not around it)
  const viaTowns=world.settlements
    .filter(t=>t.id!==main.id&&["market-town","port-town","resort"].includes(t.kind))
    .sort((a2,b2)=>(b2.target||0)-(a2.target||0)).slice(0,2);
  for(const [a,b] of pairs.slice(0,2)){
    const legs=[];let ok=true;
    const waypoints=[[a.x,a.y]];
    if(viaTowns[0])waypoints.push([viaTowns[0].x,viaTowns[0].y]);
    waypoints.push([main.x,main.y]);
    if(viaTowns[1])waypoints.push([viaTowns[1].x,viaTowns[1].y]);
    waypoints.push([b.x,b.y]);
    for(let k2=0;k2<waypoints.length-1;k2++){
      const leg=route(waypoints[k2][0],waypoints[k2][1],waypoints[k2+1][0],waypoints[k2+1][1],"rail");
      if(!leg){ok=false;break;}
      legs.push(k2===0?leg:leg.slice(1));
    }
    if(ok){mainLine={pts:[].concat(...legs),name:"Main line",era:"victorian"};break;}
  }
  if(!mainLine)for(const [a,b] of pairs.slice(0,4)){
    const p1=route(a.x,a.y,main.x,main.y,"rail"),p2=route(main.x,main.y,b.x,b.y,"rail");
    if(p1&&p2){mainLine={pts:p1.concat(p2.slice(1)),name:"Main line",era:"victorian"};break;}
  }
  if(mainLine){world.rail.push(mainLine);stampRail(world,mainLine.pts);}
  // principal station: on the line ~0.6-1.2 km from the centre
  if(mainLine){
    let best=null,bd=1e9;
    const want=0.9/world.cellKm;
    for(const [x,y] of mainLine.pts){const d=Math.abs(dist(x,y,main.x,main.y)-want);if(d<bd){bd=d;best=[x,y];}}
    if(best)world.stations.push({x:best[0],y:best[1],name:main.name,main:true,open:true});
  }
  // branches: to port/resort/market towns and mineral lines
  const S=world.settlements;
  const branchTargets=S.filter(s=>["market-town","port-town","resort"].includes(s.kind));
  for(const t of branchTargets){
    const p=route(main.x,main.y,t.x,t.y,"rail");
    if(!p)continue;
    const closed = t.kind!=="port-town" && rng.chance(0.45);          // Beeching
    world.rail.push({pts:p,name:t.name+" branch",era:"victorian",disused:closed});
    if(!closed)stampRail(world,p);
    world.stations.push({x:t.x,y:t.y,name:t.name,open:!closed});
  }
  for(const t of S.filter(s=>s.kind==="pit-village")){
    const p=route(main.x,main.y,t.x,t.y,"rail");
    if(p){world.rail.push({pts:p,name:t.name+" mineral line",era:"victorian",disused:true,mineral:true});}
  }
  world.railName=rng.pick(["North Eastern Railway","Midland Railway","Great Northern","London & South Western","Great Western","Lancashire & Yorkshire Railway"]);
}

function buildMotorway(world){
  const {N,rng}=world, route=world.route, main=world.main;
  const idx=(x,y)=>y*N+x;
  const want = world.sizeClass==="large" || (world.sizeClass==="medium"&&rng.chance(0.6));
  if(!want){world.motorway=null;}
  else{
    world.motorway=null;
    const offs=6/world.cellKm;
    for(let attempt=0;attempt<14&&!world.motorway;attempt++){
      const dirTheta=rng.range(0,Math.PI);
      const nx=Math.cos(dirTheta+Math.PI/2),ny=Math.sin(dirTheta+Math.PI/2);
      const cx=clamp(main.x+nx*offs,10,N-10),cy=clamp(main.y+ny*offs,10,N-10);
      if(world.sea[idx(Math.round(cx),Math.round(cy))])continue;
      /* walk each end inward from the border until it is on land. A
         motorway is a THROUGH route: an end that comes to rest well
         inside the sheet (because the bearing points out to sea) is a
         failed attempt, and the direction is re-drawn; only after the
         strict attempts are exhausted is a coastal terminus accepted
         (heavily marine counties may have no border-to-border corridor). */
      const strict=attempt<8;
      const endAt=sign=>{
        for(let t=1;t>0.25;t-=0.03){
          const x=clamp(Math.round(cx+sign*Math.cos(dirTheta)*N*t),1,N-2);
          const y=clamp(Math.round(cy+sign*Math.sin(dirTheta)*N*t),1,N-2);
          if(!world.sea[idx(x,y)]){
            if(strict&&Math.min(x,y,N-1-x,N-1-y)>5)return null;
            return [x,y];
          }
        }
        return null;
      };
      const a=endAt(1),b=endAt(-1);
      if(!a||!b||dist(a[0],a[1],b[0],b[1])<N*0.45)continue;
      const p1=route(a[0],a[1],Math.round(cx),Math.round(cy),"motorway");
      const p2=route(Math.round(cx),Math.round(cy),b[0],b[1],"motorway");
      if(p1&&p2){
        const pts=pruneLoops(p1.concat(p2.slice(1)));
        world.motorway={pts,name:motorwayNumber(world)};
        world.roads.push({cls:"motorway",pts,name:world.motorway.name,era:"postwar"});
        stampRoad(world,pts,ROADCLASS.motorway);
        // junction spur into town
        let bj=null,bd=1e9;
        for(const[x,y]of pts){const d=dist(x,y,main.x,main.y);if(d<bd){bd=d;bj=[x,y];}}
        if(bj){const sp=route(bj[0],bj[1],main.x,main.y,"motorway");
          if(sp){world.roads.push({cls:"Adual",pts:sp,name:roadNumber(world,true),era:"postwar"});stampRoad(world,sp,ROADCLASS.Adual);}}
      }
    }
  }
  /* -------- stations wherever a line passes a settlement -------- */
  {
    const lines2=world.rail.filter(l=>!l.mineral);
    for(const st of world.settlements){
      if((st.pop||st.target||0)<1200)continue;
      if(world.stations.some(s2=>dist(s2.x,s2.y,st.x,st.y)<4))continue;
      let bestP=null,bestLine=null,bd=3.5;
      for(const line of lines2){
        for(const p2 of line.pts){
          const d=dist(p2[0],p2[1],st.x,st.y);
          if(d<bd){bd=d;bestP=p2;bestLine=line;}
        }
      }
      if(bestP)world.stations.push({x:bestP[0],y:bestP[1],name:st.name,open:!bestLine.disused});
    }
  }
  /* -------- a branch was built TO its terminus: station there -------- */
  for(const L of world.rail){
    if(L.mineral)continue;
    for(const end of [L.pts[0],L.pts[L.pts.length-1]]){
      const ex=end[0],ey=end[1];
      if(world.stations.some(st=>dist(st.x,st.y,ex,ey)<3))continue;
      let bs=null,bd=3.6;
      for(const t of world.settlements){
        const d=dist(t.x,t.y,ex,ey);
        if(d<bd){bd=d;bs=t;}
      }
      if(bs)world.stations.push({x:Math.round(ex),y:Math.round(ey),name:bs.name,open:!L.disused});
    }
  }


  // inner ring / bypass for medium+
  if(world.sizeClass!=="small"){
    const r=(world.sizeClass==="large"?2.2:1.6)/world.cellKm;
    const segs=[];const M=10;
    for(let k=0;k<=M;k++){const th=(k/M)*Math.PI*(rng.chance(0.5)?2:1.4);
      const x=clamp(Math.round(main.x+Math.cos(th)*r),2,N-3),y=clamp(Math.round(main.y+Math.sin(th)*r),2,N-3);
      if(!world.sea[idx(x,y)])segs.push([x,y]);}
    let ring=[];
    for(let k=0;k<segs.length-1;k++){
      const p=route(segs[k][0],segs[k][1],segs[k+1][0],segs[k+1][1],"motorway");
      if(p)ring=ring.concat(k===0?p:p.slice(1));
    }
    if(ring.length>8){ring=pruneLoops(ring);world.roads.push({cls:"Adual",pts:ring,name:roadNumber(world,false),era:"postwar",ring:true});stampRoad(world,ring,ROADCLASS.Adual);}
  }
}
