"use strict";
/* ============================================================
   HISTORICAL GROWTH & LAND USE
   The town is grown era by era with the siting logic each era
   actually used:
   - medieval: tight core on the dry point by the crossing;
     church, market place, burgage plots.
   - Georgian: polite terraces & squares on the best-drained
     side; docks at ports; water-powered mills upstream.
   - Victorian: industry goes to the flat land by water & rail,
     DOWNWIND (north-east — Britain's prevailing wind is SW'ly,
     which is why English west ends are the nice ends); terraces
     pack around the works; villas colonise the upwind hills;
     municipal park, cemetery, infirmary, town hall, station.
   - interwar: semi ribbons along the arterial roads + early
     council cottage estates.
   - post-war: large peripheral council estates, slum-clearance
     tower blocks (large towns), trading estates on the ring
     road, the DGH, the plate-glass university / poly, power
     station & sewage works downstream.
   - late C20: cul-de-sac estates toward the motorway junction,
     retail & business parks at junctions, dock decline.
   - 2000s: city-centre flats, urban extensions, science park.
   ============================================================ */

const LU={none:0,medieval:1,georgian:2,victTerrace:3,victVilla:4,interwar:5,postwarEstate:6,late20:7,modernEstate:8,modernFlats:9,
  highStreet:10,cbd:11,civic:12,heavyInd:13,lightInd:14,mill:15,colliery:16,quarry:17,docks:18,retailPark:19,bizPark:20,
  uniOld:21,uniNew:22,hospital:23,park:24,cemetery:25,allotment:26,golf:27,common:28,sewage:29,power:30,reservoir:31,pitSpoil:32,airfield:33,caravan:34,sciencePark:35,promenade:36,farm:37};

const LU_META={
  [LU.medieval]:{label:"Medieval & early-modern core",res:true,era:0,dens:55,col:"#7a4a2b"},
  [LU.georgian]:{label:"Georgian terraces & squares",res:true,era:1,dens:75,col:"#b98a4a"},
  [LU.farm]:{label:"Farmsteads & scattered dwellings",res:true,era:1,dens:3,col:"#c2b190"},
  [LU.victTerrace]:{label:"Victorian terraced housing",res:true,era:2,dens:118,col:"#b5442f"},
  [LU.victVilla]:{label:"Victorian & Edwardian villas",res:true,era:2,dens:38,col:"#d98a6a"},
  [LU.interwar]:{label:"Interwar semis",res:true,era:3,dens:52,col:"#d9772f"},
  [LU.postwarEstate]:{label:"Post-war council estate",res:true,era:4,dens:68,col:"#c96a52"},
  [LU.late20]:{label:"Late C20 estate",res:true,era:5,dens:44,col:"#e0a070"},
  [LU.modernEstate]:{label:"2000s estate",res:true,era:6,dens:50,col:"#e8b285"},
  [LU.modernFlats]:{label:"City flats & conversions",res:true,era:6,dens:165,col:"#a8442f"},
  [LU.highStreet]:{label:"High street & retail core",era:2,jobs:120,col:"#e0187d"},
  [LU.cbd]:{label:"Central business district",era:2,jobs:260,col:"#8a1fb8"},
  [LU.civic]:{label:"Civic & institutional",era:2,jobs:90,col:"#3f74c9"},
  [LU.heavyInd]:{label:"Heavy industry",era:2,jobs:85,col:"#5c5c66"},
  [LU.lightInd]:{label:"Light industry / trading estate",era:4,jobs:70,col:"#9a9aa6"},
  [LU.mill]:{label:"Textile mill",era:2,jobs:60,col:"#6b5a70"},
  [LU.colliery]:{label:"Colliery (closed)",era:2,jobs:4,col:"#38343a"},
  [LU.quarry]:{label:"Quarry",era:2,jobs:15,col:"#8a7a68"},
  [LU.docks]:{label:"Docks & port",era:2,jobs:60,col:"#5a6a7d"},
  [LU.retailPark]:{label:"Retail park",era:5,jobs:75,col:"#ef7ab8"},
  [LU.bizPark]:{label:"Business park",era:5,jobs:110,col:"#b06fd9"},
  [LU.uniOld]:{label:"University (civic redbrick)",era:2,jobs:130,col:"#1f5fd0"},
  [LU.uniNew]:{label:"University (1960s / post-92)",era:4,jobs:120,col:"#5b8ae0"},
  [LU.hospital]:{label:"Hospital",era:4,jobs:150,col:"#00a0a8"},
  [LU.park]:{label:"Public park",era:2,jobs:2,col:"#2f9e41"},
  [LU.cemetery]:{label:"Cemetery",era:2,jobs:2,col:"#8fb896"},
  [LU.allotment]:{label:"Allotments",era:2,jobs:0,col:"#b7cc4e"},
  [LU.golf]:{label:"Golf course",era:3,jobs:6,col:"#a5d68a"},
  [LU.common]:{label:"Common / green",era:0,jobs:0,col:"#96a852"},
  [LU.sewage]:{label:"Sewage treatment works",era:4,jobs:8,col:"#c8b25a"},
  [LU.power]:{label:"Power station",era:4,jobs:35,col:"#f2c230"},
  [LU.reservoir]:{label:"Reservoir",era:2,jobs:1,col:"#4aa8c9"},
  [LU.pitSpoil]:{label:"Colliery spoil (reclaimed)",era:2,jobs:0,col:"#95a878"},
  [LU.airfield]:{label:"Airfield",era:4,jobs:25,col:"#c9c2a8"},
  [LU.caravan]:{label:"Caravan / holiday park",era:5,jobs:4,col:"#d9c2a0"},
  [LU.sciencePark]:{label:"Science park",era:6,jobs:120,col:"#9b59d0"},
  [LU.promenade]:{label:"Promenade & seafront",era:2,jobs:15,col:"#e8c25a"},
};
/* functional category (use type, independent of era) and a residential
   density band, so the land-use lens can show *function* and density is
   its own separate axis. */
const LU_FUNC={
  [LU.medieval]:"res",[LU.georgian]:"res",[LU.victTerrace]:"res",[LU.victVilla]:"res",
  [LU.interwar]:"res",[LU.postwarEstate]:"res",[LU.late20]:"res",[LU.modernEstate]:"res",[LU.modernFlats]:"res",
  [LU.farm]:"res",[LU.highStreet]:"retail",[LU.cbd]:"office",[LU.civic]:"civic",[LU.retailPark]:"retail",[LU.bizPark]:"office",
  [LU.heavyInd]:"industry",[LU.lightInd]:"industry",[LU.mill]:"industry",[LU.colliery]:"industry",
  [LU.quarry]:"industry",[LU.docks]:"industry",[LU.sciencePark]:"office",
  [LU.uniOld]:"civic",[LU.uniNew]:"civic",[LU.hospital]:"civic",
  [LU.park]:"green",[LU.cemetery]:"green",[LU.allotment]:"green",[LU.golf]:"green",[LU.common]:"green",[LU.pitSpoil]:"green",
  [LU.sewage]:"utility",[LU.power]:"utility",[LU.reservoir]:"utility",[LU.airfield]:"utility",
  [LU.caravan]:"res",[LU.promenade]:"retail",
};
const FUNC_COL={res:"#d9772f",retail:"#e0187d",office:"#8a1fb8",civic:"#1f5fd0",
  industry:"#5c5c66",green:"#3f9c47",utility:"#f2c230"};
const FUNC_LABEL={res:"Residential",retail:"Retail & town centre",office:"Offices & business",
  civic:"Civic, health & education",industry:"Industry & port",green:"Parks & green space",utility:"Utilities & infrastructure"};

