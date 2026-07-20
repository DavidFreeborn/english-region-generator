"use strict";
/* ============================================================
   RENDERER
   OS-sheet visual grammar: a soft raster base (land cover +
   hillshade) scaled up with smoothing, with all linework -
   contours, rivers, roads, rail, boundaries, labels - drawn as
   crisp vectors at display resolution. Contours are extracted
   by marching squares from the elevation grid at 10 m
   (index every 50 m), in the OS contour brown.
   ============================================================ */

const PAL={
  paper:"#f1eee1", arable:"#f1eee1", pasture:"#dde6c8", wood:"#c2dba2", woodDark:"#9fbf85",
  moor:"#e5d7b2", heath:"#e0d5b4", marsh:"#dce8dd", beach:"#f4e9c4", rough:"#e2dfc6",
  seaDeep:"#b9d4e4", sea:"#c6dcea", water:"#8fb6d0", waterLine:"#5d8cb0",
  contour:"#c08552", contourIndex:"#a96f3f",
  built:"#d8d2c2", builtEdge:"#b8b09c",
  mwy:"#4b7fb5", mwyCase:"#2d5b8a", aRoad:"#d8626a", aCase:"#a83b44", bRoad:"#e8a15e", bCase:"#b87838",
  minor:"#f2e3a8", minorCase:"#a99f7e", rail:"#4a4a48", ink:"#26323c", inkSoft:"#5a6672",
  red:"#a33b2e",
};

function hexToRgb(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
function mixc(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}

/* ---------- viridis-ish and diverging ramps for lenses ---------- */
const RAMPS={
  heat:["#f5efdc","#ecd9a0","#dfae6b","#c97a4e","#a84c3f","#7d2e38"],
  cool:["#f2efe2","#d3e0d5","#a8c8c2","#77a8ac","#4d8391","#2f5b6e"],
  div:["#7d2e38","#c97a4e","#efe6cc","#77a8ac","#2f5b6e"],
  green:["#f3f0de","#dfe6bf","#b9d09a","#8ab077","#5b8a58","#33613c"],
  grey:["#efece0","#d5d1c4","#b6b2a5","#918e83","#6a6860","#454440"],
};
function ramp(name,t){
  const R=RAMPS[name];t=clamp(t,0,1)*(R.length-1);
  const i=Math.min(R.length-2,Math.floor(t));
  const c=mixc(hexToRgb(R[i]),hexToRgb(R[i+1]),t-i);
  return c;
}

/* ---------- hillshade ---------- */
function computeShade(world){
  const {N,elev,sea}=world;
  const sh=new Float32Array(N*N);
  const az=Math.PI*1.25, alt=Math.PI/4.6;   // NW light, OS convention
  const lx=Math.cos(alt)*Math.cos(az),ly=Math.cos(alt)*Math.sin(az),lz=Math.sin(alt);
  const zs=2.4/ (world.cellKm*1000);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x;
    if(sea[i]){sh[i]=0.5;continue;}
    const xm=Math.max(0,x-1),xp=Math.min(N-1,x+1),ym=Math.max(0,y-1),yp=Math.min(N-1,y+1);
    const dzdx=(elev[y*N+xp]-elev[y*N+xm])*zs*0.5,dzdy=(elev[yp*N+x]-elev[ym*N+x])*zs*0.5;
    const len=Math.sqrt(dzdx*dzdx+dzdy*dzdy+1);
    sh[i]=clamp((-dzdx*lx-dzdy*ly+lz)/len,0,1);
  }
  return sh;
}

/* ---------- base raster ---------- */
function paintBase(world){
  const {N,cover,sea,elev,landUse}=world;
  const cv=document.createElement("canvas");cv.width=N;cv.height=N;
  const ctx=cv.getContext("2d");
  const img=ctx.createImageData(N,N);
  const shade=world._shade||(world._shade=computeShade(world));
  const cs={
    0:hexToRgb(PAL.arable),1:hexToRgb(PAL.pasture),2:hexToRgb(PAL.wood),3:hexToRgb(PAL.moor),
    4:hexToRgb(PAL.heath),5:hexToRgb(PAL.marsh),6:hexToRgb(PAL.beach),7:hexToRgb(PAL.rough),
  };
  const builtC=hexToRgb(PAL.built);
  const seaC=hexToRgb(PAL.sea),seaD=hexToRgb(PAL.seaDeep);
  for(let i=0;i<N*N;i++){
    let c;
    if(sea[i]){
      const d=clamp(-world.filled[i]/8,0,1);
      c=mixc(seaC,seaD,d);
    } else {
      const lu=landUse[i];
      if(lu>0&&LU_META[lu]){
        if(lu===LU.park||lu===LU.common)c=hexToRgb("#cfe0b4");
        else if(lu===LU.cemetery||lu===LU.allotment)c=hexToRgb("#d7e2c0");
        else if(lu===LU.golf)c=hexToRgb("#d9e5bd");
        else if(lu===LU.reservoir)c=hexToRgb(PAL.water);
        else if(lu===LU.heavyInd||lu===LU.docks||lu===LU.lightInd||lu===LU.power)c=hexToRgb("#c9c2b8");
        else c=builtC;
      }
      else c=cs[cover[i]]||hexToRgb(PAL.paper);
      // altitude tint on open moorland
      if(!landUse[i]&&(cover[i]===3||cover[i]===4)){
        const t=clamp((elev[i]-200)/450,0,1);
        c=mixc(c,hexToRgb("#dcc9a2"),t*0.6);
      }
      const s=shade[i];
      c=mixc(c,[30,34,38],(0.5-s)*0.55);       // shadows
      c=mixc(c,[255,255,250],Math.max(0,s-0.62)*0.35);
    }
    img.data[i*4]=c[0];img.data[i*4+1]=c[1];img.data[i*4+2]=c[2];img.data[i*4+3]=255;
  }
  ctx.putImageData(img,0,0);
  return cv;
}

