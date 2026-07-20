"use strict";
/* ============================================================
   WARDS & DEMOGRAPHICS
   Urban wards target ~6-7k residents (English electoral ward
   scale); rural parishes form around villages. Ward-level
   social structure is derived from the housing stock the growth
   model actually built there, which is how real English
   micro-geography works:
   - ethnic minority communities concentrate in inner Victorian
     terraces near former industry (South Asian communities in
     Pennine textile towns; Indian communities in East/West
     Midlands manufacturing towns), in centre flats and student
     belts; outer estates, villas and villages run whiter than
     the borough average;
   - age: student HMO belts spike 16-24; coastal and deep-rural
     wards skew 65+; new-build estates skew young-family;
   - tenure follows era (post-war estates -> social rent,
     terraces & flats -> private rent);
   - deprivation, unemployment, car ownership, degree share and
     life expectancy co-vary with the stock, with the real
     English LE gradient (~9 years across IMD deciles).
   ============================================================ */

const AFFLUENCE={[LU.medieval]:0.58,[LU.georgian]:0.80,[LU.victTerrace]:0.33,[LU.victVilla]:0.84,[LU.interwar]:0.58,
  [LU.postwarEstate]:0.22,[LU.late20]:0.66,[LU.modernEstate]:0.62,[LU.modernFlats]:0.55};

