function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
"use strict";
/* ============================================================
   UI — survey sheet chrome, lens legend, ward census panel,
   hover readout, methodology. All DOM code is guarded so the
   generation pipeline still runs headless.
   ============================================================ */

const LENSES=[
  ["map","Survey sheet","hypsometric tint with hillshade"],
  ["relief","Relief","elevation"],
  ["geology","Bedrock geology","formations and faults"],
  ["soil","Soils","series from geology and drainage"],
  ["flood","Flood risk","fluvial and coastal"],
  ["landuse","Land use","detailed"],
  ["function","Urban function","broad classes"],
  ["era","Housing age","construction era"],
  ["density","Population density","persons per km²"],
  ["age","Median age","by district"],
  ["eth","Ethnicity","largest minority group"],
  ["degree","Degree educated","working-age share"],
  ["income","Household income","median, by district"],
  ["price","House prices","median, by district"],
  ["gva","GVA per head","by district"],
  ["imd","Deprivation","decile, 1 most deprived"],
  ["crime","Crime","offences per 1,000"],
  ["le","Life expectancy","at birth, by district"],
  ["transport","Transport","network and stations"],
  ["access","Transport access","by district"],
  ["schools","School places","pressure on primaries"],
  ["health","Hospital access","distance to acute care"],
  ["traffic","Traffic","AM peak flows"],
  ["noise","Noise","Lden"],
  ["air","Air quality","NO2 annual mean"],
  ["bio","Biodiversity","habitat index"],
  ["wards","Wards & parishes","administrative geography"],
  ["politics","Voting","modelled shares"],
];

const APP={world:null,state:{lens:"map",selWard:-1,view:{z:1,tx:0,ty:0}},cv:null,busy:false};

function $(id){return document.getElementById(id);}
function fmt(n){return n.toLocaleString("en-GB");}

function randomizeControls(){
  const r=()=>Math.random();
  $("seed").value=["ald","bre","cul","dun","edg","fen","gar","hol"][Math.floor(r()*8)]+["ford","wick","ham","ton","by","thorpe"][Math.floor(r()*6)]+"-"+Math.floor(r()*900+100);
  $("region").selectedIndex=Math.floor(r()*$("region").options.length);
  $("size").selectedIndex=Math.floor(r()*3);
  const sides=["eN","eE","eS","eW"];
  for(const id of sides)$(id).value=["flat","flat","mountains","sea"][Math.floor(r()*4)];
  const pairs=[["W","E"],["N","S"],["N","E"],["W","S"]];
  $("river").value=r()<0.85?pairs[Math.floor(r()*4)].join("-"):"none";
  $("river2").value=r()<0.25?pairs[Math.floor(r()*4)].join("-"):"none";
}
function bootUI(){
  if($("cancelGen"))$("cancelGen").onclick=cancelGeneration;
  document.addEventListener("click",ev=>{
    const ep=ev.target.closest&&ev.target.closest(".ethPill");
    if(ep){
      if(ep.dataset.g!==undefined){APP.state.ethMode="group";APP.state.ethGroup=+ep.dataset.g;}
      else APP.state.ethMode=ep.dataset.m;
      if(APP.world&&APP.world._lensCache)delete APP.world._lensCache.eth;
      renderLegend();APP.redraw();return;
    }
    const ap=ev.target.closest&&ev.target.closest(".accPill");
    if(ap){APP.state.accessMode=ap.dataset.am;
      if(APP.world&&APP.world._lensCache)delete APP.world._lensCache.access;
      renderLegend();APP.redraw();return;}
  });
  randomizeControls();
  document.addEventListener("change",ev=>{

    if(ev.target&&ev.target.classList&&ev.target.classList.contains("voteEraOpt")){
      APP.state.voteEra=+ev.target.value;renderLegend();
      if(APP.world&&APP.world._lensCache)delete APP.world._lensCache.politics;
      APP.redraw();
    }
    for(const [id2,key] of [["togRoads","showRoads"],["togRail","showRail"],["togRivers","showRivers"],["togMarks","showMarks"]])
      if(ev.target&&ev.target.id===id2){APP.state[key]=ev.target.checked;APP.redraw();}
  });
  document.addEventListener("keydown",ev=>{
    if(ev.key==="Escape"&&APP.state.selWard>=0){APP.state.selWard=-1;renderWardPanel();APP.redraw();}
  });
  const bd=document.getElementById("boundsToggle");
  if(bd)bd.addEventListener("change",()=>{APP.state.showBounds=bd.checked;APP.redraw();});
  document.addEventListener("click",ev=>{
    const row=ev.target.closest(".pinrow");
    if(!row||!APP.world)return;
    const px=parseFloat(row.dataset.px),py=parseFloat(row.dataset.py);
    if(!isFinite(px))return;
    APP.state.pin=(APP.state.pin&&APP.state.pin.label===row.dataset.pl)?null:{x:px,y:py,label:row.dataset.pl};
    APP.redraw();
  });
  $("surprise").addEventListener("change",()=>{
    const on=$("surprise").checked;
    for(const id of ["eN","eE","eS","eW","river","river2"])$(id).disabled=on;
  });
  setTimeout(wireExport,0);
  const cv=APP.cv=$("map");
  const box=$("mapbox");
  const dpr=()=>window.devicePixelRatio||1;
  let raf=0;
  const fullRender=()=>{
    drawScene(cv,APP.world,APP.state);

  };
  const gestureActive=()=>((pan&&pan.moved)||pinch);
  const redraw=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;
    if(!APP.world)return;
    fullRender();
  });};
  APP.redraw=redraw;
  const fitView=()=>{ // center the square sheet in the canvas at z=1
    const W=cv.width,H=cv.height,sheet=Math.min(W,H);
    APP.state.view={z:1,tx:(W-sheet)/2,ty:(H-sheet)/2};
  };
  APP.fitView=fitView;
  const fit=()=>{
    cv.width=Math.floor(box.clientWidth*dpr());
    cv.height=Math.floor(box.clientHeight*dpr());
    fitView();redraw();
  };
  new ResizeObserver(fit).observe(box);
  window.addEventListener("resize",fit);

  /* ---- zoom & pan ---- */
  const ZMIN=0.5,ZMAX=8;
  const zoomAt=(px,py,f)=>{ // px,py canvas pixels
    const v=APP.state.view;
    const nz=clamp(v.z*f,ZMIN,ZMAX);
    const k=nz/v.z;
    v.tx=px-(px-v.tx)*k; v.ty=py-(py-v.ty)*k; v.z=nz;
    redraw();
  };
  cv.addEventListener("wheel",e=>{
    e.preventDefault();
    const r=cv.getBoundingClientRect();
    zoomAt((e.clientX-r.left)*dpr(),(e.clientY-r.top)*dpr(),Math.exp(-e.deltaY*0.0016));
  },{passive:false});
  cv.addEventListener("dblclick",e=>{
    const r=cv.getBoundingClientRect();
    zoomAt((e.clientX-r.left)*dpr(),(e.clientY-r.top)*dpr(),1.7);
  });
  let pan=null,downEv=null;
  const ptrs=new Map();
  let pinch=null;
  cv.addEventListener("pointerdown",e=>{
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===2){
      const [a,b]=[...ptrs.values()];
      pinch={d0:Math.hypot(a.x-b.x,a.y-b.y),z0:APP.state.view.z,
             mx:(a.x+b.x)/2,my:(a.y+b.y)/2};
      pan=null;
      return;
    }
    downEv={clientX:e.clientX,clientY:e.clientY};
    pan={x:e.clientX,y:e.clientY,tx:APP.state.view.tx,ty:APP.state.view.ty,moved:false};
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove",e=>{
    if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&ptrs.size===2){
      const [a,b]=[...ptrs.values()];
      const d=Math.hypot(a.x-b.x,a.y-b.y);
      const r=cv.getBoundingClientRect();
      const px=(pinch.mx-r.left)*dpr(),py=(pinch.my-r.top)*dpr();
      const v=APP.state.view;
      const nz=clamp(pinch.z0*d/Math.max(20,pinch.d0),ZMIN,ZMAX);
      const k=nz/v.z;
      v.tx=px-(px-v.tx)*k;v.ty=py-(py-v.ty)*k;v.z=nz;
      redraw();
      return;
    }
    if(pan){
      const cssDx=e.clientX-pan.x,cssDy=e.clientY-pan.y;
      if(Math.abs(cssDx)+Math.abs(cssDy)>6)pan.moved=true;
      const dx=cssDx*dpr(),dy=cssDy*dpr();
      if(pan.moved){cv.classList.add("panning");
        APP.state.view.tx=pan.tx+dx;APP.state.view.ty=pan.ty+dy;redraw();}
    }
  });
  const doSelect=e=>{
    try{
      if(!APP.world)return;
      const [x,y]=toCell(e);
      if(x<0||y<0||x>=APP.world.N||y>=APP.world.N)return;
      const wsel=APP.world.wardOf[y*APP.world.N+x];
      APP.state.selWard=(wsel<0||wsel===APP.state.selWard)?-1:wsel;
      $("readout").textContent=APP.state.selWard>=0?("Selected: "+APP.world.wards[wsel].name+" ward - profile at right"):"-";
      redraw();
      renderWardPanel();
      if(APP.state.selWard>=0){const p2=$("ward");if(p2&&p2.scrollIntoView)p2.scrollIntoView({block:"nearest"});}
    }catch(err){console.error("select failed",err);$("readout").textContent="selection error: "+err.message;}
  };
  cv.addEventListener("pointerup",e=>{
    ptrs.delete(e.pointerId);
    if(pinch){if(ptrs.size<2){pinch=null;redraw();}return;}
    cv.classList.remove("panning");
    const wasDrag=pan&&pan.moved;
    pan=null;
    if(!wasDrag)doSelect(downEv||e);else redraw();
    downEv=null;
  });
  cv.addEventListener("pointercancel",e=>{ptrs.delete(e.pointerId);pinch=null;cv.classList.remove("panning");pan=null;});
  $("zin").onclick=()=>zoomAt(cv.width/2,cv.height/2,1.5);
  $("zout").onclick=()=>zoomAt(cv.width/2,cv.height/2,1/1.5);
  $("zfit").onclick=()=>{fitView();redraw();};

  /* lens legend */
  const leg=$("lenses");
  {
    const CHIP={map:"#cfe3b8",relief:"#c9b896",geology:"#c9a0a0",soil:"#a5743c",flood:"#4a78b4",landuse:"#e0872f",
      "function":"#e0187d",era:"#b5442f",density:"#c25040",age:"#7868a8",eth:"#dc781e",degree:"#7a4fb0",
      income:"#1e6450",price:"#a06a45",gva:"#143c78",imd:"#b03a30",crime:"#8a3a5a",le:"#28b46e",
      transport:"#2b2b30",access:"#2f8a4d",traffic:"#c05028",noise:"#b08820",air:"#7a8a99",bio:"#4a9a50",
      wards:"#c9a227",politics:"#d50000",schools:"#b8860b",health:"#0e7c7b"};
    const st=document.createElement("style");
    st.textContent=Object.entries(CHIP).map(([k2,c2])=>`.sw[data-sw="${k2}"]{background:${c2}}`).join("\n");
    document.head.appendChild(st);
  }
  for(const [key,label,sub] of LENSES){
    const b=document.createElement("button");
    b.className="lens";b.dataset.lens=key;
    const CHIP={map:"#cfe3b8",relief:"#c9b896",geology:"#c9a0a0",soil:"#a5743c",flood:"#4a78b4",landuse:"#e0872f",
      "function":"#e0187d",era:"#b5442f",density:"#c25040",age:"#7868a8",eth:"#dc781e",degree:"#7a4fb0",
      income:"#1e6450",price:"#a06a45",gva:"#143c78",imd:"#b03a30",crime:"#8a3a5a",le:"#28b46e",
      transport:"#2b2b30",access:"#2f8a4d",traffic:"#c05028",noise:"#b08820",air:"#7a8a99",bio:"#4a9a50",
      wards:"#c9a227",politics:"#d50000",schools:"#b8860b",health:"#0e7c7b"};
    b.innerHTML=`<span class="sw" data-sw="${key}"></span><span class="ll">${label}</span>`;
    b.onclick=()=>{APP.state.lens=key;
      document.querySelectorAll(".lens").forEach(x=>x.classList.toggle("on",x.dataset.lens===key));
      APP.redraw();renderLegend();};
    leg.appendChild(b);
  }
  leg.querySelector(".lens").classList.add("on");

  /* pointer: hover readout + ward click */
  const toCell=e=>{
    const r=cv.getBoundingClientRect();
    const v=APP.state.view,N=APP.world.N;
    const sheet=Math.min(cv.width,cv.height),sc=sheet/N;
    const kx=cv.width/r.width, ky=cv.height/r.height;   // actual displayed ratio
    const px=((e.clientX-r.left)*kx-v.tx)/v.z;
    const py=((e.clientY-r.top)*ky-v.ty)/v.z;
    return [Math.floor(px/sc),Math.floor(py/sc)];
  };
  const tip=document.createElement("div");
  tip.id="maptip";tip.style.cssText="position:fixed;pointer-events:none;z-index:60;background:rgba(30,34,44,0.92);color:#f2efe6;font:11px/1.35 'Gill Sans','Trebuchet MS',sans-serif;padding:5px 8px;border-radius:4px;max-width:230px;display:none;white-space:pre-line";
  document.body.appendChild(tip);
  cv.addEventListener("mouseleave",()=>{tip.style.display="none";});
  cv.addEventListener("mousemove",e=>{
    if(!APP.world||pan&&pan.moved)return;
    const [x,y]=toCell(e);
    if(x<0||y<0||x>=APP.world.N||y>=APP.world.N){$("readout").textContent="—";return;}
    updateReadout(x,y,e);
  });

  $("go").onclick=()=>regenerate();
  $("dice").onclick=()=>{$("seed").value="c"+((Date.now()%1e8).toString(36))+((performance.now()|0)%97).toString(36);regenerate();};
  $("methBtn").onclick=()=>$("meth").showModal();
  $("methClose").onclick=()=>$("meth").close();
  $("wclose").onclick=()=>{APP.state.selWard=-1;drawScene(cv,APP.world,APP.state);renderWardPanel();};

  fit();
  regenerate();
}