/* ---------- lens rasters ---------- */
function lensColor(world,lens,i,state){
  const {sea,landUse,cellPop}=world;
  const wi=world.wardOf[i];const w=wi>=0?world.wards[wi]:null;
  switch(lens){
    case "geology":{
      if(sea[i])return null;
      const L=LITH[world.lithIndex[world.stratum[i]]];
      return hexToRgb(L.color);
    }
    case "relief":{
      if(sea[i])return null;
      if(!world._eRange){const NN=world.N*world.N;let mn=1e9,mx=-1e9;for(let k2=0;k2<NN;k2++)if(!world.sea[k2]){mn=Math.min(mn,world.elev[k2]);mx=Math.max(mx,world.elev[k2]);}world._eRange=[mn,Math.max(mx,mn+40)];}
      const [mn2,mx2]=world._eRange;
      const k3=clamp((world.elev[i]-mn2)/(mx2-mn2),0,1);
      // green valleys through buff to high brown, full county range
      const stops=[[168,198,150],[214,220,168],[233,220,168],[214,180,128],[170,130,92],[128,96,72]];
      const t2=k3*(stops.length-1),si=Math.min(stops.length-2,t2|0),f2=t2-si;
      return [0,1,2].map(c2=>Math.round(stops[si][c2]+(stops[si+1][c2]-stops[si][c2])*f2));
    }
    case "landuse":{
      if(world.river&&world.river[i]>=2&&!landUse[i])return [127,178,208];
      if(sea[i])return null;
      const lu=landUse[i];
      if(lu)return hexToRgb(LU_META[lu].col);
      // rural land use from cover
      const RC={0:"#efe6c2",1:"#d6e4bc",2:"#8fbf7a",3:"#cbb98f",4:"#c9bfa0",5:"#a8c2b0",6:"#e8dcb0",7:"#d8d2b2"};
      return hexToRgb(RC[world.cover[i]]||"#e8e4d2");
    }
    case "function":{
      const lu=landUse[i];
      if(sea[i]||!lu||!LU_FUNC[lu])return null;
      return hexToRgb(FUNC_COL[LU_FUNC[lu]]);
    }
    case "era":{
      const lu=landUse[i];
      if(sea[i]||!lu||!LU_META[lu].res)return null;
      const e=world.luEra[i];
      return hexToRgb((ERAS[e]&&ERAS[e].color)||"#888");   // one palette: the legend's
    }
    case "density":{
      if(cellPop[i]<=0)return null;
      const d=cellPop[i]/(world.cellKm*world.cellKm*100);
      return ramp("heat",clamp(Math.log1p(d)/Math.log1p(170),0,1));
    }
    case "age":       if(!w||cellPop[i]<=0||!landUse[i])return null; return ramp("heat",clamp((w.medianAge-30)/18,0,1));
    case "degree": if(!w||cellPop[i]<=0||!landUse[i])return null; return ramp("cool",clamp((w.degree-0.08)/0.6,0,1));
    case "income":{
      if(!w||cellPop[i]<=0||!landUse[i])return null;
      if(!world._iRange){let mn=1e9,mx=0;for(const w4 of world.wards)if(w4.income&&!w4.noResidents){mn=Math.min(mn,w4.income);mx=Math.max(mx,w4.income);}world._iRange=[mn,Math.max(mx,mn+4000)];}
      return ramp("cool",clamp((w.income-world._iRange[0])/(world._iRange[1]-world._iRange[0]),0,1));
    }
    case "soil":{
      if(sea[i])return null;
      const SC=[[165,116,60],[220,210,180],[216,180,120],[150,130,90],[140,170,120],[70,60,50],[180,160,140]];
      return SC[world.soilClass?world.soilClass[i]:0]||SC[0];
    }
    case "flood":{
      if(sea[i])return null;
      const r2=world.floodRisk?world.floodRisk[i]:0;
      if(r2<0.12)return null;
      const k2=clamp(r2,0,1);
      return [200-170*k2,220-140*k2,240-80*k2];
    }
    case "price":{
      if(wi<0)return null;const wd3=world.wards[wi];
      if(!wd3||!wd3.price||wd3.noResidents||!cellPop[i]||!landUse[i])return null;
      if(!world._pRange){let mn=1e12,mx=0;for(const w4 of world.wards)if(w4.price&&!w4.noResidents){mn=Math.min(mn,w4.price);mx=Math.max(mx,w4.price);}world._pRange=[mn,Math.max(mx,mn+50000)];}
      const k3=clamp((wd3.price-world._pRange[0])/(world._pRange[1]-world._pRange[0]),0,1);
      // pale straw -> deep chestnut, full gradient
      return [Math.round(247-157*k3),Math.round(236-184*k3),Math.round(192-176*k3)];
    }
    case "le":{
      if(wi<0)return null;const wd3=world.wards[wi];
      if(!wd3||wd3.noResidents||!wd3.leM)return null;
      const v3=(wd3.leM+wd3.leF)/2,k3=clamp((v3-76)/10,0,1);
      return [235-150*k3,120+110*k3,110+40*k3];
    }
    case "imd":       if(!w||cellPop[i]<=0||!landUse[i])return null; return ramp("heat",clamp((10-w.imd)/9,0,1));
    case "crime":     if(!w||cellPop[i]<=0||!landUse[i])return null; return ramp("heat",clamp((w.crime.total-30)/170,0,1));
    case "le":        if(!w||cellPop[i]<=0||!landUse[i])return null; return ramp("div",clamp((w.leM-72)/14,0,1));
    case "gva":       if(!w)return null; return (cellPop[i]>0&&landUse[i])||world.jobs[i]>0?ramp("cool",clamp((w.gvaPerHead-9000)/60000,0,1)):null;
    case "traffic":{
      const v=world.trafficRaster?world.trafficRaster[i]:0;
      if(v<25)return null;
      return ramp("heat",clamp(Math.log1p(v)/Math.log1p(4200),0,1));
    }
    case "air":  if(sea[i])return null; return ramp("heat",clamp((world.air[i]-5)/28,0,1));
    case "noise":if(sea[i])return null; return world.noise[i]<45?null:ramp("heat",clamp((world.noise[i]-42)/33,0,1));
    case "bio":  return ramp("green",clamp(world.bio[i]/100,0,1));
    case "politics":{
      if(wi<0)return null;
      const wd2=world.wards[wi];
      const V=wd2&&(wd2.votesByEra?wd2.votesByEra[(state&&state.voteEra)||2026]:wd2.votes);
      if(!V)return null;
      let win2="Lab",bv2=0;for(const k2 in V)if(V[k2]>bv2){bv2=V[k2];win2=k2;}
      if(!cellPop[i]&&!wd2.urban)return PARTY_TINT[win2];
      return PARTY_COL[win2]||null;
    }
    case "schools":{
      if(wi<0)return null;const wds=world.wards[wi];
      if(!wds||wds.schoolPressure==null||wds.noResidents)return null;
      if(!world._sRange){let mn=9,mx=0;for(const w4 of world.wards)if(w4.schoolPressure!=null&&!w4.noResidents){mn=Math.min(mn,w4.schoolPressure);mx=Math.max(mx,w4.schoolPressure);}world._sRange=[mn,Math.max(mx,mn+0.08)];}
      const k4=clamp((wds.schoolPressure-world._sRange[0])/(world._sRange[1]-world._sRange[0]),0,1);
      return [Math.round(233-(233-138)*k4),Math.round(242-(242-43)*k4),Math.round(228-(228-30)*k4)];
    }
    case "health":{
      if(wi<0)return null;const wdh=world.wards[wi];
      if(!wdh||wdh.hospMin==null||wdh.noResidents)return null;
      const k5=clamp((wdh.hospMin-6)/40,0,1);
      return [Math.round(230-(230-14)*k5),Math.round(240-(240-90)*k5),Math.round(242-(242-110)*k5)];
    }
    case "access":{
      if(wi<0)return null;
      const wd3a=world.wards[wi];
      if(!wd3a||wd3a.noResidents)return null;
      const mode2=(state&&state.accessMode)||"overall";
      const pt=clamp(wd3a.ptAccess??((wd3a.busPerHour||0)/16),0,1);
      const rd=clamp(wd3a.roadAccess||0,0,1);
      let acc=mode2==="pt"?pt:mode2==="road"?rd:clamp(pt*0.55+rd*0.45,0,1);acc=Math.pow(acc,0.75);
      const cB=mode2==="road"?[122,56,28]:mode2==="pt"?[16,86,140]:[24,118,66];
      return [Math.round(236-(236-cB[0])*acc),Math.round(233-(233-cB[1])*acc),Math.round(228-(228-cB[2])*acc)];
    }
    case "eth":{
      if(wi<0)return null;
      const wd3=world.wards[wi];
      if(!wd3||!wd3.eth||wd3.noResidents)return null;
      const GC={1:[120,104,180],2:[20,120,80],3:[220,120,30],4:[160,40,90],5:[40,90,170],6:[150,90,40],7:[200,60,60],8:[90,150,60],9:[120,120,120]};
      const mode=(state&&state.ethMode)||"largest";
      if(mode==="group"){
        const g0=(state&&state.ethGroup)??3;
        if(!world._ethRange)world._ethRange={};
        if(!world._ethRange[g0]){
          let mn=100,mx=0;
          for(const wd4 of world.wards){
            if(!wd4.eth||wd4.noResidents)continue;
            const v4=g0===0?(100-wd4.diversity):wd4.eth[g0]||0;
            mn=Math.min(mn,v4);mx=Math.max(mx,v4);
          }
          world._ethRange[g0]=[mn,Math.max(mx,mn+2)];
        }
        const [mn0,mx0]=world._ethRange[g0];
        const sh=g0===0?(100-wd3.diversity):wd3.eth[g0]||0;
        const base0=g0===0?[110,100,90]:GC[g0];
        const k0=clamp((sh-mn0)/(mx0-mn0),0.05,1);
        return [Math.round(239-(239-base0[0])*k0),Math.round(236-(236-base0[1])*k0),Math.round(226-(226-base0[2])*k0)];
      }
      if(mode==="largest"&&wd3.diversity<50)return [232,226,214];   // White British largest
      let g3=1,b3=0;for(let g2=1;g2<10;g2++)if(wd3.eth[g2]>b3){b3=wd3.eth[g2];g3=g2;}
      const base2=GC[g3]||[120,120,120];
      const k3=b3>=15?1:b3>=5?0.85:0.62;
      return [Math.round(239-(239-base2[0])*k3),Math.round(236-(236-base2[1])*k3),Math.round(226-(226-base2[2])*k3)];
    }
    case "wards":{
      if(wi<0)return null;
      const wd=world.wards[wi];
      if(!wd)return null;
      if(wd.urban){const hue=(wi*137.508)%360;return hslToRgb(hue/360,0.46,0.68);}
      {const SG=[[224,231,201],[233,222,205],[214,226,222],[230,219,222],[221,221,235],[227,229,188]];return SG[wi%6];}
    }
  }
  return null;
}
function hslToRgb(h,s,l){
  const f=(n)=>{const k=(n+h*12)%12;const a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};
  return[f(0),f(8),f(4)];
}
const PARTY_COL={Lab:[213,0,0],Con:[0,87,184],Ref:[0,184,162],LD:[250,166,26],Grn:[2,169,91],Oth:[150,150,150]};
const PARTY_TINT={Lab:[235,180,180],Con:[172,200,235],Ref:[172,228,218],LD:[244,220,178],Grn:[178,224,201],Oth:[210,210,210]};
function paintLens(world,lens,state){
  const {N}=world;
  const cv=document.createElement("canvas");cv.width=N;cv.height=N;
  const ctx=cv.getContext("2d");
  const img=ctx.createImageData(N,N);
  const alpha=({geology:200,relief:190,landuse:225,era:230,density:210,traffic:215,air:200,noise:205,bio:195,wards:180})[lens]??205;
  for(let i=0;i<N*N;i++){
    const c=lensColor(world,lens,i,state);
    if(!c)continue;
    img.data[i*4]=c[0];img.data[i*4+1]=c[1];img.data[i*4+2]=c[2];img.data[i*4+3]=alpha;
  }
  ctx.putImageData(img,0,0);
  return cv;
}