function placeCampus(world,s,cls,n,ringKm,eraIdx){
  // choose ONE seed at the preferred ring, then grow n contiguous cells
  const {N,rng}=world;const idx=(x,y)=>y*N+x;
  const R=(ringKm||1.2)/world.cellKm;
  let seed=-1,bs=1e9;
  for(let t=0;t<400;t++){
    const th=rng.range(0,6.283),r=R*rng.range(0.6,1.5);
    const x=Math.round(s.x+Math.cos(th)*r),y=Math.round(s.y+Math.sin(th)*r);
    if(x<4||y<4||x>=N-4||y>=N-4)continue;
    const i=idx(x,y);
    if(world.sea[i]||world.landUse[i]>0||world.river[i]>=2||world.slope[i]>0.15)continue;
    const sc=world.slope[i]*40+Math.abs(dist(x,y,s.x,s.y)-R)*0.4+rng.f();
    if(sc<bs){bs=sc;seed=i;}
  }
  if(seed<0)return;
  const q=[seed];const got=new Set([seed]);
  while(q.length&&got.size<n){
    const i=q.shift();const x=i%N,y=(i/N)|0;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const X=x+dx,Y=y+dy;if(X<2||Y<2||X>=N-2||Y>=N-2)continue;
      const j=idx(X,Y);
      if(got.has(j)||world.sea[j]||world.landUse[j]>0||world.river[j]>=2)continue;
      got.add(j);q.push(j);
      if(got.size>=n)break;
    }
  }
  for(const i of got){world.landUse[i]=cls;world.luEra[i]=eraIdx;world.settleOf[i]=s.id;}
}
function growWorld(world){
  const {N,rng,region,regionKey}=world;
  const idx=(x,y)=>y*N+x;
  initSkeletons(world);
  const landUse=world.landUse=new Uint8Array(N*N);
  const luEra=world.luEra=new Uint8Array(N*N).fill(255);
  const cellPop=world.cellPop=new Float32Array(N*N);
  const settleOf=world.settleOf=new Int16Array(N*N).fill(-1);
  const haPerCell=world.cellKm*world.cellKm*100;
  const {sea,river,slope,elev,cover}=world;
  const nm=world.names;
  world.landmarks=[];
  const DOWNWIND=[0.707,-0.707], UPWIND=[-0.707,0.707]; // SW prevailing wind

  const S=world.settlements;
  S.forEach((s,si)=>s.id=si);

  const buildable=i=>!sea[i]&&!river[i]&&landUse[i]===0&&slope[i]<0.22&&elev[i]<380&&world.railRaster[i]===0;

  function place(i,cls,eraIdx,sid){
    landUse[i]=cls;luEra[i]=eraIdx;settleOf[i]=sid;
    const m=LU_META[cls];
    if(m&&m.res)cellPop[i]=m.dens*haPerCell*rng.range(0.85,1.15);
  }

  /* region-grow n cells from settlement frontier with a scoring fn */
  function accrete(s,eraIdx,n,cls,opts={}){
    if(n<=0)return 0;
    const heap=new MinHeap(); const inHeap=new Set();
    const cx=s.x,cy=s.y;
    if(s._axT===undefined){
      // growth axis: along the strongest road bearing out of the centre,
      // with elongation and a home contour drawn per settlement
      let bx=1,by=0,bv=0;
      for(let a2=0;a2<12;a2++){
        const th=a2/12*Math.PI;let v=0;
        for(let r2=2;r2<9;r2++){
          const X=Math.round(cx+Math.cos(th)*r2),Y=Math.round(cy+Math.sin(th)*r2);
          if(X<1||Y<1||X>=N-1||Y>=N-1)continue;
          if(world.roadRaster[idx(X,Y)]>=ROADCLASS.minor)v++;
          const X2=Math.round(cx-Math.cos(th)*r2),Y2=Math.round(cy-Math.sin(th)*r2);
          if(X2>=1&&Y2>=1&&X2<N-1&&Y2<N-1&&world.roadRaster[idx(X2,Y2)]>=ROADCLASS.minor)v++;
        }
        if(v>bv){bv=v;bx=Math.cos(th);by=Math.sin(th);}
      }
      s._axT=Math.atan2(by,bx);
      s._axR=1.15+rng.f()*0.75;          // elongation 1.15-1.9 along the axis
      s._elev0=elev[idx(Math.round(cx),Math.round(cy))];
    }

    const score=(i)=>{
      const x=i%N,y=(i/N)|0;
      let c=slope[i]*(opts.slopeTol||60);
      // anisotropic distance: settlements stretch along their road axis
      const rx=x-cx,ry=y-cy,ct=Math.cos(s._axT),st=Math.sin(s._axT);
      const u2=(rx*ct+ry*st)/s._axR, v2=-rx*st+ry*ct;
      const d=Math.hypot(u2,v2);
      c+=d*(opts.compact??0.9);
      // contour banding: building follows the settlement's own level
      c+=Math.abs(elev[i]-s._elev0)*0.045;
      // hard map-edge containment: towns must not spill off the sheet
      const edgeD=Math.min(x,y,N-1-x,N-1-y);
      if(edgeD<10)c+=(10-edgeD)*(10-edgeD)*0.9;
      // street-led development: residential land must be served by the
      // settlement's street skeleton (grown era by era before this call)
      if(opts.street){
        if(!world.devMask[i])c+=30;      // effectively off-network
        else c-=2.5;
      }
      // greenbelt: post-1955 growth of the main town blocked in a ring -> leapfrog
      if(opts.greenbelt&&s.gbR&&d>s.gbR&&d<s.gbR+opts.greenbelt)c+=45;
      if(world.stratum[i]===world.lithIndex.indexOf("alluvium")&&!opts.floodOk)c+=opts.ind?1:9;
      if(cover[i]===5&&!opts.floodOk)c+=8;
      // the river is a growth barrier: banks of a major channel are
      // costly unless the use wants water (docks, mills)
      if(!opts.waterPull&&!opts.floodOk){
        if(world.river[i]>=2)c+=25;
        else for(const[dx2,dy2]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X2=x+dx2,Y2=y+dy2;if(X2<0||Y2<0||X2>=N||Y2>=N)continue;
          if(world.river[idx(X2,Y2)]>=2){c+=7;break;}
        }
      }
      if(cover[i]===3)c+=4;
      if(opts.roadPull){
        let best=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          const rr=world.roadRaster[idx(X,Y)];
          const v=rr>=ROADCLASS.A?1:rr>=ROADCLASS.minor?0.6:0;
          if(v>best)best=v;
        }
        c-=best*opts.roadPull;
      }
      if(opts.railPull&&world.railRaster[i])c-=opts.railPull;
      if(opts.waterPull){let w=0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;const j=idx(X,Y);if(river[j]>=1||sea[j])w=1;}c-=w*opts.waterPull;}
      if(opts.dir){const dd=Math.max(0.1,d);c-=((x-cx)/dd*opts.dir[0]+(y-cy)/dd*opts.dir[1])*(opts.dirW||3);}
      if(opts.adj){let a=0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;if(opts.adj(landUse[idx(X,Y)]))a=1;}c-=a*(opts.adjW||4);}
      if(!opts.loose){let nb=0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          if(landUse[idx(X,Y)]>0)nb++;
        }
        c-=Math.min(nb,5)*0.85;                       // coherent blocks, ragged only at the fringe
      }
      c+=rng.range(0,opts.jitter??1.2)+world._costNoise[i]*(opts.rough??1.4); // irregular frontier
      if(opts.minD&&d<opts.minD)c+=(opts.minD-d)*3;
      if(opts.maxD&&d>opts.maxD)c+=(d-opts.maxD)*6;
      return c;
    };
    const pushNbrs=(x,y)=>{
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const X=x+dx,Y=y+dy;if(X<1||Y<1||X>=N-1||Y>=N-1)continue;const j=idx(X,Y);
        if(!buildable(j)||inHeap.has(j))continue;
        inHeap.add(j);heap.push(score(j),j);
      }};
    // seed frontier: neighbours of this settlement's existing cells, else the core point
    let seeded=false;
    if(opts.seedAll!==false){
      for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=idx(x,y);
        if(settleOf[i]===s.id&&landUse[i]>0){pushNbrs(x,y);seeded=true;}}
    }
    if(!seeded){ if(buildable(idx(cx,cy))){inHeap.add(idx(cx,cy));heap.push(0,idx(cx,cy));} else pushNbrs(cx,cy); }
    let placed=0;
    while(placed<n&&heap.size){
      const[,i]=heap.pop();
      if(!buildable(i))continue;
      const chosen=typeof cls==="function"?cls(i):cls;
      place(i,chosen,eraIdx,s.id);placed++;
      pushNbrs(i%N,(i/N)|0);
    }
    return placed;
  }

  /* ---------- growth profiles: share of final RESIDENTIAL area per era ---------- */
  const ind=region.industry;
  const industrial = (ind.coal>0.5||ind.textile==="wool"||ind.textile==="cotton"||ind.metal>0.5||ind.steel>0.6);
  const commuterRegion = (ind.commuter||0)>0.5||regionKey==="east";
  function profileFor(s){
    if(s.kind==="resort")return {medieval:0.01,georgian:0.03,victorian:0.44,interwar:0.20,postwar:0.14,late20:0.10,modern:0.08};
    if(s.kind==="pit-village")return {medieval:0.02,georgian:0.03,victorian:0.62,interwar:0.16,postwar:0.13,late20:0.02,modern:0.02};
    if(s.kind==="mill-village"||s.kind==="mining-hamlet")return {medieval:0.05,georgian:0.28,victorian:0.47,interwar:0.08,postwar:0.06,late20:0.03,modern:0.03};
    if(s.kind==="village")return {medieval:0.30,georgian:0.12,victorian:0.12,interwar:0.08,postwar:0.10,late20:0.12,modern:0.16};
    if(s.kind!=="main"){
      // towns differ by history: draw an archetype, not one universal ring pattern
      const arch=rng.f();
      if(arch<0.35)return {medieval:0.20,georgian:0.18,victorian:0.13,interwar:0.10,postwar:0.11,late20:0.12,modern:0.16}; // ancient market town, largely pre-Victorian core
      if(arch<0.65)return {medieval:0.03,georgian:0.05,victorian:0.44,interwar:0.16,postwar:0.14,late20:0.09,modern:0.09}; // railway-era boom town
      if(arch<0.85)return {medieval:0.06,georgian:0.06,victorian:0.14,interwar:0.12,postwar:0.34,late20:0.16,modern:0.12}; // postwar overspill growth
      return {medieval:0.09,georgian:0.09,victorian:0.22,interwar:0.15,postwar:0.18,late20:0.13,modern:0.14};              // mixed
    }
    if(industrial)return {medieval:0.015,georgian:0.035,victorian:0.33,interwar:0.17,postwar:0.24,late20:0.11,modern:0.10};
    if(commuterRegion)return {medieval:0.03,georgian:0.05,victorian:0.15,interwar:0.21,postwar:0.23,late20:0.17,modern:0.16};
    return {medieval:0.05,georgian:0.07,victorian:0.22,interwar:0.18,postwar:0.22,late20:0.13,modern:0.13};
  }
  // residential cells needed per settlement: target pop / blended density
  for(const s of S){
    s.profile=profileFor(s);
    const blendDens=Object.entries(s.profile).reduce((a,[era,sh])=>{
      const d={medieval:55,georgian:75,victorian:s.kind==="main"&&industrial?100:70,interwar:52,postwar:64,late20:44,modern:60}[era];
      return a+sh*d;},0);
    s.resCells=Math.max(2,Math.round(s.target/(blendDens*haPerCell)));
  }

  const eraOrder=["medieval","georgian","victorian","interwar","postwar","late20","modern"];
  const eraIx={medieval:0,georgian:1,victorian:2,interwar:3,postwar:4,late20:5,modern:6};

  /* ================= MEDIEVAL & GEORGIAN ================= */
  for(const s of S){
    const e=0;
    const n=Math.max(s.kind==="village"?1:2,Math.round(s.resCells*s.profile.medieval));
    extendSkeleton(world,s,0,n);closeDevMask(world);accrete(s,e,n,LU.medieval,{compact:1.6,jitter:0.6,street:true});
    // church for every settlement; green for villages
    world.landmarks.push({x:s.x,y:s.y,type:"church",name:rng.pick(nm.saintPool)+"'s"});
    if(s.kind==="village"&&rng.chance(0.5)){const i=idx(clamp(s.x+rng.int(-1,1),0,N-1),clamp(s.y+rng.int(-1,1),0,N-1));if(buildable(i))place(i,LU.common,0,s.id);}
    if(s.kind==="main"||s.kind==="market-town"||s.kind==="port-town"){
      // market place = high street seed
      const i=idx(s.x,s.y); if(landUse[i]===LU.medieval||buildable(i)){landUse[i]=LU.highStreet;luEra[i]=0;settleOf[i]=s.id;}
    }
  }
  // main-town medieval landmarks
  {
    const m=world.main;
    const ageOk=["roman","minster","burh","norman","harbour","market"].includes(m.origin);
    const cath = ageOk && (world.sizeClass!=="small") && rng.chance(m.origin==="minster"?0.65:0.18);
    if(cath){m.features.cathedral="ancient";world.landmarks.push({x:m.x,y:m.y,type:"cathedral",name:rng.pick(["Christ Church Cathedral","St Mary's Cathedral","Holy Trinity Cathedral","St Peter's Cathedral"])});}
    if(rng.chance(m.origin==="norman"?0.85:0.28)){
      // castle on nearest local high point within 1km
      let bx=m.x,by=m.y,bh=-1;
      for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const X=m.x+dx,Y=m.y+dy;if(X<2||Y<2||X>=N-2||Y>=N-2)continue;const i=idx(X,Y);if(sea[i])continue;if(dist(X,Y,m.x,m.y)>1.1/world.cellKm)continue;if(elev[i]>bh){bh=elev[i];bx=X;by=Y;}}
      m.features.castle=true;
      const ruined=rng.chance(0.55);   // most English castles are ruins
      world.landmarks.push({x:bx,y:by,type:ruined?"castle-ruin":"castle",name:m.name+" Castle"+(ruined?" (ruins)":"")});
    }
    const abbeyP={"yorkshire":0.55,"north-east":0.4,"north-west":0.3,"east":0.35,"south-west":0.35,"south-east":0.3,"east-midlands":0.3,"west-midlands":0.3}[regionKey];
    if(rng.chance(abbeyP)){
      // riverside meadow site near a river within 4km of a settlement
      let site=null;
      for(let t=0;t<300&&!site;t++){const x=rng.int(4,N-5),y=rng.int(4,N-5);const i=idx(x,y);
        if(river[i]>=2)continue;
        let nearR=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(river[idx(clamp(x+dx,0,N-1),clamp(y+dy,0,N-1))]>=2)nearR=true;}
        if(nearR&&!sea[i]&&slope[i]<0.04)site={x,y};}
      if(site)world.landmarks.push({x:site.x,y:site.y,type:"abbey",name:nm.settlementName({village:true})+" Abbey"});
    }
  }
  // georgian
  for(const s of S){
    const n=Math.round(s.resCells*s.profile.georgian);
    accrete(s,1,n,LU.georgian,{compact:1.2,jitter:0.8,dir:s.kind==="main"?UPWIND:null,dirW:1.2});
    if(s.features.mill){ // water-powered mills
      accrete(s,1,rng.int(1,2),LU.mill,{waterPull:8,compact:0.8,floodOk:true});
    }
    if(s.features.tin){accrete(s,1,1,LU.quarry,{compact:1});world.landmarks.push({x:s.x,y:s.y,type:"engine-house",name:"Wheal "+rng.pick(["Grace","Fortune","Prosper","Owles","Vor"])});}
    if((s.kind==="main"&&world.main.origin==="harbour")||s.kind==="port-town"){
      accrete(s,1,s.kind==="main"?3:1,LU.docks,{waterPull:14,floodOk:true,compact:0.8});
    }
  }

  /* ================= VICTORIAN ================= */
  buildRail(world);
  for(const s of S){
    const e=2;
    const nRes=Math.round(s.resCells*s.profile.victorian);
    if(s.kind==="main"){
      const m=s;
      // industry scale from drivers
      const indCells=Math.round(nRes*(industrial?0.55:0.22)*(0.8+0.5*rng.next()));
      const indCls=()=> ind.textile&&rng.chance(0.45)?LU.mill : LU.heavyInd;
      accrete(m,e,indCells,indCls,{ind:true,floodOk:true,waterPull:5,railPull:6,dir:DOWNWIND,dirW:4,slopeTol:110,compact:0.55,adj:c=>c===LU.heavyInd||c===LU.mill||c===LU.docks,adjW:5});
      if(m.origin==="harbour"||world.main.features.port){accrete(m,e,4,LU.docks,{waterPull:16,floodOk:true,compact:0.6});}
      // terraces around the works, villas upwind - on the street skeleton
      const nT=Math.round(nRes*(industrial?0.8:0.55)), nV=nRes-nT;
      extendSkeleton(world,m,2,nT+nV);closeDevMask(world);
      accrete(m,e,nT,LU.victTerrace,{adj:c=>c===LU.heavyInd||c===LU.mill||c===LU.docks||c===LU.victTerrace,adjW:3.5,dir:DOWNWIND,dirW:1.8,compact:0.8,street:true});
      accrete(m,e,nV,LU.victVilla,{dir:UPWIND,dirW:4,compact:0.65,slopeTol:30,minD:2/world.cellKm*0.5,street:true});
      // civic set pieces
      accrete(m,e,world.sizeClass==="large"?2:1,LU.civic,{compact:2.2});
      accrete(m,e,world.sizeClass==="small"?2:world.sizeClass==="medium"?3:5,LU.highStreet,{compact:2.5,adj:c=>c===LU.highStreet||c===LU.medieval,adjW:8});
      accrete(m,e,1,LU.park,{dir:UPWIND,dirW:2,compact:1});   // the People's Park
      accrete(m,e,1,LU.cemetery,{compact:0.7,minD:1.2/world.cellKm});
      accrete(m,e,1,LU.allotment,{adj:c=>c===LU.victTerrace,adjW:6,compact:0.7});
      world.landmarks.push({x:m.x,y:m.y,type:"townhall",name:m.name+" Town Hall"});
      if(!m.features.cathedral&&world.sizeClass==="large"&&rng.chance(0.35)){m.features.cathedral="victorian";world.landmarks.push({x:m.x,y:m.y,type:"cathedral",name:"St "+rng.pick(["Aidan","Chad","Alban","George"])+"'s Cathedral"});}
      // civic redbrick university for large towns
      if(world.sizeClass==="large"&&rng.chance(0.8)){
        m.features.uniOld=true;
        placeCampus(world,m,LU.uniOld,6,1.1,2);
        world.landmarks.push({x:m.x,y:m.y,type:"university",name:"University of "+m.name});
      }
      placeCampus(world,m,LU.hospital,3,1.0,2);
      world.landmarks.push({x:m.x,y:m.y,type:"infirmary",name:m.name+" Royal Infirmary"});
    } else {
      extendSkeleton(world,s,2,nRes);
      accrete(s,e,nRes,s.kind==="resort"?(i=>rng.chance(0.55)?LU.victTerrace:LU.victVilla):LU.victTerrace,{compact:1.0,jitter:0.9,street:true});
      if(s.kind==="pit-village"){
        accrete(s,e,1,LU.colliery,{compact:1.5});accrete(s,e,rng.int(1,2),LU.pitSpoil,{compact:1.0,adj:c=>c===LU.colliery,adjW:8});
        accrete(s,e,1,LU.park,{compact:1.2}); // miners' welfare
      }
      if(s.features.mill)accrete(s,e,rng.int(1,3),LU.mill,{waterPull:9,floodOk:true,compact:0.7});
      if(s.kind==="port-town")accrete(s,e,2,LU.docks,{waterPull:14,floodOk:true});
      if(s.kind==="resort"){
        // promenade along the front
        let n=0;
        for(let y=1;y<N-1&&n<8;y++)for(let x=1;x<N-1&&n<8;x++){const i=idx(x,y);
          if(!buildable(i))continue;
          if(dist(x,y,s.x,s.y)>2.2/world.cellKm)continue;
          let bySea=false;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(sea[idx(clamp(x+dx,0,N-1),clamp(y+dy,0,N-1))])bySea=true;
          if(bySea){place(i,LU.promenade,e,s.id);n++;}}
        world.landmarks.push({x:s.x,y:s.y,type:"pier",name:s.name+" Pier"});
      }
      if(s.kind==="market-town"){
        // every real market town has its trading estate by the rail
        // or main road: ~5% of the residential footprint, so a 40k
        // town carries 15-20 modest cells, not a works-town's spread
        const RI2={"south-east":0.6,"east":0.7,"south-west":0.75}[world.regionKey]||1;
        const n2=Math.max(3,Math.round(s.resCells*0.05*RI2));
        accrete(s,e,Math.round(n2*0.7),LU.lightInd,{railPull:6,roadPull:4,compact:1.6,adj:c=>c===LU.lightInd,adjW:5});
        accrete(s,e,Math.round(n2*0.3),LU.lightInd,{roadPull:6,compact:1.4,adj:c=>c===LU.lightInd,adjW:5});
      }
      {
        /* commerce follows FUNCTION and SITE, not a population table:
           a chartered market town centres on its market place; a
           railway town's commerce grew at the station front; a port's
           on the harbour; a resort's along the promenade. Employment
           land follows its era's transport: rail sidings before 1939,
           the bypass and the junction after 1980. */
        const hs=(n2,ax,ay)=>{const hold=[s.x,s.y];if(ax!=null){s.x=ax;s.y=ay;delete s._axT;}
          accrete(s,e,n2,LU.highStreet,{compact:3,adj:c=>c===LU.medieval||c===LU.highStreet||c===LU.victTerrace,adjW:8});
          if(ax!=null){[s.x,s.y]=hold;delete s._axT;}};
        const near=(px,py,r2,pred)=>{for(let dy=-r2;dy<=r2;dy++)for(let dx=-r2;dx<=r2;dx++){const X=px+dx,Y=py+dy;if(X<0||Y<0||X>=N||Y>=N)continue;if(pred(idx(X,Y)))return [X,Y];}return null;};
        const chartered=["market-town","port-town"].includes(s.kind)||s.origin==="market";
        const stn=world.stations.find(st2=>dist(st2.x,st2.y,s.x,s.y)<6&&st2.open);
        if(chartered)hs(clamp(Math.round(s.target/6000),1,4));   // a 20k town has a real high street, not one cell
        if(stn&&s.target>4000)hs(1,stn.x,stn.y);          // station-front parade
        if(s.kind==="port-town"){const q=near(s.x,s.y,5,i2=>{for(const j2 of[i2-1,i2+1,i2-N,i2+N])if(sea[j2])return true;return false;});if(q)hs(1,q[0],q[1]);}
        if(s.kind==="resort")hs(1);                        // promenade parade exists via resort block
        if(!chartered&&!stn&&s.target>5000)hs(1);          // suburban district centre
        // employment share follows industrial history: works towns
        // (pits, mills, ports) carry heavy shares; an ordinary market
        // town gets its modest trading estate and no more
        const REG_IND={"south-east":0.6,"east":0.7,"south-west":0.75,"east-midlands":1.0,
          "west-midlands":1.1,"yorkshire":1.1,"north-west":1.1,"north-east":1.15}[world.regionKey]||1;
        const eqShare=((s.kind==="pit-village"||s.kind==="mill-village"||s.kind==="port-town")?0.16
          :s.kind==="market-town"?0.04:0.08)*REG_IND;
        const eq=Math.max(1,Math.round(s.resCells*eqShare));
        if(s.target>5000){
          // pre-war industry by the railway, post-war by the main road
          accrete(s,e,Math.round(eq*0.45),LU.lightInd,{railPull:7,roadPull:3,compact:1.2,adj:c=>c===LU.lightInd||c===LU.heavyInd,adjW:5});
          accrete(s,e,Math.round(eq*0.35),LU.lightInd,{roadPull:6,compact:1.6,adj:c=>c===LU.lightInd,adjW:5});
        }
        if(s.target>11000)accrete(s,e,Math.round(eq*0.2),LU.bizPark,{roadPull:7,compact:1.8,adj:c=>c===LU.bizPark,adjW:6});
      }
      // interwar ribbons along the arterials, grown two cells wide so
      // they survive the anti-band opening as real linear suburbs
      if(s.target>4500){
        const rn=Math.max(2,Math.round(s.resCells*0.06));
        accrete(s,e,rn,LU.interwar,{roadPull:9,compact:0.35});
        accrete(s,e,rn,LU.interwar,{compact:0.4,adj:c=>c===LU.interwar,adjW:14});
      }
    }
  }
  // Victorian reservoir in the uplands (municipal waterworks)
  if(world.uplandSide&&region.upRain>1100){
    let site=null,bs=0;
    for(let i=0;i<N*N;i++){
      if(river[i]<1||river[i]>2||sea[i])continue;
      if(elev[i]<200)continue;
      const x=i%N,y=(i/N)|0; if(x<4||y<4||x>=N-4||y>=N-4)continue;
      const sc=world.acc[i];
      if(sc>bs){bs=sc;site=i;}
    }
    if(site){
      const sx=site%N,sy=(site/N)|0;const level=elev[site]+7;   // fill window sized to valley roughness
      const q=[site];const seen=new Set([site]);let count=0;
      /* a reservoir is a level pool behind a dam: it fills the basin
         UPSTREAM of the dam site, never strings down the channel
         across the contours */
      const damFloor=elev[site]-1.5;
      while(q.length&&count<60){const i=q.pop();const x=i%N,y=(i/N)|0;
        if(elev[i]<=level&&elev[i]>=damFloor&&dist(x,y,sx,sy)<18){place(i,LU.reservoir,2,-1);count++;
          for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<1||Y<1||X>=N-1||Y>=N-1)continue;const j=idx(X,Y);if(!seen.has(j)&&!sea[j]&&elev[j]<=level&&elev[j]>=damFloor){seen.add(j);q.push(j);}}}}
      if(count>3)world.landmarks.push({x:sx,y:sy,type:"reservoir",name:nm.settlementName({village:true}).split(" ")[0]+" Reservoir"});
      else for(const i of seen)if(landUse[i]===LU.reservoir)landUse[i]=0;
    }
  }

  /* ================= INTERWAR ================= */
  for(const s of S){
    const n=Math.round(s.resCells*s.profile.interwar);
    // ribbon development: strong pull to A/B roads
    extendSkeleton(world,s,3,n);closeDevMask(world);
    accrete(s,3,Math.round(n*0.55),LU.interwar,{roadPull:9,compact:0.30,jitter:1.5,street:true});
    accrete(s,3,n-Math.round(n*0.55),LU.interwar,{roadPull:4,compact:0.7,jitter:1.4,street:true});
    if(s.kind==="main"){
      accrete(s,3,rng.int(1,2),LU.golf,{minD:1.5/world.cellKm,compact:0.4,slopeTol:25});
    }
  }
  // WWII airfield on flat land (kept for later reuse)
  if(rng.chance(regionKey==="east"?0.7:0.3)&&world.sizeClass!=="small"){
    let site=null;
    for(let t=0;t<400&&!site;t++){
      const x=rng.int(15,N-16),y=rng.int(15,N-16);const i=idx(x,y);
      if(!buildable(i)||slope[i]>0.015||elev[i]>120)continue;
      if(dist(x,y,world.main.x,world.main.y)<6/world.cellKm)continue;
      let ok=true;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){if(!buildable(idx(clamp(x+dx,1,N-2),clamp(y+dy,1,N-2))))ok=false;}
      if(ok)site={x,y};
    }
    if(site){for(let dy=-1;dy<=1;dy++)for(let dx=-2;dx<=2;dx++)place(idx(site.x+dx,site.y+dy),LU.airfield,3,-1);
      world.landmarks.push({x:site.x,y:site.y,type:"airfield",name:"RAF "+nm.settlementName({village:true})});}
  }

  /* ================= POSTWAR ================= */
  buildMotorway(world);
  for(const s of S){
    const e=4;
    const n=Math.round(s.resCells*s.profile.postwar);
    if(s.kind==="main"&&!s.gbR){
      // measure current built radius -> designate green belt just beyond it
      let maxR=0;for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;
        if(settleOf[i]===s.id&&landUse[i]>0){const d=dist(x,y,s.x,s.y);if(d>maxR)maxR=d;}}
      s.gbR=maxR*1.06;
    }
    if(s.kind==="main"){
      // 1-3 big peripheral estates as distinct blobs
      const blobs=world.sizeClass==="large"?3:world.sizeClass==="medium"?2:1;
      extendSkeleton(world,s,4,n);closeDevMask(world);for(let b=0;b<blobs;b++)accrete(s,e,Math.ceil(n/blobs),LU.postwarEstate,{compact:0.9,minD:(1.6+b*0.4)/world.cellKm,jitter:1.6,greenbelt:s.kind==="main"?3.2/world.cellKm:0,street:true});
      // slum clearance towers in large towns: convert inner terrace
      if(world.sizeClass==="large"){
        let conv=0;
        for(let y=0;y<N&&conv<4;y++)for(let x=0;x<N&&conv<4;x++){const i=idx(x,y);
          if(landUse[i]===LU.victTerrace&&settleOf[i]===s.id&&dist(x,y,s.x,s.y)<1.6/world.cellKm&&rng.chance(0.25)){landUse[i]=LU.modernFlats;luEra[i]=4;cellPop[i]=LU_META[LU.modernFlats].dens*haPerCell*0.8;conv++;}}
      }
      accrete(s,e,world.sizeClass==="large"?4:2,LU.lightInd,{roadPull:7,compact:0.5,ind:true,floodOk:true});
      accrete(s,e,world.sizeClass==="small"?1:world.sizeClass==="medium"?3:5,LU.cbd,{compact:3,adj:c=>c===LU.highStreet||c===LU.cbd,adjW:10});
      // secondary shopping parades and district centres
      accrete(s,e,world.sizeClass==="large"?4:2,LU.highStreet,{roadPull:6,compact:1.4,adj:c=>c===LU.victTerrace||c===LU.interwar||c===LU.highStreet,adjW:4});
      // employment land: light industry, trading estates, business parks
      // at ~12% of the settlement's residential footprint (bypass-edge
      // business parks post-1980, estates by rail or main road earlier)
      {
        const empl=Math.max(2,Math.round(s.resCells*0.17));
        accrete(s,e,Math.round(empl*0.55),LU.lightInd,{roadPull:5,railPull:4,compact:1.6,adj:c=>c===LU.lightInd||c===LU.heavyInd,adjW:5});
        accrete(s,e,Math.round(empl*0.30),LU.bizPark,{roadPull:7,compact:2,adj:c=>c===LU.bizPark,adjW:6});
        accrete(s,e,Math.round(empl*0.15),LU.retailPark,{roadPull:7,compact:2.4,adj:c=>c===LU.retailPark,adjW:7});
      }
      // schools: one civic site per ~8,000 residents
      accrete(s,e,Math.max(2,Math.round(s.target/8000)),LU.civic,{compact:0.8});
      {
        /* parks scatter with real spacing: candidate cells beside the
           housing, each at least 4 cells from any earlier park */
        const nPk=Math.max(2,Math.round(s.target/6500));
        // candidates: empty cells touching this settlement's housing
        const cand2=[];
        {
          const R=Math.min(34,Math.ceil(Math.sqrt(s.target/9)+8));
          for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
            const X=Math.round(s.x)+dx,Y=Math.round(s.y)+dy;
            if(X<1||Y<1||X>=N-1||Y>=N-1)continue;
            const i=Y*N+X;
            if(landUse[i]||sea[i])continue;
            let nearRes=false;
            for(const j of [i-1,i+1,i-N,i+N]){
              if(settleOf[j]===s.id&&landUse[j]&&LU_META[landUse[j]]&&LU_META[landUse[j]].res)nearRes=true;
            }
            if(nearRes)cand2.push(i);
          }
        }
        rng.shuffle(cand2);
        const placed2=[];
        for(const i of cand2){
          if(placed2.length>=nPk)break;
          const x=i%N,y=(i/N)|0;
          if(placed2.some(([px,py])=>dist(px,py,x,y)<4))continue;
          landUse[i]=LU.park;luEra[i]=e;settleOf[i]=s.id;
          placed2.push([x,y]);
        }
      }
      placeCampus(world,s,LU.hospital,4,1.6,4); // the DGH campus
      world.landmarks.push({x:s.x,y:s.y,type:"dgh",name:s.name+" General Hospital",staff:world.sizeClass==="large"?4200:2400,founded:rng.int(1965,1978)});
      // plate-glass university / polytechnic
      const uniP=world.sizeClass==="large"?0.85:world.sizeClass==="medium"?0.5:0.08;
      if(rng.chance(uniP)){
        s.features.uniNew=true;
        const campus=rng.chance(0.5); // campus at edge vs city-centre poly
        placeCampus(world,s,LU.uniNew,campus?7:4,campus?2.2:0.7,4);
        world.landmarks.push({x:s.x,y:s.y,type:"university",name:campus?("University of "+region.label.split(" ")[0]+" at "+s.name):(s.name+" "+(rng.chance(0.5)?"Metropolitan University":"Polytechnic"))});
      }
      // power station: coal region + big water
      if((ind.coal>0.4||regionKey==="east")&&(world.mainRiver||world.hasSea)&&rng.chance(0.55)){
        const down=findDownstream(world,s,4,9);
        if(down){for(const i of down.slice(0,4))place(i,LU.power,4,-1);
          world.landmarks.push({x:down[0]%N,y:(down[0]/N)|0,type:"power",name:nm.settlementName({village:true})+" Power Station"});}
      }
      // sewage works downstream
      const sw=findDownstream(world,s,2,5);
      if(sw){place(sw[0],LU.sewage,4,-1);}
    } else {
      accrete(s,e,n,LU.postwarEstate,{compact:1,jitter:1.2});
      if(s.kind==="pit-village"){/* pit closes 1968-85 */ s.features.pitClosed=true;}
    }
  }

  /* ================= LATE C20 ================= */
  /* de-industrialization: from ~1980 most inner-urban heavy industry closes.
     Sites near the centre redevelop (flats, retail, offices, pocket parks);
     manufacturing that survives relocates to edge estates by the junctions. */
  for(const s of S){
    if(s.kind!=="main"&&s.kind!=="market-town"&&s.kind!=="port-town")continue;
    const innerR=(s.kind==="main"?2.0:1.2)/world.cellKm;
    let closedCells=0;
    // whole SITES close and redevelop coherently, as real works did
    const seenDx=new Uint8Array(N*N);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const i0=idx(x,y);
      if(seenDx[i0]||settleOf[i0]!==s.id)continue;
      if(landUse[i0]!==LU.heavyInd&&landUse[i0]!==LU.mill)continue;
      const lu0=landUse[i0],q=[i0],cells=[];seenDx[i0]=1;
      while(q.length){const i=q.pop();cells.push(i);
        const X=i%N,Y=(i/N)|0;
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const XX=X+dx,YY=Y+dy;if(XX<0||YY<0||XX>=N||YY>=N)continue;
          const j=idx(XX,YY);
          if(!seenDx[j]&&(landUse[j]===LU.heavyInd||landUse[j]===LU.mill)&&settleOf[j]===s.id){seenDx[j]=1;q.push(j);}
        }}
      let cx2=0,cy2=0;for(const c of cells){cx2+=c%N;cy2+=(c/N)|0;}
      cx2/=cells.length;cy2/=cells.length;
      const d=dist(cx2,cy2,s.x,s.y);
      const pClose=d<innerR?0.86:d<innerR*1.7?0.6:0.24;
      if(!rng.chance(pClose))continue;
      closedCells+=cells.length;
      // the whole site becomes ONE thing
      const roll=rng.f();
      let to,era2=5;
      if(roll<0.34){to=LU.modernFlats;era2=6;}
      else if(roll<0.48)to=LU.retailPark;
      else if(roll<0.66)to=LU.lightInd;
      else if(roll<0.84)to=LU.park;
      else {to=LU.cbd;era2=6;}
      if(to===LU.park&&cells.length>3){
        // redevelopment leaves a pocket park, not a park the size of
        // the works it replaced; the rest gets built on
        let cx3=0,cy3=0;for(const i of cells){cx3+=i%N;cy3+=(i/N)|0;}
        cx3/=cells.length;cy3/=cells.length;
        const byC=cells.slice().sort((a2,b2)=>dist(a2%N,(a2/N)|0,cx3,cy3)-dist(b2%N,(b2/N)|0,cx3,cy3));
        for(const i of byC.slice(0,3)){landUse[i]=LU.park;luEra[i]=5;cellPop[i]=0;}
        for(const i of byC.slice(3)){landUse[i]=LU.modernFlats;luEra[i]=6;cellPop[i]=LU_META[LU.modernFlats].dens*haPerCell*0.85;}
      }
      for(const i of (to===LU.park&&cells.length>3)?[]:cells){
        landUse[i]=to;luEra[i]=era2;
        cellPop[i]=LU_META[to].res?LU_META[to].dens*haPerCell*0.85:0;
      }
    }
    // replacement manufacturing capacity on the periphery
    if(closedCells>2)accrete(s,5,Math.ceil(closedCells*0.4),LU.lightInd,{roadPull:9,minD:1.6/world.cellKm,compact:0.4,ind:true,floodOk:true});
  }
  for(const s of S){
    const e=5;
    const n=Math.round(s.resCells*s.profile.late20);
    const mwDir = world.motorway? unitTo(s,nearestPt(world.motorway.pts,s)) : null;
    extendSkeleton(world,s,5,n);closeDevMask(world);accrete(s,e,n,LU.late20,{compact:0.8,jitter:1.6,dir:mwDir,dirW:1.2,roadPull:2,street:true});
    if(s.kind==="main"){
      accrete(s,e,world.sizeClass==="small"?1:2,LU.retailPark,{roadPull:9,minD:1.4/world.cellKm,compact:0.4,ind:true});
      accrete(s,e,world.sizeClass==="large"?2:1,LU.bizPark,{roadPull:8,minD:1.6/world.cellKm,compact:0.4});
      // dock decline
      if(world.sizeClass==="large"){
        for(let i=0;i<N*N;i++)if(landUse[i]===LU.docks&&rng.chance(0.35)){landUse[i]=LU.modernFlats;luEra[i]=6;cellPop[i]=LU_META[LU.modernFlats].dens*haPerCell*0.9;}
      }
    }
    if(s.kind==="resort")accrete(s,e,rng.int(1,3),LU.caravan,{minD:1/world.cellKm,compact:0.5,slopeTol:30});
  }

  /* ================= MODERN ================= */
  for(const s of S){
    const e=6;
    let n=Math.round(s.resCells*s.profile.modern);
    if(s.kind==="main"){
      const flats=Math.round(n*0.35);
      // centre flats
      let placedF=0;
      accrete(s,e,flats,LU.modernFlats,{compact:3.2,adj:c=>c===LU.cbd||c===LU.highStreet||c===LU.civic||c===LU.modernFlats,adjW:7});
      extendSkeleton(world,s,6,n);closeDevMask(world);accrete(s,e,n-flats,LU.modernEstate,{compact:0.7,jitter:1.5,roadPull:2.5,street:true});
      if((ind.hitech||0)>0.5&&(s.features.uniOld||s.features.uniNew)){
        accrete(s,e,2,LU.sciencePark,{minD:1.6/world.cellKm,roadPull:6,compact:0.5});
      }
    } else {
      extendSkeleton(world,s,6,Math.max(1,n));accrete(s,e,Math.max(s.kind==="village"&&rng.chance(0.55)?1:0,n),LU.modernEstate,{compact:1.1,jitter:1,street:true});
    }
  }

  const eraFromNeighbour=(i,cls)=>{
    for(const j of [i-1,i+1,i-N,i+N])if(landUse[j]===cls)return luEra[j];
    return LU_META[cls]?LU_META[cls].era:2;
  };
  /* -------- infill: swallow single-cell holes in the built fabric -------- */
  for(let pass=0;pass<2;pass++){
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=idx(x,y);
      if(landUse[i]!==0||sea[i]||river[i]>=1||slope[i]>0.22)continue;
      const counts=new Map();let nb=0,anySid=-1,anyEra=0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const j=idx(x+dx,y+dy);const lu=landUse[j];
        if(lu>0&&LU_META[lu]){nb++;counts.set(lu,(counts.get(lu)||0)+1);
          if(settleOf[j]>=0){anySid=settleOf[j];anyEra=luEra[j];}}
      }
      if(nb>=6){
        let best=0,bn=0;for(const[lu,n]of counts)if(n>bn){bn=n;best=lu;}
        place(i,best,anyEra===255?2:anyEra,anySid);
      }
    }
  }

  /* -------- de-filament: no 1-cell bands of worked classes --------
     Linear attractors (road rasters, rail) can grow 1-cell-wide spurs
     and stripes of any commercial or industrial class; absorb cells
     with fewer than two same-class 4-neighbours into their dominant
     neighbour class. */
  {
    /* the opening exists to kill banding artefacts in BULK fabric;
       town-centre classes are legitimately small and must not be
       eaten, and nothing may erode back to open farmland */
    const BANDY=new Set([LU.lightInd,LU.heavyInd,LU.mill,LU.bizPark,LU.sciencePark,LU.modernFlats,
      LU.medieval,LU.georgian,LU.victTerrace,LU.victVilla,LU.interwar,LU.postwarEstate,LU.late20,LU.modernEstate]);
    const footprint={};
    for(let i=0;i<N*N;i++)if(landUse[i]&&settleOf[i]>=0)footprint[settleOf[i]]=(footprint[settleOf[i]]||0)+1;
    /* morphological opening with a 2x2 structuring element: a worked
       cell survives only if it belongs to at least one solid 2x2 block
       of its class. This is the standard way to remove sub-kernel
       artefacts, and unlike neighbour-count tests it cannot be defeated
       by combs, stripes, or diagonal chains of any length. */
    for(let pass2=0;pass2<3;pass2++){
      const snap=landUse.slice();
      const solid=(x,y,c)=>snap[idx(x,y)]===c&&snap[idx(x+1,y)]===c&&snap[idx(x,y+1)]===c&&snap[idx(x+1,y+1)]===c;
      let changed=0;
      for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
        const i=idx(x,y);const c=snap[i];
        if(!BANDY.has(c))continue;
        if(solid(x,y,c)||solid(x-1,y,c)||solid(x,y-1,c)||solid(x-1,y-1,c))continue;
        if((footprint[settleOf[i]]||0)<40)continue;   // villages keep their form
        const cnt={};
        for(const j2 of [i-1,i+1,i-N,i+N])
          if(snap[j2]&&snap[j2]!==c&&!sea[j2])cnt[snap[j2]]=(cnt[snap[j2]]||0)+1;
        let best=-1,bn=0;
        for(const k2 in cnt)if(cnt[k2]>bn){bn=cnt[k2];best=+k2;}
        if(best>0){luEra[i]=eraFromNeighbour(i,best);landUse[i]=best;changed++;}   // era travels with class: stale eras striped the age lens
      }
      if(!changed)break;
    }
  }

  /* -------- infill: no 1-wide farmland slivers inside the town --------
     Growth can leave unbuilt strips one cell wide between residential
     blocks; in reality these get built over. Any unbuilt cell pinched
     between residential cells on opposite sides is infilled with the
     majority adjacent residential class. */
  {
    const RES=new Set([LU.medieval,LU.georgian,LU.victTerrace,LU.victVilla,LU.interwar,LU.postwarEstate,LU.late20,LU.modernEstate,LU.modernFlats]);
    for(let pass2=0;pass2<2;pass2++){
      const snap=landUse.slice();
      let changed=0;
      for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
        const i=idx(x,y);
        if(snap[i]!==0||sea[i])continue;
        const L2=RES.has(snap[i-1]),R2=RES.has(snap[i+1]),U2=RES.has(snap[i-N]),D2=RES.has(snap[i+N]);
        if(!((L2&&R2)||(U2&&D2)))continue;
        const cnt={};
        for(const j2 of [i-1,i+1,i-N,i+N])if(RES.has(snap[j2]))cnt[snap[j2]]=(cnt[snap[j2]]||0)+1;
        let best=-1,bn=0;
        for(const k2 in cnt)if(cnt[k2]>bn){bn=cnt[k2];best=+k2;}
        if(best>=0){luEra[i]=eraFromNeighbour(i,best);landUse[i]=best;changed++;}
      }
      if(!changed)break;
    }
  }

  /* -------- urban riversides: embanked, not marsh --------
     Inside the built area, floodplain marsh became quays, mills and
     riverside parks generations ago */
  {
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=idx(x,y);
      if(world.cover[i]!==5)continue;
      let built=0;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
        if(landUse[idx(X,Y)]>0)built++;
      }
      if(built>=8){world.cover[i]=1;if(landUse[i]===0&&built>=14)landUse[i]=LU.park;}
    }
  }

  /* -------- population from FINAL land use --------
     cellPop was accumulated during accretion, so cells reassigned by
     the opening and infill passes carried stale zeros (the true cause
     of pale stripes on the density lens). Rebuild it from the final
     class of every cell, then rescale per settlement to its target. */
  {
    const DENS={[LU.medieval]:55,[LU.georgian]:75,[LU.victTerrace]:industrial?100:70,[LU.victVilla]:30,
      [LU.interwar]:52,[LU.postwarEstate]:64,[LU.late20]:44,[LU.modernEstate]:45,[LU.modernFlats]:120};
    const sums={};
    for(let i=0;i<N*N;i++){
      const d2=DENS[landUse[i]];
      cellPop[i]=d2?d2*haPerCell:0;
      if(d2){const sid=settleOf[i];sums[sid]=(sums[sid]||0)+cellPop[i];}
    }
    // scattered rural population: England's farmed countryside is
    // inhabited (farmsteads, cottages) at roughly 2-6/km2; this gives
    // sparse parishes real residents and real statistics
    {
      const fr2=world.rng.fork("farmsteads");
      /* scattered dwellings are not white noise: farms sit by lanes,
         cottages fringe the villages, and a placed farm sometimes
         brings a neighbour (a hamlet pair) */
      const near=(i,pred,r)=>{const x=i%N,y=(i/N)|0;
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=N||Y>=N)continue;
          if(pred((Y)*N+X))return true;}return false;};
      const eraPick=()=>{const r=fr2.f();return r<0.10?0:r<0.42?1:r<0.72?2:r<0.84?3:r<0.94?4:5;};
      const place=(i)=>{cellPop[i]=2+fr2.int(0,3);landUse[i]=LU.farm;world.luEra[i]=eraPick();};
      for(let i=0;i<N*N;i++){
        if(sea[i]||landUse[i]||cellPop[i])continue;
        const farmed=cover[i]===0||cover[i]===1,upland=cover[i]===3||cover[i]===6;
        if(!farmed&&!upland)continue;
        let p2=farmed?0.010:0.008;
        if(near(i,j=>(world.roadRaster[j]||0)>0,1))p2*=3.0;      // by the lane
        if(near(i,j=>world.settleOf[j]>=0&&world.landUse[j],4))p2*=1.8; // village fringe
        if(fr2.chance(Math.min(0.09,p2))){
          place(i);
          if(fr2.chance(0.35)){                                   // hamlet pair
            const j=i+[1,-1,N,-N][fr2.int(0,3)];
            if(j>=0&&j<N*N&&!sea[j]&&!landUse[j]&&!cellPop[j]&&(cover[j]<=1||cover[j]===3||cover[j]===6))place(j);
          }
        }
      }
    }
    let totPop2=0;
    for(const st of S){
      const k2=sums[st.id]||0;if(!k2)continue;
      const f2=st.target/k2;
      st.pop=0;
      for(let i=0;i<N*N;i++)if(settleOf[i]===st.id&&cellPop[i]>0){cellPop[i]*=f2;st.pop+=cellPop[i];}
      st.pop=Math.round(st.pop);totPop2+=st.pop;
    }
    world.totPop=totPop2;
  }

  /* -------- service guarantee: every real town has its core
     services and, above ~9,000, the edge-of-town retail strip along
     the main road that every English town acquired after 1980 ------ */
  for(const s of S){
    if(s.kind==="main"||s.kind==="village")continue;
    if((s.target||0)<2500)continue;
    // a works village of thousands has its parade of shops (the co-op,
    // the chippy) even without a market charter
    if((s.kind==="pit-village"||s.kind==="mill-village")&&(s.target||0)>2500){
      const sx0=Math.round(s.x),sy0=Math.round(s.y);
      let hs2=0;const R2=8;
      for(let dy=-R2;dy<=R2;dy++)for(let dx=-R2;dx<=R2;dx++){
        const i=idx(clamp(sx0+dx,1,N-2),clamp(sy0+dy,1,N-2));
        if(landUse[i]===LU.highStreet)hs2++;
      }
      for(let r=0;r<7&&hs2<2;r++)for(let dy=-r;dy<=r&&hs2<2;dy++)for(let dx=-r;dx<=r;dx++){
        const i=idx(clamp(sx0+dx,1,N-2),clamp(sy0+dy,1,N-2));
        if(settleOf[i]===s.id&&landUse[i]&&LU_META[landUse[i]]&&LU_META[landUse[i]].res){
          landUse[i]=LU.highStreet;luEra[i]=2;hs2++;
          if(hs2>=2)break;
        }
      }
    }
    const sx=Math.round(s.x),sy=Math.round(s.y);
    const inTown=i=>settleOf[i]===s.id;
    // 1) civic sites (schools, halls, clinics) scale with population
    {
      const wantCiv=Math.max(1,Math.round((s.target||0)/6000));
      let has=0;const R=16;
      for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
        const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
        if(landUse[i]===LU.civic&&inTown(i))has++;
      }
      /* collect the whole ring, then draw at random: scanning north
         to south and stopping at the quota lined every service up on
         the town's northern rim */
      for(let r=1;r<14&&has<wantCiv;r++){
        const ringC=[];
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
          const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
          if(inTown(i)&&landUse[i]&&LU_META[landUse[i]]&&LU_META[landUse[i]].res)ringC.push(i);
        }
        rng.shuffle(ringC);
        for(const i of ringC){
          if(has>=wantCiv)break;
          landUse[i]=LU.civic;luEra[i]=rng.chance(0.5)?2:4;has++;
        }
      }
    }
    // 2) parks and recreation grounds scale (~1 per 9k residents)
    {
      const wantPk=Math.max(1,Math.round((s.target||0)/6500));
      let has=0;const R=18;const spots=[];
      for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
        const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
        if(landUse[i]===LU.park&&inTown(i)){has++;spots.push([i%N,(i/N)|0]);}
      }
      for(let r=2;r<16&&has<wantPk;r++){
        const ringP=[];
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
          const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
          if(landUse[i]||sea[i])continue;
          const x2=i%N,y2=(i/N)|0;
          if(spots.some(([px,py])=>dist(px,py,x2,y2)<4))continue;
          let nearRes=false;
          for(const j of [i-1,i+1,i-N,i+N])if(inTown(j)&&landUse[j]&&LU_META[landUse[j]]&&LU_META[landUse[j]].res)nearRes=true;
          if(nearRes)ringP.push(i);
        }
        rng.shuffle(ringP);
        for(const i of ringP){
          if(has>=wantPk)break;
          const x2=i%N,y2=(i/N)|0;
          if(spots.some(([px,py])=>dist(px,py,x2,y2)<4))continue;
          landUse[i]=LU.park;luEra[i]=4;settleOf[i]=s.id;spots.push([x2,y2]);has++;
        }
      }
    }
    // 3a) a small office or business park by the main road for 18k+
    if((s.target||0)>12000){
      let hasOff=false;const R=18;
      for(let dy=-R;dy<=R&&!hasOff;dy++)for(let dx=-R;dx<=R;dx++){
        const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
        if(landUse[i]===LU.bizPark&&inTown(i)){hasOff=true;break;}
      }
      if(!hasOff){
        let best=-1,bd=1e9;
        for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
          const X=clamp(sx+dx,1,N-2),Y=clamp(sy+dy,1,N-2),i=idx(X,Y);
          if(landUse[i]||sea[i])continue;
          if((world.roadRaster[i]||0)<ROADCLASS.B)continue;
          let fringe=false;
          for(const j of [i-1,i+1,i-N,i+N])if(inTown(j)&&landUse[j])fringe=true;
          if(!fringe)continue;
          const d=dist(X,Y,sx,sy);if(d>5&&d<bd){bd=d;best=i;}
        }
        if(best>=0){
          for(const i of [best,best+1,best+N].filter(i2=>i2>0&&i2<N*N&&!landUse[i2]&&!sea[i2])){
            landUse[i]=LU.bizPark;luEra[i]=5;settleOf[i]=s.id;
          }
        }
      }
    }
    // 3) the retail strip: 2-4 cells on the town's main road at the fringe
    if((s.target||0)>9000){
      let hasRp=false;const R=18;
      for(let dy=-R;dy<=R&&!hasRp;dy++)for(let dx=-R;dx<=R;dx++){
        const i=idx(clamp(sx+dx,1,N-2),clamp(sy+dy,1,N-2));
        if(landUse[i]===LU.retailPark&&inTown(i)){hasRp=true;break;}
      }
      if(!hasRp){
        let best=-1,bd=1e9;
        for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
          const X=clamp(sx+dx,1,N-2),Y=clamp(sy+dy,1,N-2),i=idx(X,Y);
          if(landUse[i]||sea[i])continue;
          if((world.roadRaster[i]||0)<ROADCLASS.B)continue;
          let fringe=false;
          for(const j of [i-1,i+1,i-N,i+N])if(inTown(j)&&landUse[j])fringe=true;
          if(!fringe)continue;
          const d=dist(X,Y,sx,sy);if(d>4&&d<bd){bd=d;best=i;}
        }
        if(best>=0){
          const strip=[best,best+1,best+N,best+N+1].filter(i=>i>0&&i<N*N&&!landUse[i]&&!sea[i]);
          for(const i of strip.slice(0,2+(s.target>20000?2:0))){landUse[i]=LU.retailPark;luEra[i]=5;settleOf[i]=s.id;}
        }
      }
    }
  }

  /* -------- bridgehead: a 100k town does not leave one whole bank
     empty of houses; a terrace quarter grows across the river from
     the centre -------- */
  {
    const m2=world.main;
    if((m2.target||0)>100000&&world.river){
      const mx=Math.round(m2.x),my=Math.round(m2.y);
      // find the near bank direction: nearest major channel to centre
      let bd=1e9,bi=-1;
      for(let i=0;i<N*N;i++)if(world.river[i]>=2){
        const d2=dist(i%N,(i/N)|0,mx,my);if(d2<bd){bd=d2;bi=i;}
      }
      if(bi>=0&&bd<16){
        const rx=bi%N,ry=(bi/N)|0;
        const dxn=Math.sign(rx-mx)||1,dyn=Math.sign(ry-my)||1;
        // seed across the water and accrete a small victorian quarter
        let sx=rx+dxn*3,sy=ry+dyn*3,got=0;
        for(let t=0;t<40&&got<34;t++){
          const X=sx+world.rng.int(-5,5),Y=sy+world.rng.int(-5,5);
          if(X<1||Y<1||X>=N-1||Y>=N-1)continue;
          const i=Y*N+X;
          if(sea[i]||landUse[i]||world.river[i])continue;
          landUse[i]=LU.victTerrace;luEra[i]=2;settleOf[i]=m2.id;got++;
        }
      }
    }
  }

  /* -------- a town of 100k+ has suburban stations, not one -------- */
  {
    const m2=world.main;const N=world.N;
    if((m2.target||m2.pop||0)>100000){
      const lines2=world.rail.filter(L=>!L.mineral&&!L.disused);
      const cand3=[];
      for(const L of lines2)for(let k2=4;k2<L.pts.length-4;k2+=2){
        const [px,py]=L.pts[k2];
        const i2=Math.round(py)*N+Math.round(px);
        if(settleOf[i2]!==m2.id||!landUse[i2])continue;
        const dC=dist(px,py,m2.x,m2.y)*world.cellKm;
        if(dC<1.6||dC>6)continue;
        cand3.push([px,py]);
      }
      let added=0;
      for(const [px,py] of cand3){
        if(added>=2)break;
        if(world.stations.some(st=>dist(st.x,st.y,px,py)<8))continue;
        world.stations.push({x:Math.round(px),y:Math.round(py),name:null,open:true,suburban:true});
        added++;
      }
    }
  }


  /* -------- comb repair: growth banding occasionally leaves streets
     of terraces separated by one-cell empty stripes; a house-row with
     the same class on both sides IS that street -------- */
  for(let pass9=0;pass9<2;pass9++){
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=y*N+x;
      if(landUse[i]||sea[i])continue;
      const L2=landUse[i-1],R2=landUse[i+1],U2=landUse[i-N],D2=landUse[i+N];
      const meta=v=>v&&LU_META[v]&&LU_META[v].res;
      if(L2&&L2===R2&&meta(L2)){landUse[i]=L2;luEra[i]=luEra[i-1];settleOf[i]=settleOf[i-1];continue;}
      if(U2&&U2===D2&&meta(U2)){landUse[i]=U2;luEra[i]=luEra[i-N];settleOf[i]=settleOf[i-N];}
    }
  }

  /* -------- commons trimmed: a common inside the town is a green,
     not a moor; blobs over 8 cells give their overflow back to
     residential infill -------- */
  {
    const seen=new Uint8Array(N*N);
    for(let i0=0;i0<N*N;i0++){
      if(landUse[i0]!==LU.common||seen[i0])continue;
      const blob=[i0];seen[i0]=1;
      for(let h2=0;h2<blob.length;h2++){
        const i=blob[h2],x=i%N,y=(i/N)|0;
        for(const[dx2,dy2]of[[1,0],[-1,0],[0,1],[0,-1]]){
          const X=x+dx2,Y=y+dy2;if(X<0||Y<0||X>=N||Y>=N)continue;
          const j2=idx(X,Y);
          if(landUse[j2]===LU.common&&!seen[j2]){seen[j2]=1;blob.push(j2);}
        }
      }
      if(blob.length>8){
        // keep the 8 nearest the blob centroid
        let cx2=0,cy2=0;for(const i of blob){cx2+=i%N;cy2+=(i/N)|0;}
        cx2/=blob.length;cy2/=blob.length;
        blob.sort((a2,b2)=>dist(a2%N,(a2/N)|0,cx2,cy2)-dist(b2%N,(b2/N)|0,cx2,cy2));
        for(const i of blob.slice(8)){
          const cnt={};
          for(const j2 of [i-1,i+1,i-N,i+N]){
            const c2=landUse[j2];
            if(c2&&c2!==LU.common&&!sea[j2])cnt[c2]=(cnt[c2]||0)+1;
          }
          let best=-1,bn=0;for(const k2 in cnt)if(cnt[k2]>bn){bn=cnt[k2];best=+k2;}
          if(best>=0){luEra[i]=eraFromNeighbour(i,best);landUse[i]=best;}else landUse[i]=0;
        }
      }
    }
  }

  /* -------- ground landmarks on their built cells --------
     Institutions were seeded at settlement centres before their campus
     cells were placed; move each marker to the nearest cell of its
     actual land use so map symbols and panel locations are truthful. */
  {
    const want={infirmary:[LU.hospital],dgh:[LU.hospital],university:[LU.uniOld,LU.uniNew],
      townhall:[LU.civic],stadium:[LU.civic,LU.park],cathedral:[LU.civic,LU.medieval,LU.highStreet]};
    for(const lm of world.landmarks){
      const targets=want[lm.type];if(!targets)continue;
      let bi=-1,bd=1e9;
      for(let y2=0;y2<N;y2++)for(let x2=0;x2<N;x2++){
        const i2b=idx(x2,y2);
        if(!targets.includes(landUse[i2b]))continue;
        const d2=(x2-lm.x)*(x2-lm.x)+(y2-lm.y)*(y2-lm.y);
        if(d2<bd){bd=d2;bi=i2b;}
      }
      if(bi>=0&&bd<400){lm.x=bi%N;lm.y=(bi/N)|0;}
    }
  }

  /* -------- coherence: majority-filter residential classes --------
     Development parcels are larger than one cell; a cell surrounded
     by a different residential class joins it. Removes striping. */
  const RESSET=new Set([LU.medieval,LU.georgian,LU.victTerrace,LU.victVilla,LU.interwar,LU.postwarEstate,LU.late20,LU.modernEstate]);
  // commercial singles join their strongest neighbour class (no confetti)
  const COMM=new Set([LU.cbd,LU.retailPark,LU.modernFlats,LU.lightInd]);
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
    const i=idx(x,y);
    if(!COMM.has(landUse[i]))continue;
    let same=0;const counts=new Map();
    for(const d of[1,-1,N,-N]){const lu=landUse[i+d];
      if(lu===landUse[i])same++;
      if(lu>0&&LU_META[lu])counts.set(lu,(counts.get(lu)||0)+1);}
    if(same===0&&counts.size){
      let best=0,bn=0;for(const[lu,n]of counts)if(n>bn){bn=n;best=lu;}
      landUse[i]=best;luEra[i]=LU_META[best].era;
      cellPop[i]=LU_META[best].res?LU_META[best].dens*haPerCell*rng.range(0.85,1.1):0;
    }
  }
  for(let pass=0;pass<2;pass++){
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=idx(x,y);
      if(!RESSET.has(landUse[i]))continue;
      const counts=new Map();
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const lu=landUse[idx(x+dx,y+dy)];
        if(RESSET.has(lu))counts.set(lu,(counts.get(lu)||0)+1);
      }
      let best=0,bn=0;for(const[lu,n]of counts)if(n>bn){bn=n;best=lu;}
      if(best&&best!==landUse[i]&&bn>=5){
        landUse[i]=best;
        luEra[i]=LU_META[best].era;
        cellPop[i]=LU_META[best].dens*haPerCell*rng.range(0.85,1.15);
      }
    }
  }

  /* -------- normalise populations to targets -------- */
  for(const s of S){
    let tot=0;
    for(let i=0;i<N*N;i++)if(settleOf[i]===s.id)tot+=cellPop[i];
    if(tot>0){const k=s.target/tot;
      for(let i=0;i<N*N;i++)if(settleOf[i]===s.id)cellPop[i]*=k;
      s.pop=s.target;}
    else s.pop=0;
  }
  // absorption: settlement built area touching main built area
  for(const s of S){
    if(s.kind==="main")continue;
    s.absorbed = dist(s.x,s.y,world.main.x,world.main.y)*world.cellKm < (world.sizeClass==="large"?3.6:world.sizeClass==="medium"?2.8:2.2);
  }

  /* -------- jobs raster -------- */
  const jobs=world.jobs=new Float32Array(N*N);
  let jtot=0;
  for(let i=0;i<N*N;i++){const m=LU_META[landUse[i]];if(m&&m.jobs){jobs[i]=m.jobs*haPerCell*rng.range(0.8,1.2);jtot+=jobs[i];}}
  const totPop=S.reduce((a,s)=>a+s.pop,0);
  const targetJobs=totPop*0.44;
  if(jtot>0){const k=targetJobs/jtot;for(let i=0;i<N*N;i++)jobs[i]*=k;}
  world.totPop=totPop;
}