function buildWards(world){
  const {N,rng,region,regionKey}=world;
  const idx=(x,y)=>y*N+x;
  const {cellPop,settleOf,landUse,sea}=world;
  const S=world.settlements, main=world.main;
  const cellKmSq=world.cellKm*world.cellKm;

  /* ----- seeds ----- */
  const urbanIds=new Set([main.id,...S.filter(s=>s.absorbed).map(s=>s.id)]);
  let urbanPop=0;const urbanCells=[];
  for(let i=0;i<N*N;i++){
    if(settleOf[i]>=0&&urbanIds.has(settleOf[i])&&cellPop[i]>0){urbanPop+=cellPop[i];urbanCells.push(i);}
  }
  const kUrban=Math.max(4,Math.round(urbanPop/5200));
  // weighted k-means
  let seeds=[];
  {
    const pool=urbanCells.slice();rng.shuffle(pool);
    seeds=pool.slice(0,kUrban).map(i=>({x:i%N,y:(i/N)|0}));
    for(let it=0;it<8;it++){
      const sums=seeds.map(()=>({x:0,y:0,w:0}));
      for(const i of urbanCells){
        const x=i%N,y=(i/N)|0;let b=0,bd=1e9;
        for(let k=0;k<seeds.length;k++){const d=dist(x,y,seeds[k].x,seeds[k].y);if(d<bd){bd=d;b=k;}}
        const w=cellPop[i];sums[b].x+=x*w;sums[b].y+=y*w;sums[b].w+=w;
      }
      seeds=seeds.map((s,k)=>sums[k].w>0?{x:sums[k].x/sums[k].w,y:sums[k].y/sums[k].w}:s);
    }
  }
  const wards=[];
  for(const s of seeds)wards.push({x:s.x,y:s.y,urban:true,cells:[],settle:main.id});
  for(const s of S){
    if(urbanIds.has(s.id))continue;
    if((s.target||s.pop||0)>8000){
      // a substantial town is URBAN and gets multiple wards of its own
      const nW=Math.max(2,Math.round((s.target||s.pop)/5200));
      for(let k2=0;k2<nW;k2++){
        const a2=k2/nW*6.283,r2=1.2+ (k2%2)*1.4;
        wards.push({x:s.x+Math.cos(a2)*r2,y:s.y+Math.sin(a2)*r2,urban:true,cells:[],settle:s.id,base:s});
      }
    } else
    wards.push({x:s.x,y:s.y,urban:false,cells:[],settle:s.id,base:s});
  }

  /* ----- assign by barrier-weighted geodesic distance -----
     Ward boundaries in England follow rivers, railway lines and
     main roads; we reproduce that by making those features
     expensive to cross in a multi-source Dijkstra, so the
     equidistance frontier between seeds snaps onto them. */
  const wardOf=world.wardOf=new Int16Array(N*N).fill(-1);
  {
    const {river,railRaster,roadRaster}=world;
    const crossCost=i=>{
      let c=1;
      if(river[i]>=1)c+=6+river[i]*4;
      if(railRaster[i])c+=5;
      if(roadRaster[i]>=ROADCLASS.A)c+=2.5;
      return c;
    };
    const D=new Float64Array(N*N).fill(Infinity);
    const heap=new MinHeap();
    for(let k=0;k<wards.length;k++){
      const i=idx(Math.round(wards[k].x),Math.round(wards[k].y));
      const bias=wards[k].urban?0:-2.5;      // parishes reach a little further
      if(D[i]>bias){D[i]=bias;wardOf[i]=k;heap.push(bias,i);}
    }
    while(heap.size){
      const[du,i]=heap.pop();
      if(du>D[i])continue;
      const x=i%N,y=(i/N)|0;const k=wardOf[i];
      const urbanCell=settleOf[i]>=0&&urbanIds.has(settleOf[i]);
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        const j=idx(X,Y);if(sea[j])continue;
        const tgtUrban=settleOf[j]>=0&&urbanIds.has(settleOf[j]);
        if(tgtUrban&&!wards[k].urban)continue;       // parishes never take town cells
        if(!tgtUrban&&wards[k].urban&&cellPop[j]===0){
          // urban wards only reach a short apron into open country
          if(du>10)continue;
        }
        const step=((dx&&dy)?1.414:1)*0.5*(crossCost(i)+crossCost(j));
        const nd=du+step;
        if(nd<D[j]){D[j]=nd;wardOf[j]=k;heap.push(nd,j);}
      }
    }
    // sweep any orphan land cells to nearest assigned neighbour
    for(let pass=0;pass<6;pass++){
      let fixed=0;
      for(let y=0;y<N;y++)for(let x=0;x<N;x++){
        const i=idx(x,y);if(sea[i]||wardOf[i]>=0)continue;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          const j=idx(X,Y);if(wardOf[j]>=0){wardOf[i]=wardOf[j];fixed++;break;}
        }
      }
      if(!fixed)break;
    }
    for(let i=0;i<N*N;i++)if(wardOf[i]>=0)wards[wardOf[i]].cells.push(i);

    /* ---- hard invariants: contiguity, no empty zones, coverage ---- */
    const diag=world.diagnostics=world.diagnostics||{};
    diag.zones={fragmentsRepaired:0,emptyMerged:0,uncovered:0};
    const runContiguity=()=>{
    // contiguity: keep each district's largest component; reassign the rest
    for(let k=0;k<wards.length;k++){
      const mine=new Set(wards[k].cells);
      const seen2=new Set();const comps=[];
      for(const c0 of wards[k].cells){
        if(seen2.has(c0))continue;
        const q=[c0];seen2.add(c0);const comp=[c0];
        while(q.length){const c=q.pop();const x=c%N,y=(c/N)|0;
          for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
            const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
            const j=idx(X,Y);
            if(mine.has(j)&&!seen2.has(j)){seen2.add(j);q.push(j);comp.push(j);}
          }}
        comps.push(comp);
      }
      if(comps.length>1){
        comps.sort((a,b)=>b.length-a.length);
        for(const frag of comps.slice(1)){
          diag.zones.fragmentsRepaired++;
          for(const c of frag){
            // join the adjacent district with most shared edge
            const x=c%N,y=(c/N)|0;const cnt=new Map();
            for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
              const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
              const wj=wardOf[idx(X,Y)];
              if(wj>=0&&wj!==k)cnt.set(wj,(cnt.get(wj)||0)+1);
            }
            // prefer the most-shared neighbour that has ROOM; breach
            // the size bound only when every neighbour is already full
            let best=-1,bn=0,any=-1,an=0;
            for(const[wj,n]of cnt){
              if(n>an){an=n;any=wj;}
              const capJ=Math.round(N*N/(wards[wj].urban?24:18));
              if(wards[wj].cells.length<capJ&&n>bn){bn=n;best=wj;}
            }
            if(best<0)best=any;
            if(best>=0){wardOf[c]=best;}
          }
        }
        wards[k].cells=comps[0];
        for(const frag of comps.slice(1)){
          /* a ward-scale fragment whose neighbours are all at their
             size caps must not be forced into one of them: it IS a
             ward. Promoting it here ends the inflate-then-split
             cycle at the pipeline's tail. */
          if(frag.length>=120){
            /* the whole fragment moves together: per-cell scattering
               fills the one roomy neighbour, then breaches the rest
               into whoever is left, inflating it past the cap */
            const shared={};
            for(const c of frag){
              const x=c%N,y=(c/N)|0;
              for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
                const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
                const o=wardOf[Y*N+X];
                if(o>=0&&o!==k)shared[o]=(shared[o]||0)+1;
              }
            }
            let best2=-1,bn2=0;
            for(const o in shared){
              const O=+o;
              if(wards[O].cells.length+frag.length>Math.round(N*N/(wards[O].urban?24:18)))continue;
              if(shared[o]>bn2){bn2=shared[o];best2=O;}
            }
            if(best2>=0){
              for(const c of frag){wardOf[c]=best2;wards[best2].cells.push(c);}
            }else{
              const nw2={x:frag[0]%N,y:(frag[0]/N)|0,urban:wards[k].urban,cells:frag.slice(),settle:wards[k].settle,base:wards[k].base};
              const nk=wards.length;wards.push(nw2);
              for(const c of frag)wardOf[c]=nk;
            }
            continue;
          }
          for(const c of frag)if(wardOf[c]>=0)wards[wardOf[c]].cells.push(c);
        }
      }
    }

    };
    runContiguity();
    for(let i=0;i<N*N;i++)if(!sea[i]&&wardOf[i]<0)diag.zones.uncovered++;

    /* population balance: merge under-target urban districts; record
       machine-readable exceptions for the rest */
    const popOf=w2=>{let p2=0;for(const i of w2.cells)p2+=cellPop[i];return p2;};
    const T=5200;let merged=0;
    for(let pass=0;pass<4;pass++){
      for(let k=0;k<wards.length;k++){
        const w2=wards[k];
        if(!w2.cells.length||!w2.urban)continue;
        if(popOf(w2)>=T*0.6)continue;
        const shared=new Map();
        for(const i of w2.cells){const x=i%N,y=(i/N)|0;
          for(const d of[1,-1,N,-N]){
            const j=i+d;if(j<0||j>=N*N)continue;
            const o=wardOf[j];if(o>=0&&o!==k)shared.set(o,(shared.get(o)||0)+(wards[o].urban?1.5:1));
          }}
        let best=-1,bs=0;for(const[o,n2]of shared)if(n2>bs){bs=n2;best=o;}
        if(best<0)continue;
        for(const i of w2.cells){wardOf[i]=best;wards[best].cells.push(i);}
        w2.cells=[];merged++;
      }
    }
    const alive=wards.filter(w2=>w2.cells.length&&w2.urban).map(w2=>popOf(w2));


    diag.zones.merged=merged;
  {
    const runSplitter=()=>{
      let totalSplits=0;
    /* split any ward over ~10.5k residents: sort its cells along the
       longer bounding-box axis and cut at the population median */
    for(let pass4=0;pass4<4;pass4++){
      let split=0;
      const nW0=wards.length;
      for(let wi2=0;wi2<nW0;wi2++){
        const w2=wards[wi2];
        if(!w2.cells.length)continue;
        let pT=0;for(const i of w2.cells)pT+=world.cellPop[i]||0;
        const capCells=Math.round(N*N/28);
        // near-empty upland is one big parish, as on Dartmoor; the
        // size cap binds only where there are people to serve
        const wantSplit=pT>=10500||(w2.cells.length>=capCells&&pT>=100);   // 100 vs the 140 exemption: hysteresis, no boundary flapping
        if(!wantSplit)continue;
        let x0=1e9,x1=-1,y0=1e9,y1=-1;
        for(const i of w2.cells){const x=i%N,y=(i/N)|0;
          x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
        const horiz=(x1-x0)>=(y1-y0);
        const cs=w2.cells.slice().sort((a2,b2)=>horiz?(a2%N)-(b2%N):((a2/N)|0)-((b2/N)|0));
        let acc=0,cut=cs.length>>1;
        if(pT>=200){
          for(let k2=0;k2<cs.length;k2++){acc+=world.cellPop[cs[k2]]||0;if(acc>=pT/2){cut=Math.max(2,Math.min(cs.length-2,k2));break;}}
        } // near-empty land splits at the AREA median, not a degenerate population cut
        // and any cut is clamped into the middle half of the run, so a
        // lone village cannot pin the boundary and leave the area whole
        cut=Math.max(Math.floor(cs.length*0.3),Math.min(Math.floor(cs.length*0.7),cut));
        const moved=cs.slice(cut);
        const nw={x:w2.x,y:w2.y,urban:w2.urban,cells:moved,settle:w2.settle,base:w2.base};
        w2.cells=cs.slice(0,cut);
        const nk=wards.length;wards.push(nw);
        for(const i of moved)wardOf[i]=nk;
        split++;totalSplits++;
      }
      if(!split)break;
    }
      return totalSplits;
    };
    runSplitter();
    const runEmptyMerge=(relax)=>{
    // small parishes group: fold rural districts under ~350 residents into its
    // most-populated neighbour, as real parish groupings do
    let emptyMerged=0;
    const tallyPop=k2=>{let p3=0;for(const i of wards[k2].cells)p3+=world.cellPop[i]||0;return p3;};
    for(let pass3=0;pass3<3;pass3++){
      let did=false;
      for(let wi2=0;wi2<wards.length;wi2++){
        const w2=wards[wi2];
        if(!w2.cells.length)continue;
        if(tallyPop(wi2)>=(wards[wi2].urban?50:350))continue;
        const nb={};
        for(const i of w2.cells){
          for(const j2 of [i-1,i+1,i-N,i+N]){
            if(j2<0||j2>=N*N)continue;
            const k2=wardOf[j2];
            if(k2>=0&&wards[k2]!==w2&&wards[k2].cells.length)nb[k2]=(nb[k2]||0)+1;
          }
        }
        // parishes fold into PARISHES (lowest-population neighbour),
        // never into an urban ward, unless no rural neighbour exists
        let best=-1,bp=1e18,anyRural=false;
        /* the merge bound IS the district size bound, per type;
           the old 1.3x "relaxed" headroom legally built over-cap
           urban wards after the last splitter had run */
        const capC2=k2=>Math.round(N*N/(wards[k2].urban?24:18));
        // prefer the CLOSE small neighbour: distance keeps merged
        // parishes compact instead of chaining into snakes
        let cx0=0,cy0=0;for(const i of w2.cells){cx0+=i%N;cy0+=(i/N)|0;}
        cx0/=w2.cells.length;cy0/=w2.cells.length;
        const score=k2=>{
          if(wards[k2].cells.length+w2.cells.length>capC2(k2))return 1e17;
          let cx1=0,cy1=0;const C=wards[k2].cells;
          for(let t2=0;t2<C.length;t2+=Math.max(1,C.length>>5))
            {cx1+=C[t2]%N;cy1+=(C[t2]/N)|0;}
          const n2=Math.ceil(C.length/Math.max(1,C.length>>5));
          return tallyPop(+k2)+wards[k2].cells.length*4+dist(cx0,cy0,cx1/n2,cy1/n2)*40;
        };
        for(const k2 in nb)if(!wards[k2].urban){anyRural=true;
          const p3=score(k2);if(p3<bp&&p3<1e16){bp=p3;best=+k2;}}
        if(!anyRural)for(const k2 in nb){const p3=score(k2);if(p3<bp&&p3<1e16){bp=p3;best=+k2;}}
        // a sliver with no under-cap home still merges: smallest neighbour takes it
        if(best<0){let bc=1e18;for(const k2 in nb){const c3=wards[k2].cells.length;if(c3<bc&&c3+w2.cells.length<=capC2(k2)){bc=c3;best=+k2;}}}   // the fallback honours the type cap too
        if(best>=0){
          for(const i of w2.cells){wardOf[i]=best;wards[best].cells.push(i);}
          if(world._wardPopTally)world._wardPopTally[best]+=tallyPop(wi2);
          w2.cells=[];emptyMerged++;did=true;
        }
      }
      if(!did)break;
    }
    diag.zones.emptyMerged=emptyMerged;
    };
    runEmptyMerge();
    runSplitter();   // merges can recompose oversized wards; split again
    runEmptyMerge(); // and re-splitting sparse land can leave slivers; fold them, area-capped
    runEmptyMerge(true); // anything still stuck merges with a relaxed area cap
    // axis cuts of concave wards can disconnect, and repairing the
    // fragments can re-inflate a ward; iterate both to a fixpoint
    for(let fx=0;fx<3;fx++){
      const did=runSplitter();
      const f0=diag.zones.fragmentsRepaired;
      runContiguity();
      if(!did&&diag.zones.fragmentsRepaired===f0)break;
    }
    runEmptyMerge(true);   // splits and repairs can strand small districts last
    /* boundary smoothing: a cell three-quarters surrounded by another
       district belongs to it; two sweeps shave the staircase tendrils
       that merging and axis-cutting leave behind */
    for(let sw=0;sw<2;sw++){
      for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
        const i=y*N+x,me=wardOf[i];
        if(me<0||wards[me].cells.length<60)continue;
        const cnt={};let tot2=0;
        for(const j of [i-1,i+1,i-N,i+N]){
          const o=wardOf[j];if(o<0)continue;tot2++;
          if(o!==me)cnt[o]=(cnt[o]||0)+1;
        }
        for(const k2 in cnt)if(cnt[k2]>=3&&tot2===4){
          const K=+k2;
          const capK=Math.round(N*N/(wards[K].urban?24:18));
          if(wards[K].cells.length>=capK)break;   // absorption respects the size bound
          wards[me].cells.splice(wards[me].cells.indexOf(i),1);
          wards[K].cells.push(i);wardOf[i]=K;
          break;
        }
      }
    }
    runContiguity();
    runEmptyMerge(true);   // smoothing can strand a nibbled remnant
    runContiguity();
    // contiguity repairs are uncapped by design (coverage first), so
    // one last split-and-heal restores the size bound they can break
    runSplitter();
    runContiguity();
    runEmptyMerge(true);
    runContiguity();
    /* terminal closer: absorb degenerate remnants whole (a few cells,
       nobody home). Whole-ward absorption cannot break contiguity or
       meaningfully breach a size bound, so nothing needs to run after
       it and the ordering war ends here. */
    for(const [wi2,w2] of wards.entries()){
      if(!w2.cells.length)continue;
      let pT=0;for(const i of w2.cells)pT+=world.cellPop[i]||0;
      if(w2.cells.length>8&&pT>=30)continue;
      const cnt={};
      for(const i of w2.cells){const x=i%N,y=(i/N)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          const o=wardOf[Y*N+X];if(o>=0&&o!==wi2)cnt[o]=(cnt[o]||0)+1;}}
      let best=-1,bn=0;for(const k2 in cnt)if(cnt[k2]>bn){bn=cnt[k2];best=+k2;}
      if(best<0){
        // an isolated uninhabited rock: unparished foreshore, not a district
        if(pT<30){for(const i of w2.cells)wardOf[i]=-1;w2.cells=[];}
        continue;
      }
      for(const i of w2.cells){wardOf[i]=best;wards[best].cells.push(i);}
      w2.cells=[];
    }
    // contiguity repairs are uncapped by design (coverage first), so
    // one last split-and-heal restores the size bound they can break
    runSplitter();
    runContiguity();
    runEmptyMerge(true);
    runContiguity();
    /* terminal closer: absorb degenerate remnants whole (a few cells,
       nobody home). Whole-ward absorption cannot break contiguity or
       meaningfully breach a size bound, so nothing needs to run after
       it and the ordering war ends here. */
    for(const [wi2,w2] of wards.entries()){
      if(!w2.cells.length)continue;
      let pT=0;for(const i of w2.cells)pT+=world.cellPop[i]||0;
      if(w2.cells.length>8&&pT>=30)continue;
      const cnt={};
      for(const i of w2.cells){const x=i%N,y=(i/N)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          const o=wardOf[Y*N+X];if(o>=0&&o!==wi2)cnt[o]=(cnt[o]||0)+1;}}
      let best=-1,bn=0;for(const k2 in cnt)if(cnt[k2]>bn){bn=cnt[k2];best=+k2;}
      if(best<0){
        // an isolated uninhabited rock: unparished foreshore, not a district
        if(pT<30){for(const i of w2.cells)wardOf[i]=-1;w2.cells=[];}
        continue;
      }
      for(const i of w2.cells){wardOf[i]=best;wards[best].cells.push(i);}
      w2.cells=[];
    }
  }


    diag.zones.target=T;
    // recorded now, then recomputed from FINAL wards after all passes
    diag.zones.zeroPopulation=alive.filter(p2=>p2<1).length;
    diag.zones.urbanInBand80to120=alive.length?+(alive.filter(p2=>p2>=T*0.8&&p2<=T*1.2).length/alive.length).toFixed(2):1;
    diag.zones.urbanRange=[Math.round(Math.min(...alive)),Math.round(Math.max(...alive))];
    diag.zones.note="synthetic ward-like analytical districts, not Boundary Commission wards";
  }

  /* ----- naming ----- */
  const nm=world.names;
  const usedW=new Set();
  /* one pass over the microsimulated households -> per-ward tallies */
  {
    const P=world.pops;
    world._wardPopTally=wards.map(()=>({n:0,seg:[0,0,0],stu:0,aged:0}));
    for(let h=0;h<P.n;h++){
      const wk=world.wardOf[P.home[h]];
      if(wk<0)continue;
      const t=world._wardPopTally[wk];
      t.n++;t.seg[P.seg[h]]++;
      if(P.student[h])t.stu++;
      if(P.aged[h])t.aged++;
    }
    for(const t of world._wardPopTally){if(t.n>0)t.seg=t.seg.map(v=>v);}
  }
  for(let k=0;k<wards.length;k++){
    const w=wards[k];
    let name=null;
    if(!w.urban){name=w.base.name;}
    else{
      // absorbed settlement centre inside?
      for(const s of S){if(s.absorbed&&wardOf[idx(s.x,s.y)]===k){name=s.name;break;}}
      if(!name){for(const lm of world.landmarks){
        if(wardOf[idx(lm.x,lm.y)]!==k)continue;
        if(lm.type==="castle"){name="Castle";break;}
        if(lm.type==="abbey"){name="Abbey";break;}
        if(lm.type==="cathedral"){name="Minster";break;}
      }}
      if(!name&&dist(w.x,w.y,main.x,main.y)<1.2/world.cellKm)name=main.name+" Central";
      if(!name)name=nm.wardName(null);
      while(usedW.has(name))name=nm.wardName(null);
    }
    usedW.add(name);w.name=name;
  }

  /* flood risk raster: HAND-style floodplains. Fluvial risk follows
     HEIGHT ABOVE THE NEAREST CHANNEL, spread outward from every
     channel cell by BFS, so a broad flat valley floor floods wall to
     wall (EA Zone 2/3 style ribbons) instead of spot patches at the
     four cells nearest a big river. Coastal risk likewise spreads
     over all contiguous ground under ~5.5 m, the tidal floodplain. */
  {
    const fr=world.floodRisk=new Float32Array(N*N);
    const REACH={1:4,2:8,3:13};                 // cells, grows with channel size
    const CLSF={1:0.55,2:0.85,3:1.0};
    const srcE=new Float32Array(N*N).fill(1e9); // channel elev this cell answers to
    const step=new Int16Array(N*N).fill(9999);
    const q=[];
    for(let i=0;i<N*N;i++)if(world.river[i]>=1&&!world.sea[i]){
      // the terrain pass INCISES channels 5-12 m below their banks;
      // flood HAND references the WATER level, so restore it, or the
      // floodplain sits above its own river and never floods
      srcE[i]=world.elev[i]+(2+3.5*world.river[i])*0.8;
      step[i]=0;q.push([i,world.river[i]]);
    }
    for(let h=0;h<q.length;h++){
      const [i,cls]=q[h];
      const x=i%N,y=(i/N)|0;
      if(step[i]>=REACH[cls])continue;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        const j=Y*N+X;if(world.sea[j])continue;
        const hand=world.elev[j]-srcE[i];
        if(hand>6)continue;                     // above the flood surface
        if(step[j]<=step[i]+1)continue;
        srcE[j]=srcE[i];step[j]=step[i]+1;
        const risk=Math.max(0,1-Math.max(0,hand)/5.5)*CLSF[cls]*(1-step[j]/(REACH[cls]+2)*0.35);
        if(risk>fr[j])fr[j]=risk;
        q.push([j,cls]);
      }
    }
    // fen carr is wet by definition
    for(let i=0;i<N*N;i++)if(world.cover[i]===5&&!world.sea[i])fr[i]=Math.max(fr[i],0.8);
    // coastal: every contiguous cell under the tidal surface
    const q2=[];const seen2=new Uint8Array(N*N);
    for(let i=0;i<N*N;i++)if(world.sea[i])q2.push(i);
    for(let h=0;h<q2.length;h++){
      const i=q2[h];const x=i%N,y=(i/N)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        const j=Y*N+X;
        if(seen2[j]||world.sea[j]||world.elev[j]>=5.5)continue;
        seen2[j]=1;fr[j]=Math.max(fr[j],0.92-world.elev[j]*0.12);q2.push(j);
      }
    }
  }

  /* ----- per-ward statistics ----- */
  const ind=region.industry;
  const isMill = region.demo.millTown && (ind.textile==="wool"||ind.textile==="cotton");
  const sizeClassKey = world.sizeClass==="large"?"city":"town";
  const uniCells=[];
  for(let i=0;i<N*N;i++)if(landUse[i]===LU.uniOld||landUse[i]===LU.uniNew)uniCells.push(i);

  for(let k=0;k<wards.length;k++){
    const w=wards[k];
    let pop=0,area=0,jobs=0;
    const mix={};let resCells=0;
    let cx=0,cy=0,wsum=0;
    for(const i of w.cells){
      pop+=cellPop[i];jobs+=world.jobs[i];area+=cellKmSq;
      const lu=landUse[i];
      if(LU_META[lu]&&LU_META[lu].res){mix[lu]=(mix[lu]||0)+1;resCells++;}
      const x=i%N,y=(i/N)|0;const ww=cellPop[i]+1;cx+=x*ww;cy+=y*ww;wsum+=ww;
    }
    w.pop=Math.round(pop);w.areaKm2=area;w.jobs=Math.round(jobs);
    /* the urban flag is seeded before geometry settles; a ward that
       ends up as near-empty moor is rural whatever seed it inherited.
       Demote on the evidence (ONS-style density), never promote. */
    if(w.urban&&w.areaKm2>0&&(w.pop/w.areaKm2<60||w.pop<300))w.urban=false;
    w.cx=cx/Math.max(1,wsum);w.cy=cy/Math.max(1,wsum);
    w.mix=mix;w.resCells=resCells;
    // affluence from stock
    let aff=0;
    if(resCells>0){for(const[lu,n]of Object.entries(mix))aff+=(AFFLUENCE[lu]??0.5)*n/resCells;}
    else aff=0.55;
    const base=w.base;
    if(base){
      if(base.kind==="village")aff=clamp(aff+({"south-east":0.18,"east":0.14,"south-west":0.10,"east-midlands":0.06,"west-midlands":0.06,"yorkshire":0.03,"north-west":0.02,"north-east":0.0}[regionKey]),0,1);
      if(base.kind==="pit-village")aff=Math.min(aff,0.28);
      if(base.kind==="resort")aff=clamp(aff-0.08,0,1);
      if(base.kind==="mill-village")aff=clamp(aff+0.05,0,1); // gentrified weavers' cottages
    }
    aff=clamp(aff*(0.75+0.35*region.gvaIndex),0.05,0.97);
    /* ward idiosyncrasy: real small-area statistics decorrelate between
       neighbours (a church-school catchment, one refurbished estate, an
       HMO street). Short-wavelength noise field + independent draw. */
    if(!world._wardNoise)world._wardNoise=makeNoise2D(rng.fork("wardnoise").int(0,1e9));
    const wnz=0.6*fbm(world._wardNoise,w.x/N*11,w.y/N*11,2)+0.4*rng.range(-1,1);
    aff=clamp(aff+wnz*0.085,0.05,0.97);
    w.idio=wnz;
    w.aff=aff;

    // student share: terraces near a university
    let stu=0;
    if(uniCells.length&&(mix[LU.victTerrace]||mix[LU.medieval])){
      let dmin=1e9;for(const u of uniCells)dmin=Math.min(dmin,dist(w.cx,w.cy,u%N,(u/N)|0)*world.cellKm);
      if(dmin<1.6)stu=clamp(0.42-dmin*0.2,0,0.4)*( (mix[LU.victTerrace]||0)/Math.max(1,resCells) +0.3);
    }
    w.students=stu;

    /* ethnicity: AGGREGATED from the household microsimulation.
       Nothing here is painted - the ward's mix is whatever the
       residential dynamics settled to inside its boundary. */
    let cls;
    if(!w.urban)cls = base&&base.kind==="village"?"village": base&&["market-town","port-town","resort","mill-village","pit-village","mining-hamlet","fishing-village"].includes(base.kind)?"small":"village";
    else cls = world.sizeClass==="large"?"city":world.sizeClass==="medium"?"town":"small";
    {
      const gc=world.popsGroupCount;   // person-weighted (household size applied)
      const eth=new Array(10).fill(0);let hhTot=0;
      for(const i of w.cells){for(let g=0;g<10;g++){eth[g]+=gc[g][i];hhTot+=gc[g][i];}}
      if(hhTot>3){w.eth=eth.map(v=>v*100/hhTot);}
      else{const pv=region.demo[cls].slice();const t2=pv.reduce((a,b)=>a+b,0)||100;w.eth=pv.map(v=>v*100/t2);} // unpopulated parish: prior, normalised
      w.diversity=100-w.eth[0];
    }
    /* segments & students & age skews aggregated from households */
    const T=world._wardPopTally[k];
    let segN=T.seg,stuHH=T.stu,agedHH=T.aged,hhN=T.n;
    stu=hhN>3?clamp(stuHH/hhN*1.15,0,0.6):stu;
    w.students=stu;
    const segShare=hhN>3?segN.map(v=>v/hhN):[0.35,0.4,0.25];

    /* age structure [0-15,16-24,25-44,45-64,65+] built from HH types */
    let age;
    if(hhN>3){
      const agedSh=agedHH/hhN, stuSh=stuHH/hhN, famSh=1-agedSh-stuSh;
      age=[famSh*26, stuSh*62+famSh*9, famSh*36, famSh*27+agedSh*24, agedSh*72+famSh*2];
    } else {
      age=[18.5,10.5,26.5,25.5,19.0];
      if(base&&(base.kind==="resort"||base.kind==="fishing-village")){age[4]+=14;age[2]-=5;}
      if(base&&base.kind==="village"){age[4]+=8;age[2]-=4;}
    }
    const at=age.reduce((a,b)=>a+b,0);w.age=age.map(v=>Math.max(1,v*100/at));
    {
      // interpolated median from the band distribution (bands 0-15,16-24,25-44,45-64,65+)
      const lo=[0,16,25,45,65],hi=[16,25,45,65,88];
      let acc=0,med=40;
      for(let b=0;b<5;b++){
        if(acc+w.age[b]>=50){med=lo[b]+(hi[b]-lo[b])*(50-acc)/w.age[b];break;}
        acc+=w.age[b];
      }
      w.medianAge=Math.round(med);
    }

    /* education & class: professional share is the microsim segment share */
    const degBase=region.demo.degrees[cls]||0.28;
    w.degree=clamp(degBase*0.35+segShare[2]*0.85+stu*0.25,0.08,0.78);
    w.occ={professional:clamp(segShare[2]+segShare[1]*0.25,0.06,0.75)};
    w.occ.routine=clamp(0.42-0.36*aff,0.05,0.6);
    w.occ.intermediate=Math.max(0.05,1-w.occ.professional-w.occ.routine);

    /* economy */
    w.income=Math.round((21500+34000*Math.pow(aff,1.25))*region.gvaIndex/100)*100;
    w.unemployment=clamp(0.024+0.085*Math.pow(1-aff,2.2)+(base&&base.kind==="pit-village"?0.015:0),0.015,0.16);
    w.gvaPerHead=Math.round((14000+34000*aff+ (w.jobs/(Math.max(200,w.pop)))*9000)*region.gvaIndex);

    /* deprivation decile: absolute national-style calibration */
    const depScore=(1-aff)*0.82+w.unemployment*3.0+(region.demo.badHealthBias-1)*0.35+(stu>0.15?-0.04:0)
      +(base&&base.kind==="pit-village"?0.10:0)+(base&&base.kind==="resort"?0.07:0);
    w.imd=clamp(Math.round(11.2-depScore*11.5),1,10);

    /* tenure */
    const terrShare=(mix[LU.victTerrace]||0)/Math.max(1,resCells);
    const flatShare=(mix[LU.modernFlats]||0)/Math.max(1,resCells);
    const estateShare=(mix[LU.postwarEstate]||0)/Math.max(1,resCells);
    const social=clamp(estateShare*0.62+(mix[LU.modernFlats]?flatShare*0.18:0)+0.06,0.02,0.72);
    const prent=clamp(terrShare*0.30+flatShare*0.42+stu*0.9+0.08,0.04,0.75);
    w.tenure={social:social,privateRent:Math.min(prent,0.95-social),owner:0};
    w.tenure.owner=Math.max(0.05,1-w.tenure.social-w.tenure.privateRent);

    /* health & life expectancy: real English gradient across IMD deciles */
    const [lm,lf]=region.leBase;
    {
      // covariates for the price model
      const sh={};let bt=0,green=0,coast=false;
      for(const i of w.cells){
        const c=world.landUse[i];
        if(c>0){bt++;const k2=Object.keys(LU).find(kk=>LU[kk]===c);sh[k2]=(sh[k2]||0)+1;}
        if(c===LU.park||c===LU.common||c===LU.allotment)green++;
        if(!coast){const x=i%N,y=(i/N)|0;
          for(const[j2]of[[i-1],[i+1],[i-N],[i+N]])if(j2>=0&&j2<N*N&&world.sea[j2]){coast=true;break;}}
      }
      w.stockShare={};for(const k2 in sh)w.stockShare[k2]=sh[k2]/Math.max(1,bt);
      w.greenNear=Math.min(1,green/Math.max(1,w.cells.length)*8);
      w.coastal2=coast;
      w.railAccess2=world.stations.some(st2=>st2.open&&dist(st2.x,st2.y,w.cx,w.cy)*world.cellKm<2);
      {
        if(!world._hospCells){
          world._hospCells=[];
          for(let i2=0;i2<N*N;i2++)if(world.landUse[i2]===LU.hospital)world._hospCells.push([i2%N,(i2/N)|0]);
        }
        let hd=1e9;
        for(const [hx2,hy2] of world._hospCells)hd=Math.min(hd,dist(hx2,hy2,w.cx,w.cy)*world.cellKm);
        w.hospKm=hd<1e8?+hd.toFixed(1):null;
      }
      {
        /* road access is an accessibility surface, not containment:
           distance-decay to the strategic network (a neighbouring ward
           beside an A-road has nearly the access of the ward it runs
           through), a local-network density term (lane and B-road
           coverage as a maintenance/permeability proxy), and a
           congestion discount from the assigned flows */
        if(!world._dA){
          const dA=world._dA=new Float32Array(N*N).fill(1e9);
          const q2=[];
          for(let i=0;i<N*N;i++)if((world.roadRaster[i]||0)>=ROADCLASS.A){dA[i]=0;q2.push(i);}
          for(let h2=0;h2<q2.length;h2++){
            const i=q2[h2],x=i%N,y=(i/N)|0;
            for(const[dx2,dy2]of[[1,0],[-1,0],[0,1],[0,-1]]){
              const X=x+dx2,Y=y+dy2;if(X<0||Y<0||X>=N||Y>=N)continue;
              const j2=Y*N+X;
              if(dA[j2]>dA[i]+1){dA[j2]=dA[i]+1;q2.push(j2);}
            }
          }
        }
        let acc2=0,minor=0,cong=0,cn=0;
        for(const i of w.cells){
          acc2+=1/(1+world._dA[i]*world.cellKm/1.4);
          if((world.roadRaster[i]||0)>0)minor++;
          if(world.trafficRaster&&world.trafficRaster[i]>600){cong+=Math.min(1,(world.trafficRaster[i]-600)/1400);cn++;}
        }
        const prox=acc2/Math.max(1,w.cells.length);
        const net=Math.min(1,minor/Math.max(1,w.cells.length)*3.5);
        const congF=cn?cong/cn:0;
        w.roadAccess=+(Math.max(0.03,prox*(0.62+0.38*net)*(1-0.25*congF))).toFixed(2);
      }
      {
        /* public transport: bus frequency, rail with walk/drive decay
           to the nearest OPEN station, and an urban service floor */
        let bd2=1e9;
        for(const st2 of world.stations)if(st2.open)bd2=Math.min(bd2,dist(st2.x,st2.y,w.cx,w.cy)*world.cellKm);
        const railA=bd2<1e8?Math.exp(-bd2/2.2):0;
        const busF=(w.busPerHour||0)+(w.urban?2:0);
        w.ptAccess=+(Math.min(1,busF/18*0.62+railA*0.5)).toFixed(2);
      }
    }
    {
      /* hedonic price model (GBP, 2026 levels). Regional base times
         structural premia: stock era mix, density, green access, rail
         access, centre distance, coast, crime, schooling proxy,
         graduate share. One-way for now: prices respond to the place;
         feedback into who can afford to live there is documented as a
         limitation. */
      const REG_P={"south-east":420,"east":370,"south-west":345,"west-midlands":255,"east-midlands":240,"north-west":225,"yorkshire":215,"north-east":175}[world.regionKey]||260;
      const eraMix=(w.stockShare||{});
      let m2=1;
      m2+=0.22*(eraMix.georgian||0)+0.15*(eraMix.victVilla||0)+0.06*(eraMix.medieval||0);
      m2-=0.18*(eraMix.postwarEstate||0)+0.08*(eraMix.victTerrace||0);
      m2+=0.55*(w.degree-0.3);
      m2+=w.urban?0:0.14;                                 // countryside premium
      m2+=0.14*(w.greenNear||0);
      m2+=w.railAccess2?0.12:0;
      m2+=(w.coastal2?0.18:0);
      m2+=0.16*((w.aff||0.5)-0.5)*2;
      m2-=0.07*Math.min(1,(w.pop/Math.max(0.3,w.areaKm2))/9000); // density discount
      {
        // industrial exposure discount: houses beside the works sell
        // for less, as every English estate agent knows
        let indC=0;
        const IND=new Set([LU.heavyInd,LU.lightInd,LU.mill,LU.colliery,LU.docks,LU.quarry,LU.pitSpoil,LU.sewage,LU.power]);
        for(const i of w.cells)if(IND.has(world.landUse[i]))indC++;
        w.indFrac=+(indC/Math.max(1,w.cells.length)).toFixed(3);
        m2-=0.45*Math.min(0.35,w.indFrac);
      }
      {const h4=(str)=>{let a2=2166136261;for(const c2 of str){a2^=c2.charCodeAt(0);a2=Math.imul(a2,16777619);}return ((a2>>>0)/4294967295-0.5);};
       m2*=1+h4(w.name+"|px")*0.16;}                             // micro-market draw
      // flood exposure discounts (Environment Agency-style zones)
      if(world.floodRisk){
        let fl=0;for(const i of w.cells)if(world.floodRisk[i]>0.35)fl++;
        m2-=0.14*Math.min(1,fl/Math.max(1,w.cells.length)*4);
      }
      w.price=Math.round(REG_P*Math.max(0.45,m2)/5)*5000;
    }
    w.leM=+(lm+(w.imd-5.5)*1.45+(base&&base.kind==="pit-village"?-1.1:0)+(w.urban?0:0.9)+rng.range(-0.35,0.35)).toFixed(1);   // ONS: rural LE runs ~1 yr above urban
    {
/* Voting: poststratified individual-level choice model.
       Cells: age band x education x tenure, weighted by this ward's
       own distribution; each cell gets party utilities from additive
       demographic effects plus regional, coastal, industrial-legacy,
       student and diversity terms with interactions, in the manner of
       an MRP poststratification (illustrative coefficients in the
       spirit of 2024-26 British Election Study gradients; a synthetic
       scenario, not a forecast). Turnout varies by age and tenure. */
    const REG_FX={ "north-east":{Lab:4,Ref:3,Con:-3,LD:-2}, "north-west":{Lab:3,Ref:2,Con:-2},
      yorkshire:{Lab:2,Ref:3,Con:-1,LD:-1}, "east-midlands":{Con:2,Ref:3,Lab:-1},
      "west-midlands":{Ref:2,Lab:1}, east:{Con:3,Ref:2,LD:1,Lab:-3},
      "south-east":{Con:4,LD:4,Lab:-4,Ref:-1}, "south-west":{LD:6,Con:2,Lab:-2,Ref:-1} }[world.regionKey]||{};
    const coastal=world.hasSea&&base&&["resort","fishing-village","port-town"].includes(base.kind)?1:0;
    const legacy=(base&&["pit-village","mill-village"].includes(base.kind))||((w.cells||[]).some&&false)?1:(w.millShare||0)>0.05?1:0;
    const ages=[0.10,0.16,0.34,0.24,0.16].map((d2,b)=>Math.max(0.02,w.age[b]/100||d2));
    const eduHi=clamp(w.degree,0.05,0.8);
    const ten=[w.tenure.owner,w.tenure.privateRent,w.tenure.social];
    const mkShares=(era)=>{
      const T={Lab:0,Con:0,Ref:0,LD:0,Grn:0,Oth:0};let TW=0;
      for(let ab=1;ab<5;ab++)for(let ed=0;ed<2;ed++)for(let tn=0;tn<3;tn++){
        const wgt=ages[ab]*(ed?eduHi:1-eduHi)*ten[tn];if(wgt<1e-4)continue;
        const old2=ab>=3?1:0,young=ab===1?1:0;
        /* national levels anchored to published polling: July 2026
           poll-of-polls near Ref 25, Con 20-21, Lab 19-20, Grn 13-15,
           LD 12 (YouGov 5-6 Jul; PollCheck 7-poll average 17 Jul), with
           Greens leading the 18-24 crosstab; 2024 anchored to the GE24
           result (Lab 34, Con 24, Ref 14, LD 12, Grn 7). */
        let uLab=15+10*(tn===2)+6*(tn===1)+3*young+11*(w.diversity/100)*3-5*old2+(REG_FX.Lab||0);
        let uCon=13+13*old2+7*(tn===0)+4*(w.aff-0.5)*10*(tn===0?1:0.3)-9*young-6*(w.diversity/100)*3+(REG_FX.Con||0);
        let uRef=17+10*(1-ed)+7*old2*(1-ed)+5*legacy+6*coastal-8*ed-6*(w.diversity/100)*3+(REG_FX.Ref||0);
        let uLD=12+9*ed*(tn===0)+5*ed*(w.aff-0.4)*4+2*(w.urban?0:1)*ed+(REG_FX.LD||0)+(w._ldLocal||0);
        let uGrn=11+13*young*ed+7*young+4*(tn===1)*ed+3*(w.students||0)*6+(REG_FX.Grn||0)+(w._grnLocal||0);
        let uOth=3;
        /* era anchoring: GE national results 2010-2024 plus the July
           2026 polling average; pre-2018 the "Ref" column reads as
           UKIP / Brexit Party, its demographic base */
        const EADJ={
          2010:{Lab:+4,Con:+7,Ref:-11,LD:+7,Grn:-6},
          2015:{Lab:+5,Con:+7,Ref:-3,LD:-3,Grn:-4},
          2017:{Lab:+13,Con:+10,Ref:-13,LD:-4,Grn:-6},
          2019:{Lab:+6,Con:+12,Ref:-12,LD:0,Grn:-5},
          2024:{Lab:+9,Con:+3,Ref:-8,Grn:-7,LD:-1},
          2026:{},
        }[era]||{};
        uLab+=EADJ.Lab||0;uCon+=EADJ.Con||0;uRef+=EADJ.Ref||0;uLD+=EADJ.LD||0;uGrn+=EADJ.Grn||0;
        const turnout=0.42+0.14*old2+0.06*(tn===0)-0.08*young*(tn===1?1:0);
        const ex=[uLab,uCon,uRef,uLD,uGrn,uOth].map(u2=>Math.exp(u2/9));
        const Z=ex.reduce((a2,b2)=>a2+b2,0);
        const ww=wgt*turnout;TW+=ww;
        T.Lab+=ww*ex[0]/Z;T.Con+=ww*ex[1]/Z;T.Ref+=ww*ex[2]/Z;T.LD+=ww*ex[3]/Z;T.Grn+=ww*ex[4]/Z;T.Oth+=ww*ex[5]/Z;
      }
      for(const k2 in T)T[k2]=T[k2]/TW*100;
      // ward-level idiosyncratic swing: candidates, local campaigns,
      // history. Real ward results scatter several points around any
      // demographic prediction; a seeded draw per ward and party
      const h3=(str)=>{let a2=2166136261;for(const c2 of str){a2^=c2.charCodeAt(0);a2=Math.imul(a2,16777619);}return ((a2>>>0)/4294967295-0.5)*2;};
      for(const k2 of ["Lab","Con","Ref","LD","Grn"])T[k2]=Math.max(0.5,T[k2]+h3(w.name+"|"+k2+"|"+era)*3.5);
      const j2=(w.idio||0);T.Lab+=j2*2;T.Con-=j2*1.2;
      const tot2=Object.values(T).reduce((a2,b2)=>a2+b2,0);
      for(const k2 in T)T[k2]=T[k2]/tot2*100;
      return T;
    };
    // localised party strength: Lib Dem support is famously ward-level
    // (councillor incumbency); Greens concentrate where students and
    // young graduates live
    {
      const h2=(str)=>{let a2=2166136261;for(const c2 of str){a2^=c2.charCodeAt(0);a2=Math.imul(a2,16777619);}return (a2>>>0)/4294967295;};
      const r2=h2(w.name+"|local");
      w._ldLocal=r2<0.16?6+8*h2(w.name+"|ld"):0;
      w._grnLocal=(w.students||0)>0.10?7:(w.age[1]>22&&w.degree>0.4?4:0);
    }
    if(w.pop<50){
      // an unpopulated parish has no residents to poll or describe
      w.votes=null;w.votes24=null;w.voteWinner=null;w.noResidents=true;
    }else{
    w.votesByEra={};
    for(const e2 of [2010,2015,2017,2019,2024,2026])w.votesByEra[e2]=mkShares(e2);
    w.votes=w.votesByEra[2026];
    w.votes24=w.votesByEra[2024];}
    if(w.votes){let win="Lab",bv=0;for(const k2 in w.votes)if(w.votes[k2]>bv){bv=w.votes[k2];win=k2;}
    w.voteWinner=win;}
    }
    w.leF=+(lf+(w.imd-5.5)*0.70+(base&&base.kind==="pit-village"?-0.7:0)+(w.urban?0:0.7)+rng.range(-0.3,0.3)).toFixed(1);
    w.badHealth=clamp(0.045+0.075*(10-w.imd)/9*region.demo.badHealthBias+(base&&base.kind==="pit-village"?0.02:0),0.02,0.18);

    /* crime: police-recorded offences per 1,000 residents per year,
       generated from the ward's emerged composition (England avg ~85).
       Town-centre wards carry the night-time economy and shoplifting. */
    {
      const centreShare=((mix[LU.highStreet]||0)+(mix[LU.cbd]||0))/Math.max(1,w.cells.length);
      const total=18+520*w.unemployment+130*(1-aff)+centreShare*1100+stu*55+(w.idio||0)*12;
      w.crime={
        total:Math.round(clamp(total,22,320)),
        violence:Math.round(total*0.31),
        theft:Math.round(total*(0.20+centreShare*2)),
        vehicle:Math.round(total*0.11),
        burglary:Math.round(total*0.10),
        damage:Math.round(total*0.14),
      };
    }

    /* cars */
    w.carsPerHh=+(clamp(0.55+0.95*aff-(pop/Math.max(0.5,area))/9000*0.5-stu*0.6+(w.urban?0:0.35),0.35,1.9)).toFixed(2);
  }

  // absolute-density field for lenses
  /* schools: each civic site holds a primary of ~420 places; children
     go to the nearest school; report places per child by district */
  {
    const schools=[];
    for(let i=0;i<N*N;i++)if(world.landUse[i]===LU.civic)schools.push({x:i%N,y:(i/N)|0,cap:420,filled:0});
    /* provision responds to demand, as local authorities must by law:
       compute the primary-age roll, then add schools in the most
       child-heavy residential areas until planned capacity covers the
       roll with a 17% surplus (England-wide spare places plus bulge headroom) */
    {
      const demand=[];let roll=0;
      for(const w2 of wards){
        if(!w2.cells.length||w2.noResidents||!(w2.pop>0))continue;
        let mx=0,my=0;for(const i of w2.cells){mx+=i%N;my+=(i/N)|0;}
        const kids=w2.pop*((w2.age&&isFinite(w2.age[0])?w2.age[0]:19)/100)*0.55;
        if(!isFinite(kids))continue;
        roll+=kids;
        demand.push({w:w2,mx:mx/w2.cells.length,my:my/w2.cells.length,kids});
      }
      const target=roll*1.17;
      let capNow=schools.length*420;
      // rank candidate host districts by unserved children
      const byKids=demand.slice().sort((a2,b2)=>b2.kids-a2.kids);
      let di=0;
      while(capNow<target&&di<byKids.length*3){
        const d2=byKids[di%byKids.length];di++;
        // avoid stacking two schools on the same spot
        if(schools.some(sc2=>dist(sc2.x,sc2.y,d2.mx,d2.my)<3))continue;
        schools.push({x:Math.round(d2.mx),y:Math.round(d2.my),cap:420,filled:0});
        capNow+=420;
      }
      /* catchment gravity: each district's children spread over its
         nearby schools with distance decay, as real admissions do, so
         pressure VARIES: town-centre schools run full while village
         schools carry spare places, instead of a cascade that fills
         everything to the same brim */
      /* two-round capacity-constrained gravity: demand spreads by
         distance decay, but no school takes more than its 10% bulge;
         overflow re-spreads to schools with headroom */
      const want=schools.map(()=>0);
      for(const d2 of demand){
        const wts=schools.map(sc2=>Math.exp(-dist(sc2.x,sc2.y,d2.mx,d2.my)*world.cellKm/2.4));
        const tot=wts.reduce((a2,b2)=>a2+b2,0)||1;
        let bi=0,bw=0;
        schools.forEach((sc2,k2)=>{want[k2]+=d2.kids*wts[k2]/tot;if(wts[k2]>bw){bw=wts[k2];bi=k2;}});
        d2.w._school=schools[bi];
      }
      /* a full school's overflow goes to the NEXT-NEAREST schools,
         as real admissions do, not into a county-wide pool; remote
         village schools therefore keep their spare places */
      schools.forEach((sc2,k2)=>{
        const take=Math.min(want[k2],sc2.cap);
        sc2.filled=take;sc2._over=want[k2]-take;
      });
      /* persistent local overflow is what triggers new provision in
         reality: if a school still holds more than 30% over capacity
         after local redistribution, the authority opens another site
         beside it and the children re-spread */
      for(let round2=0;round2<2;round2++){
        let worst=-1,wp=1.3;
        schools.forEach((sc2,k2)=>{const p4=(sc2.filled+sc2._over)/sc2.cap;if(p4>wp){wp=p4;worst=k2;}});
        if(worst<0)break;
        const w5=schools[worst];
        schools.push({x:w5.x+1,y:w5.y+1,cap:420,filled:0,_over:0});
        const spill=Math.max(0,w5.filled+w5._over-w5.cap);
        const take=Math.min(spill,420);
        schools[schools.length-1].filled=take;
        if(w5._over>=take){w5._over-=take;}else{w5.filled-=take-w5._over;w5._over=0;}
      }
      schools.forEach((sc2,k2)=>{
        if(sc2._over<=0.5)return;
        const ranked=schools.map((s3,k3)=>({k3,d:dist(s3.x,s3.y,sc2.x,sc2.y)}))
          .filter(r=>r.k3!==k2).sort((a2,b2)=>a2.d-b2.d);
        let left=sc2._over;
        for(const r of ranked){
          if(left<=0.5)break;
          const s3=schools[r.k3];
          const room=Math.max(0,s3.cap*1.08-s3.filled);
          const take=Math.min(left,room);
          s3.filled+=take;left-=take;
        }
        sc2.filled+=left;   // nowhere with room: bulge classes at home
        sc2._over=0;
      });
      /* a district's pressure is the weighted mix of the schools its
         children actually attend, not just its single nearest one */
      for(const d2 of demand){
        const wts=schools.map(sc2=>Math.exp(-dist(sc2.x,sc2.y,d2.mx,d2.my)*world.cellKm/2.4));
        const tot=wts.reduce((a2,b2)=>a2+b2,0)||1;
        let p3=0;
        schools.forEach((sc2,k2)=>{p3+=(wts[k2]/tot)*(sc2.filled/sc2.cap);});
        d2.w.schoolPressure=+p3.toFixed(2);
      }
      world.diagnostics=world.diagnostics||{};
      world.diagnostics.schools={sites:schools.length,capacity:schools.length*420,roll:Math.round(roll),
        maxPressure:+Math.max(0,...schools.filter(s2=>s2.filled>0).map(s2=>s2.filled/s2.cap)).toFixed(2)};
    }
  }
  /* council tax band from the price model (England A-H thresholds
     scaled to 2026 price levels) */
  for(const w2 of wards){
    if(!w2.price)continue;
    // England bands are set on estimated 1 April 1991 values (VOA);
    // deflate modelled 2026 prices to a 1991 basis (~4.6x growth)
    const p91=w2.price/4.6;
    w2.ctBand=p91<40000?"A":p91<52000?"B":p91<68000?"C":p91<88000?"D":p91<120000?"E":p91<160000?"F":p91<320000?"G":"H";
  }
  /* price -> migration coupling (single pass, documented): expensive
     districts drift affluent and older as lower-income households are
     priced toward the cheap stock */
  {
    const ps=wards.filter(w2=>w2.price).map(w2=>w2.price).sort((a2,b2)=>a2-b2);
    if(ps.length>4)for(const w2 of wards){
      if(!w2.price||w2.noResidents)continue;
      const rank=ps.indexOf(w2.price)/(ps.length-1);
      w2.aff=clamp(w2.aff*0.75+rank*0.25,0.05,0.95);
    }
  }
  {
    // diagnostics must describe the wards the user actually sees
    const diag2=world.diagnostics.zones;
    const fin=wards.filter(x=>x.cells.length);
    const pops=fin.map(x=>{let p2=0;for(const i2 of x.cells)p2+=world.cellPop[i2]||0;return p2;});
    diag2.zeroPopulation=pops.filter(p2=>p2<1).length;
    const T2=diag2.target||5200;
    const urb=fin.map((x,k2)=>x.urban?pops[k2]:null).filter(v=>v!=null);
    diag2.urbanInBand80to120=urb.length?+(urb.filter(p2=>p2>=T2*0.8&&p2<=T2*1.2).length/urb.length).toFixed(2):1;
    diag2.maxWardPop=Math.round(Math.max(...pops));
  }
  world.wards=wards;
}