/* ---------- contours by marching squares ---------- */
function contourSegments(world,interval){
  const {N,elev,sea}=world;
  const segs=[]; // {x1,y1,x2,y2,index:boolean}
  const zmax=650;
  for(let level=interval;level<zmax;level+=interval){
    const isIdx=level%(interval*5)===0;
    for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){
      const i00=y*N+x,i10=i00+1,i01=i00+N,i11=i01+1;
      if(sea[i00]&&sea[i10]&&sea[i01]&&sea[i11])continue;
      const v=[elev[i00],elev[i10],elev[i11],elev[i01]];
      let m=0;
      if(v[0]>level)m|=1;if(v[1]>level)m|=2;if(v[2]>level)m|=4;if(v[3]>level)m|=8;
      if(m===0||m===15)continue;
      const it=(a,b)=>(level-a)/(b-a);
      const pts={
        t:[x+it(v[0],v[1]),y], r:[x+1,y+it(v[1],v[2])],
        b:[x+it(v[3],v[2]),y+1], l:[x,y+it(v[0],v[3])],
      };
      const CASES={1:["l","t"],2:["t","r"],3:["l","r"],4:["r","b"],6:["t","b"],7:["l","b"],
                   8:["b","l"],9:["b","t"],11:["b","r"],12:["r","l"],13:["r","t"],14:["t","l"],
                   5:["l","t","r","b"],10:["t","r","b","l"]};
      const cc=CASES[m];if(!cc)continue;
      for(let k=0;k<cc.length;k+=2){
        const p=pts[cc[k]],q=pts[cc[k+1]];
        segs.push({x1:p[0],y1:p[1],x2:q[0],y2:q[1],idx:isIdx,level});
      }
    }
  }
  return segs;
}