function paramsFromUI(){
  const edges={N:$("eN").value,E:$("eE").value,S:$("eS").value,W:$("eW").value};
  let rivers=[];
  if($("surprise").checked){
    for(const id of ["eN","eE","eS","eW","river","river2"])$(id).disabled=false;
    // deterministic: derive a surprise seed, write it into the seed box so
    // the full configuration is reproducible from the visible manifest
    APP._surpriseN=(APP._surpriseN||0)+1;
    const sseed=($("seed").value||"county").replace(/-s\d+$/,"")+"-s"+APP._surpriseN;
    $("seed").value=sseed;
    const srng=new RNG(hashStr(sseed));
    const rng=()=>srng.f();
    const sides=["N","E","S","W"];
    for(const s2 of sides)$("e"+s2).value=["flat","flat","mountains","sea"][Math.floor(rng()*4)];
    if(![..."NESW"].some(s2=>$("e"+s2).value!=="sea"))$("eW").value="flat";
    const pairs=[["W","E"],["N","S"],["N","E"],["W","S"],["S","E"],["E","W"]];
    $("river").value=rng()<0.85?pairs[Math.floor(rng()*pairs.length)].join("-"):"none";
    $("river2").value=rng()<0.3?["N-S","S-E","N-E","W-S"][Math.floor(rng()*4)]:"none";
    $("surprise").checked=false;
    for(const id of ["eN","eE","eS","eW","river","river2"])$(id).disabled=false;
  }
  const rv=$("river").value;
  if(rv!=="none")rivers.push(rv.split("-"));
  const rv2=$("river2").value;
  if(rv2!=="none"&&rv2!==rv)rivers.push(rv2.split("-"));
  return {
    seed:$("seed").value||"albion",
    region:$("region").value,
    size:$("size").value,
    km:{small:22,medium:24,large:27}[$("size").value],
    edges,rivers,
    name:($("name").value.trim().replace(/[<>&"\']/g,"").slice(0,40))||null,
  };
}

function finishGeneration(world,elapsedMs){
  APP.world=world;APP.state.selWard=-1;
  delete world._base;delete world._contours;delete world._lensCache;delete world._shade;
  APP.fitView();
  drawScene(APP.cv,world,APP.state);
  renderSheetTitles(world,elapsedMs);
  renderWardPanel();
  renderSummary(world);
  renderLegend();
  renderEconomy(world);
  if($("diag"))renderDiagnostics(world);
  $("veil").classList.remove("show");
  APP.busy=false;
}
let __worker=null;
function engineWorker(){
  if(__worker)return __worker;
  if(typeof Worker==="undefined"||typeof document==="undefined")return null;
  const sc=document.querySelector("script:not([src])");
  if(!sc||!sc.textContent)return null;
  const pro='globalThis.IS_WORKER=true;\n'+sc.textContent
    +'\nself.onmessage=e=>{try{globalThis.__stage=n=>postMessage({type:"stage",name:n});'
    +'const w=generate(e.data);'
    +'delete w.rng;delete w.names;delete w.route;delete w._wardNoise;delete w._lensCache;delete w._base;delete w._contours;delete w._shade;delete w._labelBoxes;'
    +'const tf=[];const seen=new Set();const walk=(o,d2)=>{if(d2>3||o==null||typeof o!=="object")return;if(ArrayBuffer.isView(o)){if(!seen.has(o.buffer)){seen.add(o.buffer);tf.push(o.buffer);}return;}if(Array.isArray(o)){for(const v of o)walk(v,d2+1);return;}for(const k2 in o)walk(o[k2],d2+1);};walk(w,0);postMessage({type:"done",world:w},tf);}catch(err){postMessage({type:"error",message:String(err&&err.message||err)});}};';
  try{
    __worker=new Worker(URL.createObjectURL(new Blob([pro],{type:"text/javascript"})));
  }catch(e){__worker=null;}
  return __worker;
}
function regenerate(){
  if(APP.busy)return;
  APP.busy=true;
  const veil=$("veil");veil.classList.add("show");
  const nm2=$("name").value.trim()||"the district";
  $("veiltext").textContent="Surveying "+nm2+"…";
  const cb=$("cancelGen");if(cb)cb.style.display="";
  const t0=performance.now();
  const syncPath=()=>{
    setTimeout(()=>{
      try{
        const world=generate(paramsFromUI());
        finishGeneration(world,performance.now()-t0);
      }catch(err){
        console.error(err);
        $("veiltext").textContent="Survey failed: "+err.message;
        APP.busy=false;
      }
    },40);
  };
  const wk=engineWorker();
  if(!wk){if(cb)cb.style.display="none";syncPath();return;}
  const STAGE_LABEL={terrain:"raising the land",sites:"siting the towns",roads:"laying the old roads",
    grow:"growing the settlements",streets:"laying out streets",economy:"opening the works",
    fields:"walking the field boundaries",pops:"taking the census",wards:"drawing the districts",
    traffic:"counting the traffic",env:"surveying air and water"};
  wk.onmessage=(ev)=>{
    const m=ev.data;
    if(m.type==="stage"){$("veiltext").textContent="Surveying "+nm2+" — "+(STAGE_LABEL[m.name]||m.name)+"…";return;}
    if(m.type==="error"){
      console.error("worker:",m.message);
      wk.terminate();__worker=null;   // fall back to the main thread
      syncPath();return;
    }
    if(m.type==="done"){
      if(cb)cb.style.display="none";
      finishGeneration(m.world,performance.now()-t0);
    }
  };
  wk.onerror=()=>{wk.terminate();__worker=null;syncPath();};
  wk.postMessage(paramsFromUI());
}
function cancelGeneration(){
  if(__worker){__worker.terminate();__worker=null;}
  $("veil").classList.remove("show");
  APP.busy=false;
}

function renderSheetTitles(world,ms){
  $("sheetName").textContent=world.main.name.toUpperCase();
  $("sheetSub").textContent=`${world.region.label} · sheet seed ${world.seed} · ${world.km} km square · surveyed in ${(ms/1000).toFixed(1)} s`;
  $("story").textContent=world.story;
  const sb=$("scalebar");
  if(sb){const km5=5/world.km*100;
    sb.innerHTML=`<span style="display:inline-block;border-bottom:3px solid var(--ink);width:${km5}%;min-width:60px;vertical-align:middle"></span> 5 km`;}
}

const PARTY_UI={Lab:"#d50000",Con:"#0057b8",Ref:"#00b8a2",LD:"#faa61a",Grn:"#02a95b",Oth:"#9aa0a6"};
function voteBars(label,V,era){
  const nm=k2=>k2!=="Ref"?k2:(era&&era<2018?"UKIP":era===2019?"BrexP":"Ref");
  const order=Object.entries(V).sort((a,b)=>b[1]-a[1]);
  const segs=order.map(([k2,v])=>`<i title="${k2} ${v.toFixed(0)}%" style="display:block;height:100%;float:left;width:${v}%;background:${PARTY_UI[k2]||"#999"}"></i>`).join("");
  const lbl=order.slice(0,4).map(([k2,v])=>`<span style="color:${PARTY_UI[k2]}">●</span>${nm(k2)} ${Math.round(v)}`).join("  ");
  return `<div style="margin:4px 0 6px"><div style="display:flex;justify-content:space-between;font-size:10px"><b>${label}</b><span style="font-family:var(--mono);font-size:9.5px">${lbl}</span></div>
  <div style="height:9px;border:1px solid rgba(30,35,45,0.35);border-radius:2px;overflow:hidden;background:#fff">${segs}</div></div>`;
}
function renderSummary(world){
  const S=world.settlements;
  const open=world.rail.filter(l=>!l.disused&&!l.mineral);
  const urb=world.wards.filter(x=>x.urban&&x.pop>300);
  const wavg=f=>{let a=0,p2=0;for(const x of urb){a+=f(x)*x.pop;p2+=x.pop;}return p2?a/p2:0;};
  const areaKm2=Math.round(world.km*world.km);
  const E=world.economy;
  const P=world.pops;
  let workers=0,commKm=0,cn=0;
  for(let h=0;h<P.n;h+=4){if(P.work[h]>=0){workers++;
    commKm+=Math.hypot(P.home[h]%world.N-P.work[h]%world.N,((P.home[h]/world.N)|0)-((P.work[h]/world.N)|0))*world.cellKm;cn++;}}
  const rows=[
    ["Population",fmt(Math.round(world.totPop))],
    ["Households",fmt(P.n)],
    ["Area",fmt(areaKm2)+" km² ("+Math.round(world.totPop/areaKm2)+"/km²)"],
    [world.main.name,fmt(world.main.pop)],
    ["Settlements",S.length],
    ["Jobs",fmt(E.jobsTotal||Math.round(world.totPop*0.44))],
    ["GVA","£"+((E.gvaTotal||0)/1000).toFixed(1)+" bn/yr"],
    ["Median age",Math.round(wavg(x=>x.medianAge))],
    ["Not White British",Math.round(wavg(x=>x.diversity))+"%"],
    ["Car availability",Math.round(wavg(x=>(x.carByGroup?(x.carByGroup.prof+x.carByGroup.inter+x.carByGroup.routine)/3:0.5)*100))+"%"],
    ["Mean commute",(commKm/Math.max(1,cn)).toFixed(1)+" km"],
    ["Male life expectancy",Math.min(...urb.map(x=>x.leM)).toFixed(0)+" to "+Math.max(...urb.map(x=>x.leM)).toFixed(0)+" by district"],
    ["Crime",Math.round(wavg(x=>x.crime.total))+" per 1,000/yr"],
    ["Buses",world.busRoutes?world.busRoutes.length+" routes":"n/a"],
    ["Rail",open.length+" open, "+world.rail.filter(l=>l.disused).length+" closed"],
    ["Green space access",Math.round((world.greenspaceAccess??0)*100)+"% within 300 m of a park"],
  ];
  {
    const d2=world.diagnostics||{},z2=d2.zones||{},t2=d2.traffic||{};
    const hard=(z2.uncovered||0)>0||(z2.zeroPopulation||0)>0;
    const nw=(world.trafficWarnings||[]).length+((z2.merged||0)>0?1:0);
    rows.push(["Validity",hard?"INVALID: unassigned or empty districts":(t2.converged?"internally valid":"valid, "+nw+" warning"+(nw===1?"":"s"))]);
  }
  {
    const agg={},agg24={};let P2=0;
    for(const wd of world.wards){
      if(!wd.votes||!wd.pop)continue;P2+=wd.pop;
      for(const k2 in wd.votes){agg[k2]=(agg[k2]||0)+wd.votes[k2]*wd.pop;agg24[k2]=(agg24[k2]||0)+wd.votes24[k2]*wd.pop;}
    }
    if(P2>0){
      const norm=(A)=>Object.fromEntries(Object.entries(A).map(([k2,v])=>[k2,v/P2]));
      world._voteBarsHTML=`<div style="margin-top:6px;font-size:10.5px;font-weight:600">County vote</div>`+voteBars("2026",norm(agg),2026)+voteBars("2024",norm(agg24),2024);
    }
  }
  if(world.hotspots&&world.hotspots.length)rows.push(["Worst congestion","v/c "+world.hotspots[0].vc.toFixed(2)+" ("+world.hotspots[0].cls+")"]);
  for(const line of open){
    if(line.loadFactor)rows.push([line.name,"busiest segment "+Math.round((line.maxSegLF||line.loadFactor)*100)+"% of seats"]);
  }
  $("facts").innerHTML=rows.map(r=>`<div class="fr"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("")+(world._voteBarsHTML||"");
}

const LU_BLURB={
  medieval:"Burgage plots on the pre-1700 street plan.",
  victTerrace:"Bylaw terraces built for the works.",
  victVilla:"The Victorian merchants' suburb.",
  interwar:"1920s-30s semis along the arterials.",
  modernFlats:"Town-centre or waterside conversions.",
  highStreet:"Shops with flats over; the working centre.",
  bizPark:"Post-1980, by the junction.",
  uniOld:"Civic redbrick.",uniNew:"Post-1960s campus.",
};
function updateReadout(x,y,ev){
  const w=APP.world;if(!w)return;
  const i=y*w.N+x;
  const lens=APP.state.lens;
  const wd=w.wardOf[i];
  const wardName=wd>=0?w.wards[wd].name:null;
  let t="";
  if(w.sea[i])t="sea";
  else switch(lens){
    case "map": case "transport":{
      const gr="ABCDEFGHJKLMNPQRSTUV";
      t=`${gr[Math.floor(x/w.N*10)]||"?"}${Math.floor(y/w.N*10)} · ${Math.round(w.elev[i])} m`;
      if(wardName)t+=` · ${wardName}`;
      if(lens==="transport"&&w.trafficRaster&&w.trafficRaster[i]>100)t+=`\n${Math.round(w.trafficRaster[i])} veh/h modelled AM peak`;
      break;}
    case "geology":
      t=LITH[w.lithIndex[w.stratum[i]]].name;break;
    case "landuse": case "function": case "era":{
      if(w.landUse[i]>0&&LU_META[w.landUse[i]]){
        t=LU_META[w.landUse[i]].label;
        const key=Object.keys(LU).find(k2=>LU[k2]===w.landUse[i]);
        if(key&&LU_BLURB[key])t+=`\n${LU_BLURB[key]}`;
      } else t=["Arable","Pasture","Woodland","Moorland","Heath","Marsh","Beach","Rough grazing"][w.cover[i]]||"";
      break;}
    case "eth":{
      if(wd>=0&&w.wards[wd].eth&&!w.wards[wd].noResidents){
        const E2=w.wards[wd].eth;let g=1,b=0;
        for(let g2=1;g2<10;g2++)if(E2[g2]>b){b=E2[g2];g=g2;}
        t=`${wardName}\n${["","White other","Pakistani","Indian","Bangladeshi","Black African","Black Caribbean","Chinese","Mixed","Other"][g]} ${b.toFixed(0)}%`;
      }
      break;}
    case "politics":{
      const era2=APP.state.voteEra||2026;
      const wv=wd>=0&&(w.wards[wd].votesByEra?w.wards[wd].votesByEra[era2]:w.wards[wd].votes);
      if(wv){
        const nm2=k2=>k2!=="Ref"?k2:(era2<2018?"UKIP":era2===2019?"BrexP":"Ref");
        const top=Object.entries(wv).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k2,v])=>`${nm2(k2)} ${Math.round(v)}%`).join(" · ");
        t=`${wardName}\n${top}`;
      }
      break;}
    case "wards":
      if(wardName)t=`${wardName}${w.wards[wd].urban?"":" parish"}`;break;
    default:{
      // choropleths: name the ward and its value for this lens
      if(wd>=0){
        const W2=w.wards[wd];
        const val={imd:()=>"deprivation decile "+W2.imd, crime:()=>W2.crime.total+" offences /1,000/yr",
          age:()=>"median age "+W2.medianAge, degree:()=>Math.round(W2.degree*100)+"% degree educated",
          density:()=>Math.round(W2.pop/Math.max(0.3,W2.areaKm2))+" /km²", eth:()=>Math.round(W2.diversity)+"% not White British",
          income:()=>W2.income?("£"+fmt(Math.round(W2.income/100)*100)):null, le:()=>"life expectancy "+((W2.leM+W2.leF)/2).toFixed(0)+" years",price:()=>W2.price?("£"+fmt(W2.price)+" median"):null,
          gva:()=>W2.gvaPerHead?("£"+fmt(W2.gvaPerHead)+" GVA/head"):null,
          access:()=>(W2.busPerHour||0)+" buses/hr"+(W2.railAccess2?" · rail":""),
          schools:()=>W2.schoolPressure!=null?Math.round(W2.schoolPressure*100)+"% of places filled":null,
          health:()=>W2.hospMin!=null?"~"+W2.hospMin+" min to hospital":null,
          eth:()=>{if(!W2.eth)return null;let g=1,b=0;for(let g2=1;g2<10;g2++)if(W2.eth[g2]>b){b=W2.eth[g2];g=g2;}
            return ["","White other","Pakistani","Indian","Bangladeshi","Black African","Black Caribbean","Chinese","Mixed","Other"][g]+" "+b.toFixed(0)+"%";},
        }[lens];
        const v2=val&&val();
        t=wardName+(v2?"\n"+v2:"");
      }
    }
  }
  $("readout").textContent=t.replace("\n"," · ");
  const tip2=document.getElementById("maptip");
  if(tip2&&ev){
    if(!t){tip2.style.display="none";return;}
    tip2.textContent=t;
    tip2.style.display="block";
    tip2.style.left=Math.min(window.innerWidth-245,ev.clientX+14)+"px";
    tip2.style.top=(ev.clientY+16)+"px";
  }
}

/* ---------- ward census panel ---------- */
function bar(label,val,max,color,unit){
  const pc=clamp(val/max*100,0,100);
  return `<div class="brow"><span class="bl">${label}</span><span class="bt"><i style="width:${pc}%;background:${color}"></i></span><span class="bv">${unit?unit(val):val}</span></div>`;
}
function renderWardPanel(){
  const p=$("ward");
  const k=APP.state.selWard;
  if(k<0||!APP.world){p.classList.remove("open");if(document.body&&document.body.classList)document.body.classList.remove("wardOpen");return;}
  const w=APP.world.wards[k];
  p.classList.add("open");
  if(document.body&&document.body.classList)document.body.classList.add("wardOpen");
  $("wname").textContent=w.name;
  {const el2=$("wvotes");if(el2)el2.innerHTML="";}
  $("wkind").textContent=w.urban?"Ward":"Parish";
  const eth=w.eth.map((v,g)=>({v,g})).filter(e=>e.v>=0.2).sort((a,b)=>b.v-a.v);
  const era=["med/early-mod","Georgian","Victorian","interwar","post-war","late C20","2000s"];
  const eraMix=Object.entries(w.mix||{}).map(([lu,n])=>({e:LU_META[lu]?LU_META[lu].era:0,n})).reduce((a,r)=>{a[r.e]=(a[r.e]||0)+r.n;return a;},{});
  const eraTot=Object.values(eraMix).reduce((a,b)=>a+b,0)||1;
  $("wbody").innerHTML=`
    <div class="wsec"><div class="wst">Overview</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:11px;margin:2px 0 6px">
        <div>Area <b>${w.areaKm2.toFixed(1)} km²</b></div>
        ${w.price?`<div>Median house <b>£${fmt(w.price)}</b></div>`:""}
        ${w.ctBand?`<div>Council Tax <b>band ${w.ctBand}</b></div>`:""}
        ${w.schoolPressure!=null?`<div>School places <b>${Math.round(w.schoolPressure*100)}% full</b></div>`:""}
      </div>
      ${bar("Population",w.pop,Math.max(12000,w.pop),"#5a6672",v=>fmt(v))}
      ${bar("Density",Math.round(w.pop/Math.max(0.1,w.areaKm2)),9000,"#5a6672",v=>fmt(v)+"/km²")}
      ${bar("Median age",w.medianAge,60,"#77a8ac",v=>v)}
      ${w.students>0.02?bar("Students",Math.round(w.students*100),50,"#9c4a90",v=>v+"%"):""}
    </div>
    ${w.votes?`<div class="wsec"><div class="wst">Voting</div>`
      +voteBars("GE 2024",w.votes24,2024)
      +voteBars("2026 estimate",w.votes,2026)
      +`</div>`:""}
    <div class="wsec"><div class="wst">Ethnicity </div>
      ${eth.map(e=>bar(ETH_LABELS[e.g],+e.v.toFixed(1),100,ETH_COLORS[e.g],v=>v+"%")).join("")}
    </div>
    <div class="wsec"><div class="wst">Age structure</div>
      ${["0–15","16–24","25–44","45–64","65+"].map((l,a)=>bar(l,+w.age[a].toFixed(1),45,"#8fa6b8",v=>v+"%")).join("")}
    </div>
    <div class="wsec"><div class="wst">Housing by era</div>
      ${era.map((l,e)=>{const sh=(eraMix[e]||0)/eraTot;return sh>0.02?bar(l,Math.round(sh*100),100,["#8a5a44","#b07a52","#b5442f","#d9a05f","#ddc06a","#a9c46e","#5e9fc9"][e],v=>v+"%"):"";}).join("")}
      ${bar("Owner-occupied",Math.round(w.tenure.owner*100),100,"#8ab077",v=>v+"%")}
      ${bar("Social rent",Math.round(w.tenure.social*100),100,"#c97a4e",v=>v+"%")}
      ${bar("Private rent",Math.round(w.tenure.privateRent*100),100,"#9c8ac9",v=>v+"%")}
    </div>
    <div class="wsec"><div class="wst">Work & money</div>
      ${bar("Degree-educated",Math.round(w.degree*100),70,"#4d8391",v=>v+"%")}
      ${bar("Professional",Math.round(w.occ.professional*100),70,"#4d8391",v=>v+"%")}
      ${bar("Routine/manual",Math.round(w.occ.routine*100),70,"#a84c3f",v=>v+"%")}
      ${bar("Unemployment",+(w.unemployment*100).toFixed(1),16,"#a84c3f",v=>v+"%")}
      ${bar("Household income",w.income,72000,"#33613c",v=>"£"+fmt(v))}
      ${bar("GVA / head",w.gvaPerHead,70000,"#33613c",v=>"£"+fmt(v))}
    </div>
    ${w.commuteTop&&w.commuteTop.length?`<div class="wsec"><div class="wst">Where residents work</div>
      ${w.commuteTop.map(d=>`<div class="brow"><span class="bl">${esc(d.name)}</span><span class="bt"><i style="width:${Math.round(d.share*100)}%;background:#5a6672"></i></span><span class="bv">${Math.round(d.share*100)}%</span></div>`).join("")}
      ${bar("Bus services",w.busPerHour,14,"#4a5fb5",v=>v+"/hr")}
      ${bar("Cycle to work",Math.round(w.cycleShare*100),16,"#5b8a58",v=>v+"%")}
      ${w.railShare>0.02?`<div style="font-size:10.5px;color:var(--ink2)">Rail mode share ${Math.round(w.railShare*100)}%.</div>`:""}
    </div>`:""}
    ${(()=>{const here=(APP.world.economy.institutions||[]).filter(i=>i.x!=null&&APP.world.wardOf[Math.round(i.y)*APP.world.N+Math.round(i.x)]===k);
      const emp=(APP.world.economy.employers||[]).filter(e=>e.x!=null&&APP.world.wardOf[Math.round(e.y)*APP.world.N+Math.round(e.x)]===k).slice(0,4);
      if(!here.length&&!emp.length)return "";
      return `<div class="wsec"><div class="wst">In this ward</div>
        ${here.map(i=>`<div style="font-size:11.5px;margin-bottom:2px"><b style="font-family:var(--disp);font-weight:600">${esc(i.kind)}:</b> ${esc(i.name)}</div>`).join("")}
        ${emp.map(e=>`<div style="font-size:11.5px;margin-bottom:2px">${esc(e.name)} <span style="font-family:var(--mono);font-size:9.5px;color:var(--ink2)">${fmt(e.jobs)} jobs</span></div>`).join("")}
      </div>`;})()}
    <div class="wsec"><div class="wst">Crime (per 1,000/yr)</div>
      ${bar("All offences",w.crime.total,250,"#7d2e38",v=>v)}
      ${bar("Violence",w.crime.violence,90,"#a84c3f",v=>v)}
      ${bar("Theft",w.crime.theft,90,"#a84c3f",v=>v)}
      ${bar("Burglary",w.crime.burglary,40,"#a84c3f",v=>v)}
      ${bar("Vehicle",w.crime.vehicle,40,"#a84c3f",v=>v)}
    </div>
    <div class="wsec"><div class="wst">Health & place</div>
      ${bar("Deprivation decile",w.imd,10,w.imd<=3?"#a84c3f":w.imd>=8?"#33613c":"#b6b2a5",v=>v)}
      ${bar("Life expectancy ♂",w.leM,90,"#77a8ac",v=>v+" yr")}
      ${bar("Life expectancy ♀",w.leF,90,"#77a8ac",v=>v+" yr")}
      ${bar("Bad health",+(w.badHealth*100).toFixed(1),18,"#a84c3f",v=>v+"%")}
      ${bar("Cars / household",w.carsPerHh,2,"#5a6672",v=>v)}
      ${bar("NO₂ (mean)",w.airMean,35,"#a84c3f",v=>v+" µg/m³")}
      ${bar("Noise (mean)",w.noiseMean,75,"#a84c3f",v=>v+" dB")}
      ${bar("Biodiversity",w.bioMean,100,"#5b8a58",v=>v)}
      ${bar("Green space",Math.round(w.greenShare*100),100,"#5b8a58",v=>v+"%")}
    </div>`;
}

if(typeof document!=="undefined"&&typeof window!=="undefined"){
  if(typeof window!=="undefined"&&!globalThis.IS_WORKER)window.addEventListener("DOMContentLoaded",bootUI);
}

/* ---------- itemized legend per lens ---------- */
function legRow(color,label,sub){
  return `<div style="display:flex;gap:8px;align-items:center;margin:2.5px 0">
    <span style="width:13px;height:13px;flex:none;border:1px solid var(--ink2);background:${color}"></span>
    <span style="flex:1">${label}</span>${sub?`<span style="font-family:var(--mono);font-size:9.5px;color:var(--ink2)">${sub}</span>`:""}</div>`;
}
function legGrad(c0,c1,a,b,note){
  return `<div class="lr" style="display:flex;align-items:center;gap:7px">
    <span style="display:inline-block;width:64px;height:10px;border:1px solid rgba(30,35,45,0.4);border-radius:2px;background:linear-gradient(90deg,${c0},${c1})"></span>
    <span style="font-family:var(--mono);font-size:9.5px">${a} → ${b}</span></div>`
    +(note?`<div style="font-size:10px;color:var(--ink2);margin-top:2px">${note}</div>`:"");
}
function rampCss(name,t){const c=ramp(name,t);return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;}
function renderLegend(){
  const w=APP.world,lens=APP.state.lens,el=$("legend");
  if(!w||!el)return;
  let h="";
  const wardRange=f=>{const vs=w.wards.filter(x=>x.pop>50).map(f);return [Math.min(...vs),Math.max(...vs)];};
  switch(lens){
    case "map":{
      const lineChip=(col,w2,dash)=>`<span style="display:inline-block;width:22px;vertical-align:middle;margin-right:7px;flex:none"><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="${col}" stroke-width="${w2}"${dash?` stroke-dasharray="${dash}"`:""}/></svg></span>`;
      const lrow=(chip,label)=>`<div class="lr" style="display:flex;align-items:center">${chip}<span>${label}</span></div>`;
      h+=legRow("#d9c9b2","Built-up area")
        +legRow("#c2dba2","Woodland")+legRow("#dde6c8","Pasture")+legRow("#eee9d6","Arable")
        +legRow("#e5d7b2","Moor and heath")+legRow("#b9c9b4","Marsh and fen")
        +lrow(lineChip("#0079C1",3.4),"Motorway")
        +lrow(lineChip("#d5605c",2.6),"A road")
        +lrow(lineChip("#e0975a",2.2),"B road")
        +lrow(lineChip("#bbb",1.5),"Minor road or lane")
        +lrow(lineChip("#3a3a3a",1.7),"Railway")
        +lrow(lineChip("#505650",1.5,"5,3"),"Dismantled railway")
        +lrow(lineChip("#4d7f9e",2.6),"River")
        +`<div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:10.5px;align-items:center">
        <span><span class="glyphbox">H</span> Hospital</span>
        <span><span class="glyphbox">U</span> University</span>
        <span><span class="glyphbox">C</span> Cathedral</span>
        <span><svg width="13" height="9" style="vertical-align:-1px"><ellipse cx="6.5" cy="4.5" rx="6" ry="4" fill="#20242c"/><ellipse cx="6.5" cy="4.5" rx="3.2" ry="1.8" fill="none" stroke="#fff" stroke-width="1"/></svg> Stadium</span>
        <span><svg width="11" height="11" style="vertical-align:-1px"><circle cx="5.5" cy="5.5" r="4" fill="#fff" stroke="#20242c" stroke-width="1.6"/></svg> Station</span>
        <span><svg width="14" height="10" style="vertical-align:-1px"><line x1="1" y1="5" x2="13" y2="5" stroke="#20242c" stroke-width="1.5"/><line x1="4" y1="1.5" x2="10" y2="8.5" stroke="#20242c" stroke-width="1.4"/><line x1="10" y1="1.5" x2="4" y2="8.5" stroke="#20242c" stroke-width="1.4"/></svg> Airfield</span>
        <span><svg width="12" height="11" style="vertical-align:-1px"><path d="M1 10 V4 h2 V2 h2 v2 h2 V2 h2 v2 h2 v6 z" fill="#20242c"/></svg> Castle</span>
        <span><svg width="12" height="11" style="vertical-align:-1px"><path d="M1 10 V4 h2 V2 h2 v2 h2 V2 h2 v2 h2 v6 z" fill="none" stroke="#20242c" stroke-width="1.1"/></svg> Castle ruin</span>
      </div>`;
      break;}
    case "geology":{
      const present=new Map();
      for(let i=0;i<w.stratum.length;i++){if(w.sea[i])continue;const li=w.lithIndex[w.stratum[i]];present.set(li,(present.get(li)||0)+1);}
      const rows=[...present.entries()].sort((a,b)=>b[1]-a[1]);
      for(const [li,n] of rows){const L=LITH[li];h+=legRow(L.color,L.name,Math.round(n*w.cellKm*w.cellKm)+" km²");}
      h+=`<div class="lr" style="display:flex;align-items:center"><span style="display:inline-block;width:22px;margin-right:7px"><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#8a2f2a" stroke-width="1.6"/></svg></span><span>Fault</span></div>`;
      
      break;}
    case "landuse":{
      const present=new Map();
      for(let i=0;i<w.landUse.length;i++){const lu=w.landUse[i];if(lu>0&&LU_META[lu])present.set(lu,(present.get(lu)||0)+1);}
      h+=legRow("#7fb2d0","Water")+legRow("#efe6c2","Arable farmland")+legRow("#d6e4bc","Pasture")+legRow("#8fbf7a","Woodland")+legRow("#cbb98f","Moorland")+legRow("#a8c2b0","Marsh & fen");
      for(const lu of [LU.park,LU.common,LU.allotment,LU.cemetery,LU.golf])
        if(present.has(lu))h+=legRow(LU_META[lu].col,LU_META[lu].label);
      const civic=[LU.highStreet,LU.cbd,LU.uniOld,LU.uniNew,LU.hospital,LU.power,LU.sewage].filter(lu=>present.has(lu));
      const rows=[...present.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15);
      for(const lu of civic)if(!rows.some(r=>r[0]===lu))rows.push([lu,present.get(lu)]);
      for(const [lu,n] of rows)h+=legRow(LU_META[lu].col,LU_META[lu].label,Math.round(n*w.cellKm*w.cellKm*100)+" ha");
      break;}
    case "function":{
      const present=new Map();
      for(let i=0;i<w.landUse.length;i++){const lu=w.landUse[i];const f=LU_FUNC[lu];if(f)present.set(f,(present.get(f)||0)+1);}
      for(const [f,n] of [...present.entries()].sort((a,b)=>b[1]-a[1]))h+=legRow(FUNC_COL[f],FUNC_LABEL[f],Math.round(n*w.cellKm*w.cellKm*100)+" ha");
      break;}
    case "era":{
      const labels=["Medieval–early modern","Georgian","Victorian","Interwar","Post-war","Late C20","2000s–now"];
      ERAS.forEach((e,i)=>{h+=legRow(e.color,labels[i]||e.label,"");});
      break;}
    case "relief":h+=legGrad(rampCss("heat",0.02),rampCss("heat",1),"0 m","650 m","Hypsometric tint with hillshade.");break;
    case "density":h+=legGrad(rampCss("heat",0.05),rampCss("heat",1),"0 /ha","110 /ha","Residents per hectare, cell basis.");break;

    case "age":{const [lo,hi]=wardRange(x=>x.medianAge);h+=legGrad(rampCss("div",0),rampCss("div",1),lo+" yr",hi+" yr","Ward median age.");break;}

    case "income":{const [lo,hi]=wardRange(x=>x.income);h+=legGrad(rampCss("cool",0),rampCss("cool",1),"£"+fmt(Math.round(lo)),"£"+fmt(Math.round(hi)),"Median household income.");break;}
    case "gva":{const [lo,hi]=wardRange(x=>x.gvaPerHead);h+=legGrad(rampCss("cool",0),rampCss("cool",1),"£"+fmt(Math.round(lo)),"£"+fmt(Math.round(hi)),"Workplace GVA per head.");break;}
    case "imd":h+=legGrad(rampCss("heat",1),rampCss("heat",0),"1 most deprived","10 least","English IMD-style decile from income, employment, health, education, environment.");break;
    case "crime":{const [lo,hi]=wardRange(x=>x.crime.total);h+=legGrad(rampCss("heat",0),rampCss("heat",1),lo+" /1,000",hi+" /1,000","Police-recorded offences per 1,000 residents per year. England average ~85.");break;}
    case "le":{const [lo,hi]=wardRange(x=>x.leM);h+=legGrad(rampCss("div",0),rampCss("div",1),lo.toFixed(0)+" yr",hi.toFixed(0)+" yr","Male life expectancy at birth.");break;}
    case "wards":h+=`<div style="font-size:10.5px;color:var(--ink2)">Click any district for its profile.</div>`;break;
    
    case "eth":{
      const GC={1:"#7868b4",2:"#14784f",3:"#dc781e",4:"#a02859",5:"#285aaa",6:"#96591e",7:"#c83c3c",8:"#5a9639",9:"#787878"};
      const em=APP.state.ethMode||"largest";
      const eg=APP.state.ethGroup;
      const pill2=(attr,on,label,col)=>`<span class="ethPill" ${attr} style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:9px;font-size:10px;border:1px solid rgba(30,35,45,0.45);${on?"background:#2b3038;color:#f2efe6":"background:#fdfcf7"}">${col?`<span style="width:8px;height:8px;border-radius:2px;background:${col};display:inline-block"></span>`:""}${label}</span>`;
      h+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px">`
        +pill2('data-m="largest"',em==="largest","Largest group")
        +pill2('data-m="minority"',em==="minority","Largest minority")
        +`</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">`
        +[["0","White British","#8a7f73"],["1","White other",GC[1]],["2","Pakistani",GC[2]],["3","Indian",GC[3]],["4","Bangladeshi",GC[4]],["5","Black African",GC[5]],["6","Black Caribbean",GC[6]],["7","Chinese",GC[7]],["8","Mixed",GC[8]],["9","Other",GC[9]]]
          .map(([g,l,c])=>pill2(`data-g="${g}"`,em==="group"&&String(eg)===g,l,c)).join("")
        +`</div>`;
      if(em==="group"){
        let lo3="low",hi3="high";
        const w3=APP.world;
        if(w3&&w3.wards){
          let mn3=100,mx3=0;
          for(const wd4 of w3.wards){
            if(!wd4.eth||wd4.noResidents)continue;
            const v4=(+eg===0)?(100-wd4.diversity):wd4.eth[+eg]||0;
            mn3=Math.min(mn3,v4);mx3=Math.max(mx3,v4);
          }
          lo3=mn3.toFixed(mn3<3?1:0)+"%";hi3=mx3.toFixed(mx3<3?1:0)+"%";
        }
        h+=legGrad("#efece2",(+eg===0)?"#6e6257":GC[+eg]||"#444",lo3,hi3);
      }
      break;}
    case "degree":{const [a,b]=wardRange(x=>Math.round(x.degree*100));h+=legGrad("#f2e8d8","#7a4fb0",a+"%",b+"%");break;}
    case "price":{const [a,b]=wardRange(x=>x.price||0);
      h+=legGrad("#f7ecc0","#5a3410","£"+fmt(a),"£"+fmt(b));break;}
    case "income":{const [a,b]=wardRange(x=>x.income||0);h+=legGrad("#f2e8d8","#1e6450","£"+fmt(a),"£"+fmt(b));break;}
    case "gva":{const [a,b]=wardRange(x=>x.gvaPerHead||0);h+=legGrad("#f2e8d8","#143c78","£"+fmt(a),"£"+fmt(b));break;}
    case "le":{const [a,b]=wardRange(x=>Math.round((x.leM+x.leF)/2));h+=legGrad("#eb7864","#28b46e",a+" yrs",b+" yrs");break;}
    case "age":{const [a,b]=wardRange(x=>x.medianAge);h+=legGrad("#e6f0d2","#503c78",a,b);break;}
    case "density":{h+=legRow("#f5efe0","rural")+legRow("#8c1e14","densest urban");break;}
    case "soil":{
      h+=legRow("#a5743c","Brown earth")+legRow("#dcd2b4","Calcareous")+legRow("#d8b478","Sandy podzol")+legRow("#96825a","Clay gley")+legRow("#8caa78","Alluvial")+legRow("#463c32","Peat")+legRow("#b4a08c","Thin upland");
      h+=`<div style="font-size:10px;color:var(--ink2);margin-top:3px">Feeds farmland type and habitat value.</div>`;break;}
    case "access":{
      const am=APP.state.accessMode||"overall";
      const pill=(v,l)=>`<span class="accPill" data-am="${v}" style="cursor:pointer;padding:1px 7px;border-radius:9px;font-size:10px;border:1px solid rgba(30,35,45,0.45);${am===v?"background:#2b3038;color:#f2efe6":"background:#fdfcf7"}">${l}</span>`;
      h+=`<div style="display:flex;gap:5px;margin-bottom:5px">${pill("overall","Overall")+pill("pt","Public transport")+pill("road","Road")}</div>`;
      h+=legGrad("#ece9e4",am==="road"?"#8a4a2e":am==="pt"?"#1e6e9e":"#2e8e5a","poor","good");
      h+=`<div style="font-size:10px;color:var(--ink2);margin-top:3px">${am==="pt"?"Buses and rail within reach.":am==="road"?"Distance to the strategic network, local network density, congestion.":"Public transport and road access combined."}</div>`;
      break;}
    case "schools":h+=legGrad("#e9f2e4","#8a2b1e","places spare","over capacity","Primary places filled against planned capacity; 1.0 is exactly full.");break;
    case "health":{
      const hm2=APP.world?APP.world.wards.filter(x=>x.hospMin!=null&&!x.noResidents).map(x=>x.hospMin):[];
      const lo2=hm2.length?Math.min(...hm2):5,hi2=hm2.length?Math.max(...hm2):45;
      h+=legGrad("#e6f0f2","#0e5a6e",lo2+" min",hi2+" min","Door-to-door to the nearest acute hospital by the faster of car (modelled roads, with congestion) or bus and rail.");
      break;}
    case "flood":{h+=legGrad("#dce9f6","#1e50a0","fringe of the floodplain","river or tidal front","Height above the nearest watercourse, EA Flood Zone style: the deepest shading lies along rivers and tidal lowland, fading with every metre of rise.");break;}
    case "politics":
      {
        const eras=[[2026,"2026 estimate"],[2024,"GE 2024"],[2019,"GE 2019"],[2017,"GE 2017"],[2015,"GE 2015"],[2010,"GE 2010"]];
        h+=`<div style="display:flex;flex-wrap:wrap;gap:5px 12px;font-size:10.5px;margin-bottom:4px">`+eras.map(([v,l])=>
          `<label style="display:flex;gap:4px;align-items:center;cursor:pointer"><input type="radio" name="voteEra" class="voteEraOpt" value="${v}" style="width:auto" ${(APP.state.voteEra||2026)===v?"checked":""}>${l}</label>`).join("")+`</div>`;
        h+=`<div style="font-size:9.5px;color:var(--ink2);margin-bottom:3px">Before 2018 the teal column is UKIP / Brexit Party.</div>`;
      }
      h+=legRow("#d50000","Labour")+legRow("#0057b8","Conservative")+legRow("#00b8a2",(APP.state.voteEra||2026)<2018?"UKIP":(APP.state.voteEra===2019?"Brexit Party":"Reform"))+legRow("#faa61a","Lib Dem")+legRow("#02a95b","Green")
        +`<div style="font-size:10px;color:var(--ink2);margin-top:3px">Modelled winner by district; strong tint = populated, pale = rural prior. Illustrative demographic model of a synthetic population. Not a forecast.</div>`;
      break;
    case "traffic":
      h+=legRow(rampCss("heat",0.1),"Free flow","v/c<0.5")+legRow(rampCss("heat",0.5),"Busy","0.5–0.85")
        +legRow(rampCss("heat",0.8),"At capacity","0.85–1.0")+legRow(rampCss("heat",1),"Over capacity","queueing")
        +`<div style="font-size:10.5px;color:var(--ink2);margin-top:3px">Stroke width shows AM peak flow.</div>`
        +((()=>{const T3=APP.world&&APP.world.diagnostics&&APP.world.diagnostics.traffic;
          if(!T3)return "";
          if(T3.relGap>=0.05||T3.unreachableDemand>=1)return `<div style="font-size:10px;color:#a33b2e;margin-top:3px">Flows did not stabilise on this network; treat as indicative.</div>`;
          if(T3.equilibriumGap>0.10)return `<div style="font-size:10px;color:var(--ink2);margin-top:3px">Flows are stable, ~${Math.round(T3.equilibriumGap*100)}% above the ideal user-equilibrium assignment (the averaging method’s limit on a congested network). Capacity stress is a separate matter: see the volume figures.</div>`;
          return "";})());
      break;
    case "transport":{
      
      h+=legRow("#0079C1","Motorway")+legRow("#d5605c","A road")+legRow("#e0975a","B road")
        +legRow("#3a3a3a","Railway + stations")+legRow("rgba(90,130,80,.55)","Disused / mineral line");
      const bmax=Math.max(...w.wards.map(x=>x.busPerHour||0));
      h+=`<div style="font-size:10.5px;color:var(--ink2);margin:4px 0">Bus level of service runs 0-${bmax}/hr by ward, following density and the radial corridors; see each ward's profile.</div>`;
      const open=w.rail.filter(l=>!l.disused&&!l.mineral&&l.loadFactor);
      if(open.length){h+=`<div style="font-family:var(--disp);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin:7px 0 3px">Peak loadings</div>`;
        for(const L of open)h+=`<div style="display:flex;justify-content:space-between;font-size:11px"><span>${esc(L.name)}</span><b>${Math.round((L.maxSegLF||L.loadFactor)*100)}% of seats</b></div>`;}
      break;}
    case "air":{const [lo,hi]=wardRange(x=>x.airMean);h+=legGrad(rampCss("heat",0),rampCss("heat",1),lo.toFixed(0)+" µg/m³",hi.toFixed(0)+" µg/m³","Modelled NO₂, annual mean. WHO guideline 10 µg/m³.");break;}
    case "noise":h+=legGrad(rampCss("heat",0),rampCss("heat",1),"45 dB","75 dB","L<sub>den</sub> .");break;
    case "bio":h+=legGrad(rampCss("green",0),rampCss("green",1),"low","high","Habitat quality; estuaries, ancient woods and disused rail corridors score highest.");break;
  }
  el.innerHTML=h||"<span style='color:var(--ink2)'>—</span>";
}

/* ---------- economy panel ---------- */
function renderEconomy(world){
  const el=$("econ");if(!el)return;
  const E=world.economy;
  let h=`<div class="fr"><span>Borough GVA</span><b>£${fmt(Math.round(E.gvaTotal))} m</b></div>`;
  const secs=Object.entries(E.gvaBySector).sort((a,b)=>b[1]-a[1]).slice(0,4);
  h+=`<div style="font-size:11px;color:var(--ink2);margin:2px 0 8px">Led by ${secs.map(s=>s[0]).join(", ")}.</div>`;
  h+=`<div style="font-family:var(--disp);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin-bottom:3px">Largest employers</div>`;
  for(const e of E.employers.slice(0,7)){
    h+=`<div style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><span class="pinrow" data-px="${e.x??""}" data-py="${e.y??""}" data-pl="${esc(e.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer">${esc(e.name)}${(()=>{const wk=e.x!=null?APP.world.wardOf[Math.round(e.y)*APP.world.N+Math.round(e.x)]:-1;return wk>=0?` <span style="font-family:var(--mono);font-size:9px;color:var(--ink2)">${esc(APP.world.wards[wk].name)}</span>`:"";})()}</span><b style="flex:none">${fmt(e.jobs)}</b></div>
    <div style="font-family:var(--mono);font-size:9.5px;color:var(--ink2)">${esc(e.sector)} · est. ${e.founded}${e.peak?` · peak ${fmt(e.peak.jobs)} (${e.peak.year})`:""}</div></div>`;
  }
  h+=`<div style="font-family:var(--disp);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin:8px 0 3px">Institutions</div>`;
  for(const i of E.institutions){
    const wk=(i.x!=null)?APP.world.wardOf[Math.round(i.y)*APP.world.N+Math.round(i.x)]:-1;
    const loc=wk>=0?APP.world.wards[wk].name:null;
    h+=`<div class="pinrow" data-px="${i.x??""}" data-py="${i.y??""}" data-pl="${esc(i.name)}" style="font-size:11.5px;margin-bottom:2.5px;cursor:pointer"><b style="font-family:var(--disp);font-weight:600">${esc(i.kind)}:</b> ${esc(i.name)}${loc?` <span style="font-family:var(--mono);font-size:9.5px;color:var(--ink2)">${esc(loc)}</span>`:""}${i.detail?` <span style="font-family:var(--mono);font-size:9.5px;color:var(--ink2)">${esc(i.detail)}</span>`:""}</div>`;}
  el.innerHTML=h;
}


/* ---------- scenario manifest export / import ---------- */
const ENGINE_VERSION="v9.1";
function currentManifest(){
  const w=APP.world;if(!w)return null;
  return {
    schema:"imaginary-county-manifest/1",engine:ENGINE_VERSION,
    inputs:{seed:w.seed,region:w.regionKey,size:w.sizeClass,km:w.km,
      edges:w.edges,rivers:w.riverSpecs,name:w.forcedName||null},
    outputs:{town:w.main.name,population:Math.round(w.totPop),
      households:w.pops?w.pops.n:null,districts:w.wards.filter(x=>x.cells.length).length},
    diagnostics:w.diagnostics||{},
    referenceData:[{name:"ONS Census 2021 ethnicity by local authority (19+1)",
      via:"ethnicity-facts-figures.service.gov.uk",retrieved:"2026-07-18",
      profiles:23,split:"60/40 by LAD-code hash",holdoutMAE_pp:1.6,envelopeCoverage:0.69}],
    note:"Synthetic scenario. Reproduce by supplying inputs to the same engine version.",
  };
}
function exportDistrictsCSV(){
  const w=APP.world;if(!w)return;
  const cols=["name","urban","population","households_est","area_km2","median_age","pct_not_white_british","imd_decile","crime_per_1000","le_male","le_female","buses_per_hour","vote26_winner"];
  const lines=[cols.join(",")];
  for(const wd of w.wards){
    if(!wd.cells.length)continue;
    lines.push([JSON.stringify(wd.name),wd.urban?1:0,Math.round(wd.pop),Math.round(wd.pop/2.32),
      wd.areaKm2.toFixed(2),wd.medianAge,Math.round(wd.diversity),wd.imd,wd.crime?wd.crime.total:"",
      wd.leM,wd.leF,wd.busPerHour??"",wd.voteWinner??""].join(","));
  }
  const blob=new Blob([lines.join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=(w.main.name.replace(/[^A-Za-z0-9]+/g,"_"))+"_districts.csv";a.click();URL.revokeObjectURL(a.href);
}
function wireExport(){
  if($("csvBtn"))$("csvBtn").onclick=exportDistrictsCSV;
  $("exportBtn").onclick=()=>{
    const m=currentManifest();if(!m)return;
    const blob=new Blob([JSON.stringify(m,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=(APP.world.main.name.replace(/[^A-Za-z0-9]+/g,"_")||"scenario")+"_manifest.json";
    a.click();URL.revokeObjectURL(a.href);
  };
  $("importBtn").onclick=()=>$("importFile").click();
  $("importFile").onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const m=JSON.parse(rd.result);
        const inp=m&&m.inputs;
        if(!inp||typeof inp.seed!=="string"&&typeof inp.seed!=="number")throw new Error("no inputs.seed");
        $("seed").value=String(inp.seed).slice(0,60);
        if(inp.region&&$("region").querySelector(`option[value="${CSS.escape(String(inp.region))}"]`))$("region").value=inp.region;
        if(inp.size)$("size").value=inp.size;
        if(inp.km&&$("km"))$("km").value=String(inp.km);
        if(inp.edges)for(const s2 of["N","E","S","W"])if(inp.edges[s2]&&["sea","mountains","flat"].includes(inp.edges[s2]))$("e"+s2).value=inp.edges[s2];
        if(Array.isArray(inp.rivers)){
          $("river").value=inp.rivers[0]?inp.rivers[0].join("-"):"none";
          $("river2").value=inp.rivers[1]?inp.rivers[1].join("-"):"none";
        }
        $("name").value=inp.name?String(inp.name).replace(/[<>&"']/g,"").slice(0,40):"";
        $("go").click();
      }catch(err){alert("Manifest rejected: "+err.message);}
    };
    rd.readAsText(f);
  };
}
function renderDiagnostics(world){
  const el=$("diag");if(!el)return;
  const d=world.diagnostics||{},z=d.zones||{},t=d.traffic||{};
  let h="";
  const row=(k,v,warn)=>`<div style="display:flex;justify-content:space-between${warn?";color:#a33b2e":""}"><span>${k}</span><b>${v}</b></div>`;
  
  h+=row("zero-population districts",z.zeroPopulation??"-",z.zeroPopulation>0);
  h+=row("fragments repaired",z.fragmentsRepaired??"-");
  h+=row("urban pop in ±20% of "+(z.target||5200),Math.round((z.urbanInBand80to120||0)*100)+"%",(z.urbanInBand80to120||0)<0.95);
  if(z.urbanRange)h+=row("urban district range",z.urbanRange[0]+"-"+z.urbanRange[1]);
  h+=row("assignment rel. gap",((t.relGap||0)*100).toFixed(1)+"%",!t.converged);
  h+=row("max link v/c",t.maxVC??"-",(t.maxVC||0)>2);
  for(const wmsg of (world.trafficWarnings||[]))h+=`<div style="color:#a33b2e;margin-top:3px">⚠ ${esc(wmsg)}</div>`;
  h+=`<div style="color:var(--ink2);margin-top:4px">All indicators are modelled estimates of a synthetic scenario; see the survey memorandum for method cards.</div>`;
  el.innerHTML=h;
}