function findDownstream(world,s,minKm,maxKm){
  const {N}=world;const idx=(x,y)=>y*N+x;
  // walk down the flow from the town centre; return river-adjacent flat cells minKm..maxKm downstream
  let i=idx(s.x,s.y),steps=0;const out=[];
  const seen=new Set();
  while(i>=0&&steps<600&&!world.sea[i]){
    if(seen.has(i))break;seen.add(i);
    const x=i%N,y=(i/N)|0;
    const d=dist(x,y,s.x,s.y)*world.cellKm;
    if(d>maxKm)break;
    if(d>minKm&&world.river[i]>=2){
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const X=x+dx,Y=y+dy;if(X<1||Y<1||X>=N-1||Y>=N-1)continue;const j=idx(X,Y);
        if(!world.sea[j]&&!world.river[j]&&world.landUse[j]===0&&world.slope[j]<0.05){out.push(j);if(out.length>=3)return out;}
      }
    }
    i=world.flowTo[i];steps++;
  }
  return out.length?out:null;
}
function nearestPt(pts,s){let b=pts[0],bd=1e9;for(const p of pts){const d=dist(p[0],p[1],s.x,s.y);if(d<bd){bd=d;b=p;}}return b;}
function unitTo(s,p){const dx=p[0]-s.x,dy=p[1]-s.y;const l=Math.hypot(dx,dy)||1;return[dx/l,dy/l];}