/* ---------- full scene draw ---------- */
function drawScene(cv,world,state){
  world._labelBoxes=[];
  const ctx=cv.getContext("2d");
  const W=cv.width,H=cv.height,{N}=world;
  const view=state.view||{z:1,tx:0,ty:0};
  const Z=view.z;
  const sheet=Math.min(W,H);                     // square sheet fits the canvas
  const sc=sheet/N;                              // px per cell at z=1
  const P=p=>p*sc;                               // cell->px (pre-transform)
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle=PAL.paperOut||"#dfe6ea";
  ctx.fillRect(0,0,W,H);
  ctx.setTransform(Z,0,0,Z,view.tx,view.ty);
  const tScale=1/Math.pow(Z,0.6);                // labels grow slower than the map
  state._tScale=tScale;

  /* base raster, smoothed */
  if(!world._base)world._base=paintBase(world);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(world._base,0,0,sheet,sheet);
  if(state.lens==="transport"){ctx.fillStyle="rgba(242,239,230,0.45)";ctx.fillRect(0,0,sheet,sheet);}

  const lens=state.lens;
  const plainMap=lens==="map";
  const transport=lens==="transport";

  /* contours (on map & relief & geology) */
  if(plainMap||lens==="relief"||lens==="bio"){
    if(!world._contours)world._contours=contourSegments(world,10);
    ctx.lineCap="round";
    for(const pass of[0,1]){
      ctx.beginPath();
      for(const s of world._contours){
        if((s.idx?1:0)!==pass)continue;
        ctx.moveTo(P(s.x1+0.5),P(s.y1+0.5));ctx.lineTo(P(s.x2+0.5),P(s.y2+0.5));
      }
      ctx.strokeStyle=pass?PAL.contourIndex:PAL.contour;
      ctx.globalAlpha=pass?0.62:0.42;
      ctx.lineWidth=pass?1.1:0.55;
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  /* lens overlay: the base map is washed back so the data reads as the
     figure and the topography as faint ground */
  if(!plainMap&&!transport){
    ctx.fillStyle=["age","degree","income","price","gva","imd","crime","le","density","eth","politics","access","relief","soil","flood","schools","health"].includes(lens)?"rgba(244,241,232,0.8)":"rgba(244,241,232,0.66)";
    ctx.fillRect(0,0,sheet,sheet);
    if(!world._lensCache)world._lensCache={};
    if(!world._lensCache[lens])world._lensCache[lens]=paintLens(world,lens,state);
    ctx.imageSmoothingEnabled=false;   // every data lens renders crisp cells
    ctx.globalAlpha=0.95;
    ctx.drawImage(world._lensCache[lens],0,0,sheet,sheet);
    ctx.globalAlpha=1;
    // orientation context above the data: faint roads and railways
    if(state.showRoads!==false){
      ctx.save();ctx.globalAlpha=0.5;ctx.strokeStyle="#6b6b70";ctx.lineCap="round";
      for(const r of world.roads){
        if(!["motorway","Adual","A","B"].includes(r.cls))continue;
        ctx.lineWidth=r.cls==="motorway"?1.6:r.cls==="B"?0.8:1.1;
        drawPoly(ctx,r.draw||r.pts,sc);
      }
      ctx.restore();
    }
    if(state.showRivers!==false){
      ctx.save();ctx.globalAlpha=0.6;ctx.strokeStyle="#57a0c4";ctx.lineCap="round";
      for(const r of world.rivers)if(r.drawRuns)for(const rr of r.drawRuns){
        ctx.lineWidth=rr.cls>=3?2.2:rr.cls===2?1.4:0.8;
        drawPoly(ctx,rr.pts,sc);
      }
      ctx.restore();
    }
    
    if(state.showRail!==false){
      ctx.save();ctx.globalAlpha=0.55;ctx.strokeStyle="#2f2f33";ctx.lineWidth=0.9;
      for(const line of world.rail){if(line.mineral)continue;
        if(line.disused)ctx.setLineDash([4,3]);else ctx.setLineDash([]);
        drawPoly(ctx,line.draw||line.pts,sc);}
      ctx.setLineDash([]);ctx.restore();
    }
    ctx.imageSmoothingEnabled=true;
  }

  /* rivers */
  ctx.lineCap="round";ctx.lineJoin="round";
  for(const r of world.rivers){
    ctx.lineCap="round";ctx.lineJoin="round";
    if(r.drawRuns){
      const wBase=Math.min(1.6,Math.max(0.7,sc/4));
      // banks first: a soft wide wash so the channel sits IN the land
      for(const pass2 of [0,1]){
      ctx.strokeStyle=pass2===0?"rgba(178,214,232,0.6)":"#57a0c4";
      for(const rr of r.drawRuns){
        const w0=(rr.cls>=3?3.4:rr.cls===2?2.2:1.2)*wBase*(pass2===0?2.1:1);
        if(rr.mouth&&rr.pts.length>6){
          // draw in two parts so the final reach widens toward the sea
          const cut=rr.pts.length-6;
          ctx.lineWidth=w0;drawPoly(ctx,rr.pts.slice(0,cut+1),sc);
          for(let k2=cut;k2<rr.pts.length-1;k2++){
            ctx.lineWidth=w0*(1+1.2*(k2-cut)/(rr.pts.length-1-cut));
            drawPoly(ctx,[rr.pts[k2],rr.pts[k2+1]],sc);
          }
        }else{ctx.lineWidth=w0;drawPoly(ctx,rr.pts,sc);}
      }}
      continue;
    }
    for(const i of r.cells){
      const j=world.flowTo[i];if(j<0)continue;
      const cl=world.river[i];
      if(cl<1)continue;
      ctx.lineWidth=cl===1?0.9*sc*0.35:cl===2?1.6*sc*0.4:2.6*sc*0.5;
      ctx.beginPath();
      ctx.moveTo(P((i%N)+0.5),P(((i/N)|0)+0.5));
      ctx.lineTo(P((j%N)+0.5),P(((j/N)|0)+0.5));
      ctx.stroke();
    }
  }

  /* disused rail: green corridor dashes under roads */
  for(const line of (state.showRail===false?[]:world.rail)){
    if(!line.disused)continue;
    ctx.strokeStyle="rgba(80,86,80,0.8)";ctx.lineWidth=1.3;ctx.setLineDash([5,3]);
    drawPoly(ctx,line.draw||line.pts,sc);ctx.setLineDash([]);
  }


  /* geology lens: formation boundaries + fault traces */
  if(lens==="geology"){
    ctx.strokeStyle="rgba(38,50,60,0.5)";ctx.lineWidth=0.6;
    ctx.beginPath();
    for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){
      const i=y*N+x;
      if(world.sea[i])continue;
      if(!world.sea[i+1]&&world.stratum[i+1]!==world.stratum[i]){ctx.moveTo(P(x+1),P(y));ctx.lineTo(P(x+1),P(y+1));}
      if(!world.sea[i+N]&&world.stratum[i+N]!==world.stratum[i]){ctx.moveTo(P(x),P(y+1));ctx.lineTo(P(x+1),P(y+1));}
    }
    ctx.stroke();
    // fault traces: heavy lines with tick marks on the downthrow side
    ctx.save();ctx.beginPath();ctx.rect(0,0,sheet,sheet);ctx.clip();
    for(const F of (world.faults||[])){
      ctx.strokeStyle="rgba(120,30,30,0.85)";ctx.lineWidth=1.6;
      const tx=-F.ny,ty=F.nx;   // along-fault direction
      ctx.beginPath();
      ctx.moveTo(P((F.px-tx)*N),P((F.py-ty)*N));
      ctx.lineTo(P((F.px+tx)*N),P((F.py+ty)*N));
      ctx.stroke();
    }
    ctx.restore();
  }

  /* field pattern: hedgerows / walls on the farmed matrix */
  if((plainMap||lens==="bio")&&world.hedge){
    ctx.save();
    ctx.globalAlpha=plainMap?0.34:0.5;
    ctx.strokeStyle=world.wallCountry?"#8f8878":"#7a9464";
    ctx.lineWidth=0.45;
    ctx.beginPath();
    for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=y*N+x;
      if(!world.parcel||world.parcel[i]<0)continue;
      if(world.parcel[i+1]>=0&&world.parcel[i+1]!==world.parcel[i]){ctx.moveTo(P(x+1),P(y));ctx.lineTo(P(x+1),P(y+1));}
      if(world.parcel[i+N]>=0&&world.parcel[i+N]!==world.parcel[i]){ctx.moveTo(P(x),P(y+1));ctx.lineTo(P(x+1),P(y+1));}
    }
    ctx.stroke();ctx.restore();
  }

  /* roads: casing then fill (toggle: showRoads), minor->motorway */
  const order=["lane","minor","B","A","Adual","motorway"];
  const spec={
    lane:{w:1.0,fill:PAL.minor,case:"rgba(140,130,110,0.5)"},
    minor:{w:1.6,fill:PAL.minor,case:PAL.minorCase},
    B:{w:2.2,fill:PAL.bRoad,case:PAL.bCase},
    A:{w:2.6,fill:PAL.aRoad,case:PAL.aCase},
    Adual:{w:3.2,fill:PAL.aRoad,case:PAL.aCase},
    motorway:{w:4.0,fill:PAL.mwy,case:PAL.mwyCase},
  };
  const roadAlpha=(plainMap||transport)?1:0.45;
  ctx.globalAlpha=roadAlpha;
  if(state.showRoads!==false){
  for(const cls of order){
    for(const r of world.roads){
      if(r.cls!==cls)continue;
      ctx.strokeStyle=spec[cls].case;ctx.lineWidth=spec[cls].w+1.1;
      drawPoly(ctx,r.draw||r.pts,sc);
    }
  }
  for(const cls of order){
    for(const r of world.roads){
      if(r.cls!==cls)continue;
      ctx.strokeStyle=spec[cls].fill;ctx.lineWidth=spec[cls].w;
      drawPoly(ctx,r.draw||r.pts,sc);
      if(cls==="motorway"){
        ctx.save();ctx.strokeStyle="rgba(255,255,255,0.95)";ctx.lineWidth=1.0;
        ctx.setLineDash([4,3]);drawPoly(ctx,r.draw||r.pts,sc);ctx.setLineDash([]);ctx.restore();
      }
    }
  }  }

  ctx.globalAlpha=1;


  /* transport lens: rail lines coloured by their maximum segment load */
  if(transport){
    ctx.save();ctx.lineCap="round";
    for(const line of world.rail){
      if(line.disused||line.mineral||!line.segments)continue;
      for(const g2 of line.segments){
        const lf=g2.lf;
        ctx.strokeStyle=lf>=0.85?"#c0392b":lf>=0.6?"#d68910":"#1e8449";
        ctx.lineWidth=2.6;
        const pts2=line.pts.slice(g2.a,g2.b+1);
        if(pts2.length>1)drawPoly(ctx,pts2,sc);
      }
    }
    ctx.restore();
  }

  /* traffic lens: flow-scaled strokes on the graph */
  if(lens==="traffic"&&world.graph){
    for(const e of world.graph.edges){
      if(e.vol<40)continue;
      const a=world.graph.nodes[e.a],b=world.graph.nodes[e.b];
      const t=clamp(e.vc,0,1.35);
      const c=ramp("heat",clamp(t/1.3,0,1));
      ctx.strokeStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
      ctx.lineWidth=clamp(Math.sqrt(e.vol)/14,0.8,6);
      ctx.beginPath();
      ctx.moveTo(P((a%N)+0.5),P(((a/N)|0)+0.5));
      ctx.lineTo(P((b%N)+0.5),P(((b/N)|0)+0.5));
      ctx.stroke();
    }
  }

  /* railways (open): black with sleepers */
  for(const line of (state.showRail===false?[]:world.rail)){
    if(line.disused)continue;
    ctx.strokeStyle=PAL.rail;ctx.lineWidth=1.4;
    drawPoly(ctx,line.draw||line.pts,sc);
    // sleeper ticks
    ctx.lineWidth=1;
    for(let k=4;k<line.pts.length-4;k+=6){
      const [x1,y1]=line.pts[k-1],[x2,y2]=line.pts[k+1];
      const mx=P((line.pts[k][0])+0.5),my=P((line.pts[k][1])+0.5);
      const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy)||1;
      const nx=-dy/l*3,ny=dx/l*3;
      ctx.beginPath();ctx.moveTo(mx-nx,my-ny);ctx.lineTo(mx+nx,my+ny);ctx.stroke();
    }
  }
  /* stations */
  for(const st of world.stations){
    if(!st.open)continue;
    if(!plainMap&&!transport)break;
    ctx.fillStyle="#fff";ctx.strokeStyle=PAL.rail;ctx.lineWidth=1.3;
    ctx.beginPath();ctx.arc(P(st.x+0.5),P(st.y+0.5),transport?4.2:3.4,0,7);ctx.fill();ctx.stroke();
    if(transport&&st.name){
      ctx.font=`600 ${8*(state._tScale||1)}px "Gill Sans","Gill Sans MT","Trebuchet MS",sans-serif`;
      ctx.textAlign="left";ctx.textBaseline="middle";
      ctx.strokeStyle="rgba(242,239,230,0.9)";ctx.lineWidth=2.6;
      ctx.strokeText(st.name,P(st.x+0.5)+6,P(st.y+0.5));
      {const wN=ctx.measureText(st.name).width;
       if(claimBox(world,P(st.x+0.5)+6+wN/2,P(st.y+0.5)+4,wN+6,11)){
         ctx.fillStyle=PAL.ink;ctx.fillText(st.name,P(st.x+0.5)+6,P(st.y+0.5));}}
    }
  }

  /* ward boundaries */
  if(lens==="wards"||state.selWard>=0){
    ctx.strokeStyle="rgba(38,50,60,0.55)";ctx.lineWidth=0.8;ctx.setLineDash([3,2]);
    drawWardBounds(ctx,world,sc,-1);
    ctx.setLineDash([]);
  }
  if(state.showBounds){
    ctx.strokeStyle="rgba(248,244,234,0.85)";ctx.lineWidth=2.6;
    drawWardBounds(ctx,world,sc,-1);
    ctx.strokeStyle="#8a7c62";ctx.lineWidth=1.05;
    ctx.setLineDash([6,3,1.5,3]);
    drawWardBounds(ctx,world,sc,-1);
    ctx.setLineDash([]);
  }
  if(state.pin){
    const px=(state.pin.x+0.5)*sc,py=(state.pin.y+0.5)*sc;
    ctx.strokeStyle="#a33b2e";ctx.lineWidth=2.4;
    ctx.beginPath();ctx.arc(px,py,8,0,7);ctx.stroke();
    ctx.beginPath();ctx.arc(px,py,2.2,0,7);ctx.fillStyle="#a33b2e";ctx.fill();
    ctx.font=`700 ${10.5*(state._tScale||1)}px "Gill Sans","Trebuchet MS",sans-serif`;
    ctx.textAlign="left";ctx.textBaseline="middle";
    const lw=ctx.measureText(state.pin.label).width;
    ctx.fillStyle="rgba(242,239,230,0.95)";ctx.fillRect(px+11,py-8,lw+8,16);
    ctx.strokeStyle="#a33b2e";ctx.lineWidth=1;ctx.strokeRect(px+11,py-8,lw+8,16);
    ctx.fillStyle="#a33b2e";ctx.fillText(state.pin.label,px+15,py);
  }
  if(state.selWard>=0){
    const wsel=world.wards[state.selWard];
    // veil everything outside the selected ward, then a bold outline + tag
    if(wsel.cells.length<8000){
      ctx.save();
      // dim the rest of the county, keep the selected district clear
      ctx.beginPath();
      ctx.rect(0,0,sheet,sheet);
      for(const i of wsel.cells){const x=i%N,y=(i/N)|0;ctx.rect(P(x),P(y),sc,sc);}
      ctx.fillStyle="rgba(241,238,225,0.45)";
      ctx.fill("evenodd");
      ctx.fillStyle="rgba(163,59,46,0.10)";
      ctx.beginPath();
      for(const i of wsel.cells){const x=i%N,y=(i/N)|0;ctx.rect(P(x),P(y),sc,sc);}
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=4.6;ctx.lineJoin="round";
    drawWardBounds(ctx,world,sc,state.selWard);
    ctx.strokeStyle=PAL.red;ctx.lineWidth=2.6;
    drawWardBounds(ctx,world,sc,state.selWard);
    // name tag at the ward centroid
    const tx=P(wsel.cx+0.5),ty=P(wsel.cy+0.5);
    ctx.font=`700 ${11*(state._tScale||1)}px "Gill Sans","Gill Sans MT","Trebuchet MS",sans-serif`;
    ctx.textAlign="center";ctx.textBaseline="middle";
    const tw=ctx.measureText(wsel.name).width;
    ctx.fillStyle="rgba(242,239,230,0.95)";
    ctx.fillRect(tx-tw/2-5,ty-9*(state._tScale||1),tw+10,18*(state._tScale||1));
    ctx.strokeStyle=PAL.red;ctx.lineWidth=1.2;
    ctx.strokeRect(tx-tw/2-5,ty-9*(state._tScale||1),tw+10,18*(state._tScale||1));
    ctx.fillStyle=PAL.red;ctx.fillText(wsel.name,tx,ty);
  }

  /* landmarks */
  if(world.ferries&&world.ferries.length&&state.showRoads!==false){
    ctx.save();ctx.strokeStyle="#4a6a86";ctx.lineWidth=1.1;ctx.setLineDash([6,5]);
    for(const F of world.ferries){
      ctx.beginPath();ctx.moveTo((F.from[0]+0.5)*sc,(F.from[1]+0.5)*sc);
      ctx.lineTo((F.to[0]+0.5)*sc,(F.to[1]+0.5)*sc);ctx.stroke();
    }
    ctx.setLineDash([]);ctx.restore();
  }
  if(state.showMarks!==false)drawLandmarks(ctx,world,sc,plainMap);

  /* labels */
  drawLabels(ctx,world,sc,state);
}

