"use strict";
/* ============================================================
   TRAFFIC & RAIL
   A compact four-step model:
   1. generation: AM-peak car trips per ward from resident
      workers x employment rate x car mode share (mode share
      responds to density, income, students and rail access);
   2. distribution: gravity model to employment clusters,
      impedance exp(-d/6.5 km) — the observed English commute
      decay scale;
   3. assignment: shortest-path (Dijkstra) over the road graph
      by congested time, iterated twice with the BPR volume-
      delay function t = t0(1+0.15(v/c)^4);
   4. rail: station catchments load the surviving branches
      toward the principal station; loads reported against a
      typical 3-car x 4 tph peak seat supply.
   ============================================================ */

const ROAD_SPEC={motorway:{v:100,cap:5800},Adual:{v:78,cap:3300},A:{v:56,cap:1500},B:{v:45,cap:850},minor:{v:40,cap:480},lane:{v:30,cap:300},street:{v:25,cap:380}};

function runTraffic(world){
  const {N,rng}=world;const idx=(x,y)=>y*N+x;
  /* ---- build graph ---- */
  const nodeId=new Map();const nodes=[];
  const getNode=i=>{let n=nodeId.get(i);if(n===undefined){n=nodes.length;nodeId.set(i,n);nodes.push(i);}return n;};
  const edges=[];const adj=[];
  const addEdge=(a,b,len,cls)=>{
    const e={a,b,len,cls,spec:ROAD_SPEC[cls]||ROAD_SPEC.lane,vol:0};
    const id=edges.length;edges.push(e);
    (adj[a]=adj[a]||[]).push(id);(adj[b]=adj[b]||[]).push(id);
  };
  for(const r of world.roads){
    if(r.disused)continue;
    for(let k=0;k<r.pts.length-1;k++){
      const[a,b]=[r.pts[k],r.pts[k+1]];
      const i1=idx(a[0],a[1]),i2=idx(b[0],b[1]);
      if(i1===i2)continue;
      addEdge(getNode(i1),getNode(i2),dist(a[0],a[1],b[0],b[1])*world.cellKm,r.cls);
    }
  }
  /* the synthesized street network joins the graph as routable
     low-capacity edges, so local traffic really runs on it */
  for(const st of (world.streets||[])){
    let prev=null;
    for(const [fx,fy] of st.pts){
      const cx=clamp(Math.round(fx),0,N-1),cy=clamp(Math.round(fy),0,N-1);
      const ci=idx(cx,cy);
      if(prev!==null&&prev!==ci){
        addEdge(getNode(prev),getNode(ci),
          dist(prev%N,(prev/N)|0,cx,cy)*world.cellKm,"street");
      }
      prev=ci;
    }
  }
  const streetNode=new Uint8Array(nodes.length);
  for(const e of edges)if(e.cls==="street"){streetNode[e.a]=1;streetNode[e.b]=1;}
  world.graph={nodes,edges,adj,nodeId};
  if(!edges.length){world.trafficDone=false;return;}

  const classifiedNode=new Uint8Array(nodes.length);
  for(const e of edges)if(e.cls!=="street"&&e.cls!=="lane"){classifiedNode[e.a]=1;classifiedNode[e.b]=1;}
  /* demand conservation requires every loading point to sit on the
     network's giant component: a node on a severed stub can neither
     reach nor be reached, and demand loaded there vanishes from the
     equilibrium as phantom unreachable trips */
  const comp=new Int32Array(nodes.length).fill(-1);
  {
    let best=-1,bestSize=0;
    for(let s2=0;s2<nodes.length;s2++){
      if(comp[s2]>=0)continue;
      const q=[s2];comp[s2]=s2;let sz=0;
      while(q.length){
        const n=q.pop();sz++;
        for(const eid of (adj[n]||[])){
          const m=edges[eid].a===n?edges[eid].b:edges[eid].a;
          if(comp[m]<0){comp[m]=s2;q.push(m);}
        }
      }
      if(sz>bestSize){bestSize=sz;best=s2;}
    }
    for(let n=0;n<nodes.length;n++)comp[n]=comp[n]===best?1:0;
  }
  const nearestNode=(x,y)=>{
    // connectors load the CLASSIFIED network; streets receive traffic only
    // by route choice, never as zone loading points
    let b=0,bd=1e9;
    for(let n=0;n<nodes.length;n++){
      if(!classifiedNode[n]||!comp[n])continue;
      const i=nodes[n];const d=dist(x,y,i%N,(i/N)|0);if(d<bd){bd=d;b=n;}}
    return b;
  };
  const nearestNodes=(x,y,k)=>{
    const arr=[];
    for(let n=0;n<nodes.length;n++){
      if(!classifiedNode[n]||!comp[n])continue;
      const i=nodes[n];arr.push([dist(x,y,i%N,(i/N)|0),n]);}
    arr.sort((a,b)=>a[0]-b[0]);
    // spread over distinct nearby entry points (>=4 cells apart)
    const out=[arr[0][1]];
    for(let t=1;t<arr.length&&out.length<k;t++){
      const cand=nodes[arr[t][1]];
      let ok=true;
      for(const o of out){const oi=nodes[o];if(dist(cand%N,(cand/N)|0,oi%N,(oi/N)|0)<4)ok=false;}
      if(ok)out.push(arr[t][1]);
    }
    return out;
  };

  /* ---- employment clusters, sector-resolved ---- */
  const B=Math.ceil(N/14);const bins=new Map();
  const secList=["manufacturing","logistics","retail","hospitality","office","public","education","health","energy","agriculture"];
  for(let i=0;i<N*N;i++){
    if(world.jobs[i]<=0)continue;
    const x=i%N,y=(i/N)|0;const key=((y/14)|0)*B+((x/14)|0);
    let b=bins.get(key);
    if(!b){b={j:0,x:0,y:0,sec:{}};bins.set(key,b);}
    b.j+=world.jobs[i];b.x+=x*world.jobs[i];b.y+=y*world.jobs[i];
    for(const s of secList){const v=world.jobsSec[s][i];if(v>0)b.sec[s]=(b.sec[s]||0)+v;}
  }
  const clusters=[...bins.values()].map(b=>({jobs:b.j,x:b.x/b.j,y:b.y/b.j,sec:b.sec}))
    .sort((a,b)=>b.jobs-a.jobs).slice(0,16);
  for(const c of clusters)c.node=nearestNode(c.x,c.y);
  /* group-specific attractiveness of each cluster:
     professional -> office/edu/health; routine -> manufacturing/logistics/retail;
     intermediate -> broad mix. Real segregation of commute fields. */
  const GW={
    prof:{office:1.6,education:1.3,health:1.1,public:0.9,retail:0.25,hospitality:0.2,manufacturing:0.30,logistics:0.2,energy:0.5,agriculture:0.1},
    inter:{office:0.8,education:0.8,health:0.9,public:1,retail:0.9,hospitality:0.7,manufacturing:0.9,logistics:0.8,energy:0.8,agriculture:0.5},
    routine:{office:0.2,education:0.35,health:0.6,public:0.6,retail:1.2,hospitality:1.1,manufacturing:1.6,logistics:1.5,energy:1.1,agriculture:1.2},
  };
  for(const c of clusters){
    c.attr={};
    for(const g in GW){let a=0;for(const s in c.sec)a+=c.sec[s]*(GW[g][s]||0.5);c.attr[g]=a;}
  }

  /* ---- station access (for mode share) ---- */
  const openStations=world.stations.filter(s=>s.open);
  const railAccess=w=>{
    let a=0;for(const s of openStations){const d=dist(w.cx,w.cy,s.x,s.y)*world.cellKm;a=Math.max(a,Math.exp(-d/1.5));}return a;
  };

  /* ---- public transport & cycling: ward level of service ----
     Bus: English bus provision follows density and corridor position -
     frequent services run on the radial A/B roads into the centre.
     LOS = f(density, on-corridor, distance to centre), expressed as
     buses/hour, and it suppresses car commuting where it is high.
     Cycling: census cycle-to-work is ~3% nationally but 8-15% in flat
     university towns; modelled from mean slope, students, distance. */
  const wards=world.wards;
  for(const w of wards){
    const dCentre=dist(w.cx,w.cy,world.main.x,world.main.y)*world.cellKm;
    let corridor=0;
    for(const i of w.cells){if(world.roadRaster[i]>=ROADCLASS.B)corridor=1;}
    const dens0=w.pop/Math.max(0.3,w.areaKm2);

    let mSlope=0;for(const i of w.cells)mSlope+=world.slope[i];
    mSlope/=Math.max(1,w.cells.length);
    w.cycleShare=clamp(0.012+w.students*0.28+(0.05-mSlope)*0.8-(dCentre>5?0.01:0),0.003,0.16);
  }
  /* ---- bus network: routes, frequencies, ward level of service ----
     Routes run from each substantial urban district and each satellite
     town to the main centre along the classified roads (how English
     bus networks are actually structured: radial, centre-focused).
     Frequency follows population served; a ward's buses per hour is
     the sum of route frequencies passing through it. */
  {
    const busSP=(src,dst)=>{
      const distT=new Float64Array(nodes.length).fill(Infinity);
      const prevE=new Int32Array(nodes.length).fill(-1);
      const heap=new MinHeap();distT[src]=0;heap.push(0,src);
      while(heap.size){
        const[d,n]=heap.pop();if(d>distT[n]+1e-9)continue;
        if(n===dst)break;
        for(const eid of (adj[n]||[])){
          const e=edges[eid];const m=e.a===n?e.b:e.a;
          const nd=d+e.len/e.spec.v;
          if(nd<distT[m]){distT[m]=nd;prevE[m]=eid;heap.push(nd,m);}
        }
      }
      return prevE;
    };
    const centreNode=nearestNode(world.main.x,world.main.y);
    const origins=[];
    for(let wi=0;wi<wards.length;wi++){
      const W=wards[wi];
      if(W.urban&&W.pop>2500&&dist(W.cx,W.cy,world.main.x,world.main.y)*world.cellKm>1.2)
        origins.push({node:nearestNode(W.cx,W.cy),pop:W.pop});
    }
    for(const st of world.settlements)
      if(["market-town","port-town","resort","mill-village","pit-village"].includes(st.kind)&&st.pop>1500)
        origins.push({node:nearestNode(st.x,st.y),pop:st.pop});
    const routes=world.busRoutes=[];
    for(const w2 of wards)w2.busPerHour=0;
    for(const o of origins){
      const prevE=busSP(o.node,centreNode);
      const pathCells=[];let n=centreNode,g=0;
      while(n!==o.node&&prevE[n]>=0&&g++<20000){
        const e=edges[prevE[n]];
        pathCells.push(nodes[n]);
        n=e.a===n?e.b:e.a;
      }
      if(n!==o.node)continue;
      pathCells.push(nodes[o.node]);
      const freq=clamp(Math.round(o.pop/2600),1,6);
      routes.push({cells:pathCells,freq});
      const seenW=new Set();
      for(const c of pathCells){
        const wk=world.wardOf[c];
        if(wk>=0&&!seenW.has(wk)){seenW.add(wk);wards[wk].busPerHour+=freq;}
      }
    }
    for(const w2 of wards)w2.busPerHour=Math.min(w2.busPerHour,18);
  }

  for(let wIdx=0;wIdx<wards.length;wIdx++){
    const w=wards[wIdx];
    const workers=w.pop*0.46*(1-w.unemployment)*(1-w.students*0.55);
    // occupational split from the ward's stock-derived class profile
    const prof=clamp(w.degree*1.15,0.08,0.62);
    const routine=clamp(0.62-w.aff*0.55,0.10,0.55);
    const inter=Math.max(0.05,1-prof-routine);
    w.groups={prof:workers*prof,inter:workers*inter,routine:workers*routine};
    const dens=w.pop/Math.max(0.3,w.areaKm2);
    const ra=railAccess(w);
    w.railShare=clamp(ra*(world.sizeClass==="large"?0.15:0.09)*(0.7+0.6*prof),0,0.19);
    // group car availability: routine workers in low-car wards walk/bus
    w.carByGroup={
      prof:clamp(0.94+0.18*(w.carsPerHh-0.9)-dens/42000,0.4,0.93),
      inter:clamp(0.85+0.2*(w.carsPerHh-0.9)-dens/36000,0.3,0.88),
      routine:clamp(0.72+0.24*(w.carsPerHh-0.9)-dens/30000,0.2,0.8),
    };
    // bus and bike suppress car use
    const busEffect=clamp(w.busPerHour/45,0,0.22);
    for(const g in w.carByGroup)w.carByGroup[g]*=(1-busEffect)*(1-w.cycleShare);
    let amCar=0;for(const g in w.groups)amCar+=w.groups[g]*w.carByGroup[g]*(1-w.railShare);
    w.amCarTrips=amCar*0.38;               // AM peak-hour departure factor
    w.busWalkShare=1-w.railShare-(amCar/Math.max(1,workers));
    w.accessNodes=nearestNodes(w.cx,w.cy,3);
    w.accessW=w.accessNodes.length===3?[0.5,0.3,0.2]:w.accessNodes.length===2?[0.62,0.38]:[1];
    if(w.urban){
      // access via the ward's own streets (fixes the connector pathology
      // where all demand teleported onto classified roads)
      const cands=[];
      for(let n=0;n<nodes.length;n++){
        if(!streetNode[n]||!comp[n])continue;   // giant component only, like every loading point
        const i=nodes[n];
        if(world.wardOf[i]===wIdx)cands.push(n);
      }
      if(cands.length){
        const picks=[cands[0]];
        for(const c of cands){
          if(picks.length>=2)break;
          const ci=nodes[c];
          if(picks.every(p2=>dist(ci%N,(ci/N)|0,nodes[p2]%N,(nodes[p2]/N)|0)>=4))picks.push(c);
        }
        w.accessNodes=picks.concat(w.accessNodes.slice(0,1));
        // street entries carry ~65% of access demand, classified the rest;
        // weights built to the exact connector count, then normalised
        const wts=[];
        picks.forEach((_,q)=>wts.push(q===0?0.4:0.25));
        for(let q=picks.length;q<w.accessNodes.length;q++)wts.push(q===picks.length?0.22:0.13);
        const tot=wts.reduce((a,b)=>a+b,0);
        w.accessW=wts.map(v=>v/tot);
      }
    }
    w.node=w.accessNodes[w.accessNodes.length-1];
  }

  const clusterTargets=new Set();
  for(const c of clusters)clusterTargets.add(c.node);

  /* ---- OD matrix from the ACTUAL household-to-job matches ---- */
  const flows=wards.map(()=>clusters.map(()=>0));
  {
    const P=world.pops;
    // map each workplace cell to its cluster (nearest bin centroid)
    const clusterOf=i=>{
      const x=i%N,y=(i/N)|0;let b=0,bd=1e9;
      for(let ci=0;ci<clusters.length;ci++){const d=dist(x,y,clusters[ci].x,clusters[ci].y);if(d<bd){bd=d;b=ci;}}
      return b;
    };
    const cache=new Map();
    world._outByWard=wards.map(()=>0);
    for(let h=0;h<P.n;h++){
      const wkO=world.wardOf[P.home[h]];
      if(P.work[h]===-2&&wkO>=0){                    // outbound commuter
        const WO=wards[wkO];
        const gO=["routine","inter","prof"][P.seg[h]];
        const carO=WO.carByGroup?WO.carByGroup[gO]:0.5;
        world._outByWard[wkO]+=P.workers[h]*carO*0.38;
        continue;
      }
      if(P.work[h]<0)continue;
      const wk=world.wardOf[P.home[h]];if(wk<0)continue;
      const W=wards[wk];
      let ci=cache.get(P.work[h]);
      if(ci===undefined){ci=clusterOf(P.work[h]);cache.set(P.work[h],ci);}
      const g=["routine","inter","prof"][P.seg[h]];
      const car=W.carByGroup?W.carByGroup[g]:0.5;
      flows[wk][ci]+=P.workers[h]*car*(1-(W.railShare||0))*0.38;
    }
  }
  /* legacy per-group gravity kept only for wards the microsim missed */
  /* ---- gravity distribution, per group, summed to car matrix (DISABLED) ---- */
  const LAMBDA={prof:7.6,inter:6.4,routine:5.2};
  const flowsUnused=wards.map(w=>clusters.map(()=>0));
  wards.forEach((w,wi)=>{if(1)return; // superseded by microsim OD
    for(const g of ["prof","inter","routine"]){
      const util=clusters.map(c=>{
        const d=dist(w.cx,w.cy,c.x,c.y)*world.cellKm;
        return (c.attr[g]||1)*Math.exp(-d/LAMBDA[g]);
      });
      const tot=util.reduce((a,b)=>a+b,0)||1;
      const gCar=w.groups[g]*w.carByGroup[g]*(1-w.railShare)*0.38;
      util.forEach((u,ci)=>{flowsUnused[wi][ci]+=gCar*u/tot;});
    }
    // bus flows load the same roads at low PCU equivalence
    const busPCU=w.pop*0.46*w.busWalkShare*0.35*0.38/18; // riders/18 per bus, 1 PCU each... folded below
    flows[wi]=flows[wi].map(f=>f*(1+0.0)); // car matrix; bus added as background below
    w._busPCU=busPCU;
  });

  /* ---- external zones: the world beyond the sheet edge ----
     Real English boroughs draw 20-35% of their workforce from
     outside, and strategic roads carry through traffic that has
     nothing to do with the town. Every classified road reaching
     the sheet edge becomes a gateway. */
  const externals=[];
  {
    const seen2=[];
    for(let k=0;k<N;k++){
      for(const [x,y] of [[k,0],[k,1],[k,2],[k,N-1],[k,N-2],[k,N-3],[0,k],[1,k],[2,k],[N-1,k],[N-2,k],[N-3,k]]){
        const i=idx(x,y);const rc=world.roadRaster[i];
        if(rc<ROADCLASS.B)continue;
        if(seen2.some(p=>dist(p[0],p[1],x,y)<14))continue;
        seen2.push([x,y]);
        const wgt=rc>=ROADCLASS.motorway?3.2:rc>=ROADCLASS.Adual?2.2:rc>=ROADCLASS.A?1.4:0.6;
        externals.push({x,y,node:nearestNode(x,y),wgt,cls:rc});
      }
    }
  }
  const totJobs=clusters.reduce((a,c)=>a+c.jobs,0);
  const extWTot=externals.reduce((a,e2)=>a+e2.wgt,0)||1;
  // in-commuting fills exactly the jobs residents do not take
  // (J - I from the conserved ledger); no gateway can deliver more
  // than ~80% of its own approach capacity
  const gateCap={6:4600,5:2600,4:1150,3:600};
  const inboundW=(world.labour?world.labour.inbound:totJobs*0.26);
  const extFlows=externals.map(ex=>{
    const want=inboundW*0.38*(ex.wgt/extWTot);
    const scale=Math.min(1,(gateCap[ex.cls]||500)*0.8/Math.max(1,want));
    return clusters.map(c=>want*scale*(c.jobs/totJobs));
  });
  const allTargets=new Set(clusterTargets);
  for(const ex of externals)allTargets.add(ex.node);

  // outbound commuters: each ward's off-sheet workers head for the
  // gateways, weighted by gateway class and proximity
  let outOD=null;
  const buildOutOD=()=>outOD=wards.map((w,wi)=>{
    const o=world._outByWard?world._outByWard[wi]:0;
    if(!o||!externals.length)return null;
    // every loading point now sits on the giant component, so all
    // gateways are mutually reachable by construction; no per-ward
    // search is needed
    const wts=externals.map(ex=>ex.wgt*Math.exp(-dist(w.cx,w.cy,ex.x,ex.y)*world.cellKm/14));
    const tot=wts.reduce((a,b)=>a+b,0);
    if(tot<=0)return null;
    return wts.map(v=>o*v/tot);
  });

  // through movements between gateway pairs (strategic background)
  const throughOD=[];
  for(let a=0;a<externals.length;a++)for(let b=0;b<externals.length;b++){
    if(a===b)continue;
    const A=externals[a],B2=externals[b];
    if(dist(A.x,A.y,B2.x,B2.y)<N*0.3)continue;
    const minC=Math.min(A.cls,B2.cls);
    const base=minC>=ROADCLASS.motorway?1400:minC>=ROADCLASS.Adual?380:minC>=ROADCLASS.A?150:50;
    throughOD.push({a:A.node,b:B2.node,f:base*0.5}); // both orderings appear
  }

  /* ---- assignment with BPR feedback ---- */
  const edgeTime=e=>{
    let t0=e.len/e.spec.v*60;
    // streets and lanes carry junction/parking friction: unattractive for
    // through movement, so overload cannot concentrate on them
    if(e.cls==="street")t0*=1.7;else if(e.cls==="lane")t0*=1.45;
    return t0*(1+0.15*Math.pow(e.vol/e.spec.cap,4));
  };
  let etCache=null;
  const refreshEdgeTimes=()=>{
    if(!etCache)etCache=new Float64Array(edges.length);
    for(let i=0;i<edges.length;i++)etCache[i]=edgeTime(edges[i]);
  };
  let _lastDist=null;
  /* flat-array Dijkstra: preallocated buffers with epoch stamping, a
     typed binary heap (no pair allocations), and a settled-target
     bitset so a target popped twice via near-duplicate heap entries
     cannot terminate the search early */
  let _dj=null;
  const shortestFrom=(src,targets)=>{
    const nN=nodes.length;
    if(!_dj||_dj.dist.length<nN){
      _dj={dist:new Float64Array(nN),prevE:new Int32Array(nN),stamp:new Int32Array(nN),
           settled:new Uint8Array(nN),hk:new Float64Array(nN*8),hv:new Int32Array(nN*8),epoch:0};
    }
    const D=_dj;D.epoch++;
    const dist=D.dist,prevE=D.prevE,stamp=D.stamp,hk=D.hk,hv=D.hv,ep=D.epoch;
    let settledTargets=null,isTgt=null;
    if(targets){
      settledTargets=D.settled;
      isTgt=D.isTgt||(D.isTgt=new Uint8Array(nN));
      if(D.isTgt.length<nN)isTgt=D.isTgt=new Uint8Array(nN);
      for(const t of targets){settledTargets[t]=0;isTgt[t]=1;}
    }
    let hn=0;
    let HK=hk,HV=hv;
    const push=(k,v)=>{
      if(hn>=HK.length){
        const nk=new Float64Array(HK.length*2),nv=new Int32Array(HK.length*2);
        nk.set(HK);nv.set(HV);HK=nk;HV=nv;D.hk=nk;D.hv=nv;
      }
      let i=hn++;HK[i]=k;HV[i]=v;
      while(i>0){const p2=(i-1)>>1;if(HK[p2]<=HK[i])break;
        const tk=HK[p2];HK[p2]=HK[i];HK[i]=tk;const tv=HV[p2];HV[p2]=HV[i];HV[i]=tv;i=p2;}
    };
    dist[src]=0;stamp[src]=ep;prevE[src]=-1;push(0,src);
    let remaining=targets?targets.size:-1;
    while(hn>0){
      const d=HK[0],n=HV[0];
      hn--;
      if(hn>0){HK[0]=HK[hn];HV[0]=HV[hn];
        let i=0;for(;;){const l=2*i+1,r=l+1;let m2=i;
          if(l<hn&&HK[l]<HK[m2])m2=l;if(r<hn&&HK[r]<HK[m2])m2=r;
          if(m2===i)break;
          const tk=HK[m2];HK[m2]=HK[i];HK[i]=tk;const tv=HV[m2];HV[m2]=HV[i];HV[i]=tv;i=m2;}
      }
      if(stamp[n]===ep&&d>dist[n]+1e-9)continue;
      if(isTgt&&isTgt[n]&&!settledTargets[n]){
        settledTargets[n]=1;
        if(--remaining<=0)break;
      }
      for(const eid of (adj[n]||[])){
        const e=edges[eid];const m=e.a===n?e.b:e.a;
        const nd=d+etCache[eid];
        if(stamp[m]!==ep||nd<dist[m]){dist[m]=nd;stamp[m]=ep;prevE[m]=eid;push(nd,m);}
      }
    }
    if(isTgt)for(const t of targets)isTgt[t]=0;
    // stale entries from earlier epochs must read as unreached
    for(let i2=0;i2<nN;i2++)if(stamp[i2]!==ep){prevE[i2]=-1;dist[i2]=Infinity;}
    _lastDist=dist;
    return prevE;
  };

  const loadPath=(prevE,src,dst,f)=>{
    let n=dst,guard=0;
    while(n!==src&&prevE[n]>=0&&guard++<20000){
      const e=edges[prevE[n]];e.newVol+=f;n=e.a===n?e.b:e.a;
    }
  };
  buildOutOD();
  /* Phase A: provisional 2-iteration loading to identify the corridors
     the C20 highway programme widened. Capacity change happens HERE,
     as history, never inside the equilibrium loop. */
  for(let iter=0;iter<2;iter++){
    refreshEdgeTimes();
    for(const e of edges)e.newVol=0;
    for(let wi=0;wi<wards.length;wi++){
      const W=wards[wi];
      for(let ai=0;ai<W.accessNodes.length;ai++){
        const src=W.accessNodes[ai], share=W.accessW[ai];
        const prevE=shortestFrom(src,allTargets);
        clusters.forEach((c,ci)=>{const f=flows[wi][ci]*share;if(f>=0.4)loadPath(prevE,src,c.node,f);});
        if(outOD[wi])externals.forEach((ex,xi)=>{const f=outOD[wi][xi]*share;if(f>=0.4)loadPath(prevE,src,ex.node,f);});
      }
    }
    const phi=1/(iter+1);
    for(const e of edges)e.vol=(1-phi)*e.vol+phi*e.newVol;
  }
  for(const e of edges){
    if(e.vol/e.spec.cap>1.35){
      if(e.cls==="minor"){e.cls="B";e.spec=ROAD_SPEC.B;}
      else if(e.cls==="B"){e.cls="A";e.spec=ROAD_SPEC.A;}
      else if(e.cls==="A"&&e.vol/e.spec.cap>1.8){e.cls="Adual";e.spec=ROAD_SPEC.Adual;}
    }
    e.vol=0;
  }

  /* Phase B: clean MSA equilibrium on FIXED capacities */
  const ITERS=22;                    // hard cap; converged networks stop far earlier
  let relGap=1,trueGap=null,lastIter=false;
  for(let iter=0;iter<ITERS;iter++){
    const isLast=lastIter||iter===ITERS-1;
    refreshEdgeTimes();
    for(const e of edges)e.newVol=0;
    for(let wi=0;wi<wards.length;wi++){
      const W=wards[wi];
      for(let ai=0;ai<W.accessNodes.length;ai++){
        const src=W.accessNodes[ai], share=W.accessW[ai];
        const prevE=shortestFrom(src,allTargets);
        clusters.forEach((c,ci)=>{
          const f=flows[wi][ci]*share;if(f<0.4)return;
          loadPath(prevE,src,c.node,f);
          if(isLast){ // record where this ward's workers actually go
            (W._dest||(W._dest=clusters.map(()=>0)))[ci]+=f;
          }
        });
        if(outOD[wi])externals.forEach((ex,xi)=>{
          const f=outOD[wi][xi]*share;if(f>=0.4)loadPath(prevE,src,ex.node,f);
        });
      }
    }
    // external in-commuting responds to congestion; strategic THROUGH
    // movements are assigned once on uncongested paths and then held
    // fixed (they have no local alternative worth modelling), which
    // also stabilises the equilibrium loop
    externals.forEach((ex,xi)=>{
      const prevE=shortestFrom(ex.node,clusterTargets);
      clusters.forEach((c,ci)=>{const f=extFlows[xi][ci];if(f>0.4)loadPath(prevE,ex.node,c.node,f);});
    });
    if(iter===0){
      for(const ex of externals){
        const extT=new Set();for(const od of throughOD)if(od.a===ex.node)extT.add(od.b);
        if(!extT.size)continue;
        const prevE=shortestFrom(ex.node,extT);
        for(const od of throughOD)if(od.a===ex.node){
          od.path=[];let n=od.b,g=0;
          while(n!==od.a&&prevE[n]>=0&&g++<20000){od.path.push(prevE[n]);const e=edges[prevE[n]];n=e.a===n?e.b:e.a;}
        }
      }
    }
    for(const od of throughOD)if(od.path)for(const eid of od.path)edges[eid].newVol+=od.f;
    const phi=1/(iter+1);                      // method of successive averages
    let num=0,den=0;
    for(const e of edges){
      const nv=(1-phi)*e.vol+phi*e.newVol;
      num+=Math.abs(nv-e.vol)*e.len;den+=nv*e.len;
      e.vol=nv;
    }
    relGap=den>0?num/den:0;   // movement of the averaged solution
    if(isLast)break;
    // stop once the averaged solution stops moving: quickly on easy
    // networks, later on congested ones, never past the hard cap
    if(relGap<0.03&&iter>=2)lastIter=true;
    else if(relGap<0.05&&iter>=7)lastIter=true;
    // plateau: when successive-averages movement has flatlined, more
    // 1/k iterations change nothing measurable; stop and report
    else if(iter>=12&&Math.abs((world._rg3||1)-relGap)<0.004)lastIter=true;
    if(iter%3===0)world._rg3=relGap;
  }
  world.externals=externals;



  /* ---- honesty diagnostics ---- */
  {
    const diag=world.diagnostics=world.diagnostics||{};
    diag.labour=world.labour;
    const byCls={};let overloadedLocal=0,maxVC=0;
    for(const e of edges){
      e.vc=e.vol/e.spec.cap;
      if(e.vc>maxVC)maxVC=e.vc;
      const b=byCls[e.cls]=byCls[e.cls]||{n:0,zero:0,vkm:0};
      b.n++;if(e.vol<1)b.zero++;b.vkm+=e.vol*e.len;
      if((e.cls==="street"||e.cls==="lane")&&e.vc>2)overloadedLocal++;
    }
    diag.traffic={
      relGap:+relGap.toFixed(3),wardropGap:trueGap!=null?+trueGap.toFixed(3):null,
      converged:relGap<0.08,                   // movement, judged above the 1/k step floor
      equilibriumGap:trueGap!=null?+trueGap.toFixed(3):null,
      maxVC:+maxVC.toFixed(2),
      overloadedLocalLinks:overloadedLocal,
      units:"vehicles/hour (PCU), AM peak",
      byClass:Object.fromEntries(Object.entries(byCls).map(([k,v])=>[k,{links:v.n,zeroFlowShare:+(v.zero/v.n).toFixed(2),vehKm:Math.round(v.vkm)}])),
    };
    world.trafficWarnings=world.trafficWarnings||[];
  // Wardrop relative gap under FINAL congested costs:
  //   RG = (sum_a v_a t_a - sum_od q_od c*_od) / sum_a v_a t_a
  {
    refreshEdgeTimes();
    let vt=0;for(const e of edges)vt+=e.vol*etCache[edges.indexOf(e)];
    vt=0;for(let ei=0;ei<edges.length;ei++)vt+=edges[ei].vol*etCache[ei];
    let qc=0,unreach=0;
    for(let wi=0;wi<wards.length;wi++){
      const W=wards[wi];
      for(let ai=0;ai<W.accessNodes.length;ai++){
        const src=W.accessNodes[ai],share=W.accessW[ai];
        shortestFrom(src,allTargets);
        clusters.forEach((c,ci)=>{const f=flows[wi][ci]*share;if(f<0.4)return;
          const d2=_lastDist[c.node];
          if(isFinite(d2))qc+=f*d2;else unreach+=f;});
        // outbound commuters are ON the network (in the numerator), so
        // their trips belong in the benchmark too; omitting them
        // overstated the gap several-fold
        if(outOD[wi])externals.forEach((ex,xi)=>{const f=outOD[wi][xi]*share;if(f<0.4)return;
          const d2=_lastDist[ex.node];
          if(isFinite(d2))qc+=f*d2;else unreach+=f;});
      }
    }
    externals.forEach((ex,xi)=>{
      shortestFrom(ex.node,clusterTargets);
      clusters.forEach((c,ci)=>{const f=extFlows[xi][ci];if(f<=0.4)return;
        const d2=_lastDist[c.node];
        if(isFinite(d2))qc+=f*d2;else unreach+=f;});
    });
    for(const od of throughOD)if(od.path){let t2=0;for(const eid of od.path)t2+=etCache[eid];qc+=od.f*t2;}
    trueGap=(vt>0&&isFinite(vt)&&isFinite(qc))?Math.max(0,(vt-qc)/vt):null;
    if(world.diagnostics&&world.diagnostics.traffic){
      const dt2=world.diagnostics.traffic;
      dt2.wardropGap=trueGap!=null?+trueGap.toFixed(3):null;
      dt2.unreachableDemand=Math.round(unreach);
      dt2.equilibriumGap=trueGap!=null?+trueGap.toFixed(3):null;
      /* movement cannot fall below the MSA step size (1/22 = 0.045)
         on congested links, so the movement term sits above that
         floor; the equilibrium gap and demand conservation are the
         strict criteria */
      dt2.converged=relGap<0.08&&unreach<1&&(trueGap==null||trueGap<0.10);
      if(unreach>=1)world.trafficWarnings=(world.trafficWarnings||[]).concat(
        ["~"+Math.round(unreach)+" veh/h between disconnected origin-destination pairs; excluded from the gap, flagged not converged."]);
    }
  }
    if(!diag.traffic.converged)world.trafficWarnings.push("Assignment not converged (Wardrop gap "+((trueGap??relGap)*100).toFixed(1)+"%); flows are approximate.");
    if(maxVC>2)world.trafficWarnings.push("At least one link exceeds v/c 2.0; read as unmet queueing demand, not a throughput observation.");
    if(overloadedLocal>0)world.trafficWarnings.push(overloadedLocal+" local street/lane links over v/c 2.0 - a known connector-loading artefact of district access points.");
  }

  /* name the destination clusters and store each ward's top commute targets */
  for(const c of clusters){
    const wi2=world.wardOf[idx(Math.round(c.x),Math.round(c.y))];
    if(dist(c.x,c.y,world.main.x,world.main.y)<1.1/world.cellKm)c.name=world.main.name+" centre";
    else if(wi2>=0)c.name=wards[wi2].name;
    else c.name="out-county";
  }
  for(const W of wards){
    if(!W._dest){W.commuteTop=[];continue;}
    const tot=W._dest.reduce((a,b)=>a+b,0)||1;
    W.commuteTop=W._dest.map((f,ci)=>({name:clusters[ci].name,share:f/tot}))
      .sort((a,b)=>b.share-a.share).filter(d=>d.share>0.06).slice(0,3);
    delete W._dest;
  }
  for(const e of edges){e.vc=e.vol/e.spec.cap;}

  /* ---- traffic raster (for pollution/noise & lens) ---- */
  const traffic=world.trafficRaster=new Float32Array(N*N);
  for(const e of edges){
    const a=nodes[e.a],b=nodes[e.b];
    const ax=a%N,ay=(a/N)|0,bx=b%N,by=(b/N)|0;
    const steps=Math.max(1,Math.round(dist(ax,ay,bx,by)));
    for(let s=0;s<=steps;s++){
      const x=Math.round(lerp(ax,bx,s/steps)),y=Math.round(lerp(ay,by,s/steps));
      const i=idx(x,y);traffic[i]=Math.max(traffic[i],e.vol);
    }
  }

  /* ---- congestion hotspots ---- */
  world.hotspots=edges.filter(e=>e.vc>0.85).sort((a,b)=>b.vc-a.vc).slice(0,8).map(e=>{
    const n=nodes[e.a];return {x:n%N,y:(n/N)|0,vc:e.vc,cls:e.cls};
  });

  /* ---- rail loading ---- */
  const seatSupply=1600; // 3-car x ~4 tph
  for(const line of world.rail){
    if(line.disused||line.mineral){line.load=0;continue;}
    let boardings=0;
    const stOn=[];
    for(const st of openStations){
      // station on this line?
      let on=false,at=0;
      for(let k2=0;k2<line.pts.length;k2++){const p=line.pts[k2];if(dist(p[0],p[1],st.x,st.y)<2){on=true;at=k2;break;}}
      if(on)stOn.push({st,at});
      if(!on||st.main)continue;
      // catchment population
      let cat=0;
      for(const w of world.wards){const d=dist(w.cx,w.cy,st.x,st.y)*world.cellKm;cat+=w.pop*Math.exp(-d/2.2)*w.railShare;}
      boardings+=cat*0.38;
      st.boardings=Math.round(cat*0.38);
    }
    line.load=boardings;line.loadFactor=boardings/seatSupply;
    // per-segment loads toward the main terminal: the honest crowding
    // figure is the maximum-load segment
    stOn.sort((a2,b2)=>a2.at-b2.at);
    const mainAt=stOn.find(o2=>o2.st.main);
    if(stOn.length>=2){
      line.segments=[];
      const toEnd=mainAt&&mainAt.at>line.pts.length/2;
      const ordered=toEnd?stOn:stOn.slice().reverse();
      let cum=0;
      for(let k2=0;k2<ordered.length-1;k2++){
        cum+=ordered[k2].st.main?0:(ordered[k2].st.boardings||0);
        line.segments.push({a:ordered[k2].at,b:ordered[k2+1].at,load:cum,lf:cum/seatSupply});
      }
      line.maxSegLF=Math.max(...line.segments.map(g2=>g2.lf),line.loadFactor*0.4);
    }else line.maxSegLF=line.loadFactor;
  }
  // the main line also carries through & intercity flows plus branch interchange
  const mainLine=world.rail.find(l=>l.name==="Main line");
  if(mainLine&&!mainLine.disused){
    const branchFeed=world.rail.filter(l=>!l.disused&&!l.mineral&&l!==mainLine).reduce((a,l)=>a+(l.load||0),0);
    const base={large:0.62,medium:0.45,small:0.3}[world.sizeClass];
    mainLine.loadFactor=base+branchFeed*0.5/seatSupply+(mainLine.load||0)/seatSupply;
    mainLine.load=Math.round(mainLine.loadFactor*seatSupply);
  }
  world.trafficDone=true;
}