function drawPoly(ctx,pts,sc){
  // midpoint quadratic smoothing: engineered curves instead of grid stair-steps
  ctx.beginPath();
  const X=k=>(pts[k][0]+0.5)*sc,Y=k=>(pts[k][1]+0.5)*sc;
  ctx.moveTo(X(0),Y(0));
  if(pts.length<3){ctx.lineTo(X(pts.length-1),Y(pts.length-1));ctx.stroke();return;}
  for(let k=1;k<pts.length-1;k++){
    ctx.quadraticCurveTo(X(k),Y(k),(X(k)+X(k+1))/2,(Y(k)+Y(k+1))/2);
  }
  ctx.lineTo(X(pts.length-1),Y(pts.length-1));
  ctx.stroke();
}

function drawWardBounds(ctx,world,sc,only){
  const {N,wardOf,sea}=world;
  ctx.beginPath();
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,w=wardOf[i];
    if(w<0)continue;
    if(only>=0&&w!==only)continue;
    // interior boundaries, plus closure against sea and the sheet edge
    const right=x<N-1?wardOf[i+1]:-2, below=y<N-1?wardOf[i+N]:-2;
    const left=x>0?wardOf[i-1]:-2, above=y>0?wardOf[i-N]:-2;
    if(right!==w&&(only<0||right!==only)){ctx.moveTo((x+1)*sc,y*sc);ctx.lineTo((x+1)*sc,(y+1)*sc);}
    if(below!==w&&(only<0||below!==only)){ctx.moveTo(x*sc,(y+1)*sc);ctx.lineTo((x+1)*sc,(y+1)*sc);}
    if(left===-2||(only>=0&&left!==only)){ctx.moveTo(x*sc,y*sc);ctx.lineTo(x*sc,(y+1)*sc);}
    if(above===-2||(only>=0&&above!==only)){ctx.moveTo(x*sc,y*sc);ctx.lineTo((x+1)*sc,y*sc);}
  }
  ctx.stroke();
}

function drawLandmarks(ctx,world,sc,plain){
  const seen=new Set();
  const box=(letter)=>{
    ctx.fillStyle="#fdfcf7";ctx.strokeStyle="#20242c";ctx.lineWidth=1.1;
    ctx.beginPath();ctx.roundRect(-5,-5,10,10,2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#20242c";ctx.font='700 8px "Gill Sans","Trebuchet MS",sans-serif';
    ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(letter,0,0.5);
  };
  for(const lm of world.landmarks){
    if(["church","abbey","townhall","engine-house","pier","reservoir"].includes(lm.type))continue;
    const key=lm.type+"_"+((lm.x/3)|0)+"_"+((lm.y/3)|0);
    if(seen.has(key))continue;seen.add(key);
    const x=(lm.x+0.5)*sc,y=(lm.y+0.5)*sc;
    ctx.save();ctx.translate(x,y);
    switch(lm.type){
      case "infirmary": case "dgh": box("H");break;
      case "university": box("U");break;
      case "cathedral": box("C");break;
      case "castle-ruin": ctx.strokeStyle="#20242c";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-4,3);ctx.lineTo(-4,-2);ctx.lineTo(-2,-2);ctx.lineTo(-2,-3.5);ctx.lineTo(0,-3.5);ctx.lineTo(0,-2);ctx.lineTo(2,-2);ctx.lineTo(2,-3.5);ctx.lineTo(4,-3.5);ctx.lineTo(4,3);ctx.stroke();break;
      case "castle": ctx.fillStyle="#20242c";ctx.beginPath();ctx.moveTo(-4,3);ctx.lineTo(-4,-2);ctx.lineTo(-2,-2);ctx.lineTo(-2,-3.5);ctx.lineTo(0,-3.5);ctx.lineTo(0,-2);ctx.lineTo(2,-2);ctx.lineTo(2,-3.5);ctx.lineTo(4,-3.5);ctx.lineTo(4,3);ctx.closePath();ctx.fill();break;
      case "stadium": ctx.fillStyle="#20242c";ctx.beginPath();ctx.ellipse(0,0,4.6,3.0,0,0,7);ctx.fill();ctx.strokeStyle="#fdfcf7";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,2.6,1.5,0,0,7);ctx.stroke();break;
      case "power": ctx.fillStyle="#20242c";ctx.beginPath();ctx.moveTo(-2.4,-4);ctx.lineTo(1.4,-0.5);ctx.lineTo(-0.8,-0.5);ctx.lineTo(2.4,4);ctx.lineTo(-1.4,0.5);ctx.lineTo(0.8,0.5);ctx.closePath();ctx.fill();break;
      case "airfield": ctx.strokeStyle="#20242c";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-4.5,0);ctx.lineTo(4.5,0);ctx.moveTo(-1.6,-3);ctx.lineTo(1.6,3);ctx.moveTo(1.6,-3);ctx.lineTo(-1.6,3);ctx.stroke();break;
    }
    ctx.restore();
  }
}
function glyphCross(ctx,r,filledBase){
  ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r*0.7);ctx.moveTo(-r*0.55,-r*0.35);ctx.lineTo(r*0.55,-r*0.35);ctx.stroke();
  if(filledBase){ctx.beginPath();ctx.arc(0,r*0.7,1.6,0,7);ctx.fill();}
}

function claimBox(world,x,y,w,h){
  const L=world._labelBoxes||(world._labelBoxes=[]);
  for(const b of L)if(!(x+w/2<b.x-b.w/2||x-w/2>b.x+b.w/2||y<b.y-b.h||y-h>b.y))return false;
  L.push({x,y,w,h});return true;
}
function drawLabels(ctx,world,sc,state){
  const plainOrTransport=state.lens==="map"||state.lens==="transport";
  const {N}=world;
  ctx.textAlign="center";
  const tryPlace=(x,y,w,h)=>claimBox(world,x,y,w,h);
  // settlements by importance
  const S=world.settlements.slice().sort((a,b)=>b.pop-a.pop);
  for(const s of S){
    if(s.absorbed&&s.kind!=="main")continue;
    const px=(s.x+0.5)*sc,py=(s.y+0.5)*sc-6;
    let size,weight="600",caps=false;
    if(s.kind==="main"){size=15;caps=true;weight="700";}
    else if(s.pop>8000){size=11.5;caps=true;}
    else if(s.pop>2500)size=10.5;
    else size=9;
    ctx.font=`${weight} ${Math.round(size*(state._tScale||1)*10)/10}px "Gill Sans","Gill Sans MT","Trebuchet MS",sans-serif`;
    const name=caps?s.name.toUpperCase():s.name;
    const w=ctx.measureText(name).width;
    if(!tryPlace(px,py,w+6,size+3))continue;
    ctx.lineWidth=3;ctx.strokeStyle="rgba(241,238,225,0.85)";ctx.strokeText(name,px,py);
    ctx.fillStyle=PAL.ink;ctx.fillText(name,px,py);
  }
  // absorbed settlements as district labels (smaller, grey, no halo box conflicts)
  ctx.font=`400 ${8.5*(state._tScale||1)}px "Gill Sans","Gill Sans MT","Trebuchet MS",sans-serif`;
  for(const s of world.settlements){
    if(!s.absorbed)continue;
    const px=(s.x+0.5)*sc,py=(s.y+0.5)*sc;
    const w=ctx.measureText(s.name).width;
    if(!tryPlace(px,py,w+4,10))continue;
    ctx.lineWidth=2.5;ctx.strokeStyle="rgba(241,238,225,0.8)";ctx.strokeText(s.name,px,py);
    ctx.fillStyle=PAL.inkSoft;ctx.fillText(s.name,px,py);
  }
  // river names in italic water-blue along the channel
  ctx.font=`italic 600 ${10*(state._tScale||1)}px Georgia,serif`;
  for(const r of world.rivers){const rp=r.draw||r.pts;
    if(r.cells.length<40)continue;
    const mid=r.cells[Math.floor(r.cells.length*0.45)];
    const px=(mid%N+0.5)*sc,py=((mid/N|0)+0.5)*sc-4;
    const label="River "+r.name;
    const w=ctx.measureText(label).width;
    if(!tryPlace(px,py,w+4,11))continue;
    ctx.lineWidth=2.5;ctx.strokeStyle="rgba(241,238,225,0.8)";ctx.strokeText(label,px,py);
    ctx.fillStyle=PAL.waterLine;ctx.fillText(label,px,py);
  }
  // motorway shield (map & transport lenses only)
  if(!plainOrTransport)return;
  if(world.motorway){
    const mp=world.motorway.pts[Math.floor(world.motorway.pts.length*0.25)];
    ctx.font=`700 ${9.5*(state._tScale||1)}px "Gill Sans","Gill Sans MT","Trebuchet MS",sans-serif`;
    const w=ctx.measureText(world.motorway.name).width+8;
    const px=(mp[0]+0.5)*sc,py=(mp[1]+0.5)*sc;
    ctx.fillStyle=PAL.mwyCase;
    ctx.fillRect(px-w/2,py-8,w,13);
    ctx.fillStyle="#fff";ctx.fillText(world.motorway.name,px,py+2.5);
  }
}
