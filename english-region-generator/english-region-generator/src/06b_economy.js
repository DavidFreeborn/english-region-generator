"use strict";
/* ============================================================
   ECONOMY: sector employment, named employers, institutions
   Every job cell is allocated to a sector; contiguous job
   clusters become named firms with period- and region-
   appropriate names; the institutional roster (cathedral,
   universities, NHS trust, football club, newspaper, utilities)
   is derived from what the growth model actually built.
   ============================================================ */

const SECTORS=["manufacturing","logistics","retail","hospitality","office","public","education","health","energy","agriculture"];
const SEC_GVA={manufacturing:62,logistics:48,retail:31,hospitality:24,office:88,public:44,education:41,health:43,energy:150,agriculture:28}; // GBP k/job

/* landUse class -> sector mix (shares) */
function sectorMixFor(lu){
  switch(lu){
    case LU.heavyInd: return {manufacturing:0.8,logistics:0.12,office:0.08};
    case LU.mill: return {manufacturing:0.86,office:0.08,logistics:0.06};
    case LU.lightInd: return {manufacturing:0.5,logistics:0.3,office:0.2};
    case LU.colliery: return {energy:0.9,logistics:0.1};
    case LU.docks: return {logistics:0.7,manufacturing:0.2,office:0.1};
    case LU.power: return {energy:1};
    case LU.sewage: return {public:1};
    case LU.cbd: return {office:0.55,retail:0.2,public:0.15,hospitality:0.1};
    case LU.highStreet: return {retail:0.5,hospitality:0.25,office:0.15,public:0.1};
    case LU.retailPark: return {retail:0.8,logistics:0.1,hospitality:0.1};
    case LU.uniOld: case LU.uniNew: return {education:0.85,office:0.15};
    case LU.hospital: return {health:0.92,office:0.08};
    case LU.sciencePark: return {office:0.6,manufacturing:0.25,education:0.15};
    case LU.airfield: return {logistics:0.6,office:0.4};
    default: return null; // residential/other: small local services handled below
  }
}

const FIRM_BITS={
  wool:["Worsted Mills","Woollen Co.","Spinning Co.","Mills"],
  cotton:["Cotton Mill","Spinning Mill","Weaving Shed","Mill Co."],
  metal:["Ironworks","Engineering Works","Foundry","Forge Co."],
  steel:["Steelworks","Rolling Mills","Tube Works"],
  pottery:["Pottery","Earthenware Works","China Works"],
  chem:["Chemical Works","Dye Works","Alkali Works"],
  brew:["Brewery","Maltings"],
  food:["Biscuit Works","Preserve Works","Flour Mills"],
  eng:["Engineering Ltd","Machine Works","Motor Works","Gear Co."],
  modern:["Systems Ltd","Group plc","Technologies","Logistics Ltd","Foods Ltd","Components Ltd"],
};

function buildEconomy(world){
  const {N,rng,region,regionKey}=world;
  const idx=(x,y)=>y*N+x;
  const {landUse,jobs,settleOf,cellPop}=world;
  const nm=world.names;

  /* ---- sector rasters ---- */
  const jobsSec={};for(const s of SECTORS)jobsSec[s]=new Float32Array(N*N);
  for(let i=0;i<N*N;i++){
    const J=jobs[i];if(J<=0)continue;
    const mix=sectorMixFor(landUse[i]);
    if(mix){for(const s in mix)jobsSec[s][i]+=J*mix[s];}
    else if(cellPop[i]>0){
      // embedded local services in residential fabric
      jobsSec.retail[i]+=J*0.3;jobsSec.education[i]+=J*0.2;jobsSec.health[i]+=J*0.15;
      jobsSec.public[i]+=J*0.15;jobsSec.hospitality[i]+=J*0.1;jobsSec.office[i]+=J*0.1;
    }
    else jobsSec.agriculture[i]+=J;
  }
  world.jobsSec=jobsSec;

  /* ---- named employers from job clusters ---- */
  const CL=[LU.heavyInd,LU.mill,LU.lightInd,LU.docks,LU.power,LU.sciencePark,LU.retailPark,LU.colliery];
  const seen=new Uint8Array(N*N);
  const clusters=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i0=idx(x,y);
    if(seen[i0]||!CL.includes(landUse[i0]))continue;
    const lu=landUse[i0];
    const q=[i0];seen[i0]=1;const cells=[];let J=0,cx=0,cy=0;
    while(q.length){
      const i=q.pop();cells.push(i);J+=jobs[i];cx+=i%N;cy+=(i/N)|0;
      const X=i%N,Y=(i/N)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const XX=X+dx,YY=Y+dy;if(XX<0||YY<0||XX>=N||YY>=N)continue;
        const j=idx(XX,YY);
        if(!seen[j]&&landUse[j]===lu){seen[j]=1;q.push(j);}
      }
    }
    clusters.push({lu,cells,jobs:J,x:cx/cells.length,y:cy/cells.length});
  }
  clusters.sort((a,b)=>b.jobs-a.jobs);
  const ind=region.industry;
  const employers=[];
  const surname=()=>rng.pick(["Ackroyd","Braithwaite","Hutton","Firth","Sykes","Whitaker","Garside","Openshaw","Cartwright","Dewhurst","Longbottom","Micklewright","Farnsworth","Stott","Ramsden","Hepworth","Battersby","Clough","Sowerby","Thistlethwaite","Arkwright","Bassett","Colthorpe","Drakeford","Entwistle","Fenwick","Grimshaw","Hollingworth","Illingworth","Jagger","Kershaw","Lomax","Mottram","Netherton","Ollerenshaw","Pickles","Quarmby","Rothwell","Shackleton","Tinsley","Ullathorne","Verity","Wainwright","Yates","Ashworth","Birtwistle","Crossland","Duckworth","Earnshaw"]);
  const takenFirm=new Set();
  const firmName=(cl)=>{
    for(let t=0;t<20;t++){
      let n;
      if(cl.lu===LU.mill){
        const kind=ind.textile==="cotton"?FIRM_BITS.cotton:FIRM_BITS.wool;
        n=surname()+(rng.chance(0.4)?" & "+(rng.chance(0.5)?"Sons":"Co."):"")+" "+rng.pick(kind);
      } else if(cl.lu===LU.heavyInd){
        const pool=ind.steel>0.5?FIRM_BITS.steel:ind.pottery>0.5?FIRM_BITS.pottery:ind.chem>0.5?FIRM_BITS.chem:FIRM_BITS.metal;
        n=(rng.chance(0.5)?surname():world.main.name)+" "+rng.pick(pool);
      } else if(cl.lu===LU.lightInd){
        n=rng.chance(0.45)?surname()+" "+rng.pick(FIRM_BITS.eng):nm.wardStub()+" "+rng.pick(FIRM_BITS.modern);
      } else if(cl.lu===LU.sciencePark){
        n=rng.pick(["Vertex","Calder","Arden","Quill","Meridian","Halcyon","Astrolabe","Kestrel"])+" "+rng.pick(["Biosciences","Instruments","Analytics","Photonics","Therapeutics","Materials"]);
      } else if(cl.lu===LU.docks){
        n=world.main.name+" "+rng.pick(["Dock Co.","Harbour Commissioners","Wharfage Ltd"]);
      } else if(cl.lu===LU.power){
        n=(world.names.powerName||world.main.name)+" Power Station";
      } else if(cl.lu===LU.retailPark){
        n=rng.pick(["Gateway","Junction","Riverside","Forge","Crown Point","Meadowbank"])+" Retail Park";
      } else if(cl.lu===LU.colliery){
        const s=world.settlements.find(s2=>s2.id===settleOf[cl.cells[0]]);
        n=(s?s.name.replace(" Colliery",""):surname())+" Colliery";
      } else n=surname()+" Ltd";
      if(!takenFirm.has(n)){takenFirm.add(n);return n;}
    }
    return surname()+" & Co.";
  };
  for(const cl of clusters){
    if(cl.jobs<120||employers.length>=18)break;
    const sector=Object.entries(sectorMixFor(cl.lu)||{office:1}).sort((a,b)=>b[1]-a[1])[0][0];
    const founded={[LU.mill]:rng.int(1836,1874),[LU.heavyInd]:rng.int(1848,1902),[LU.docks]:rng.int(1820,1880),
      [LU.colliery]:rng.int(1855,1905),[LU.power]:rng.int(1948,1972),[LU.sciencePark]:rng.int(1998,2019),
      [LU.retailPark]:rng.int(1988,2008),[LU.lightInd]:rng.int(1935,1995)}[cl.lu]||rng.int(1900,1990);
    const emp={name:firmName(cl),sector,jobs:Math.round(cl.jobs),x:cl.x,y:cl.y,founded,lu:cl.lu};
    if(founded<1950&&(cl.lu===LU.mill||cl.lu===LU.heavyInd||cl.lu===LU.docks||cl.lu===LU.colliery))
      emp.peak={year:rng.int(1921,1966),jobs:Math.round(cl.jobs*rng.range(1.5,2.6))};
    employers.push(emp);
  }
  // universities & hospitals as employers too
  for(const lm of world.landmarks){
    if(lm.type==="university")employers.push({name:lm.name,sector:"education",jobs:Math.round(lm.staff||1800),x:lm.x,y:lm.y,founded:lm.founded||1904});
    if(lm.type==="infirmary"||lm.type==="dgh")employers.push({name:lm.name,sector:"health",jobs:Math.round(lm.staff||2400),x:lm.x,y:lm.y,founded:lm.founded||1868});
  }
  // scale discipline: outside London a single private employer rarely
  // exceeds a few thousand staff; the council and the NHS trust are
  // usually the largest employers in a borough of this size
  const jobCap=Math.max(1800,Math.round(world.totPop*0.016));
  for(const e of employers)if(e.jobs>jobCap)e.jobs=jobCap-rng.int(0,400);
  employers.push({name:world.main.name+" Borough Council",sector:"public",
    jobs:Math.round(world.totPop*0.017),x:world.main.x,y:world.main.y,founded:1889});
  employers.sort((a,b)=>b.jobs-a.jobs);

  /* ---- institutions ---- */
  const inst=[];
  const cath=world.landmarks.find(l=>l.type==="cathedral");
  if(cath)inst.push({kind:"Cathedral",name:cath.name,x:cath.x,y:cath.y});
  for(const lm of world.landmarks)if(lm.type==="university")inst.push({kind:"University",name:lm.name,x:lm.x,y:lm.y});
  const hosp=world.landmarks.find(l=>l.type==="infirmary"||l.type==="dgh");
  if(hosp)inst.push({kind:"NHS trust",name:world.main.name+" Teaching Hospitals NHS Trust",x:hosp.x,y:hosp.y});
  // football club with plausible league tier
  const big=world.main.pop;
  const tier=big>180000?rng.wpick([["Championship",3],["League One",2],["Premier League",0.7]]):
             big>90000?rng.wpick([["League One",3],["League Two",2],["Championship",1]]):
             rng.wpick([["League Two",3],["National League",2.5],["League One",0.8]]);
  const fcSuf=world.hasSea?rng.pick(["Town","United","Athletic","Rovers"]):rng.pick(["Town","United","City","Athletic","Wanderers","Rovers","County"]);
  let fcx=world.main.x,fcy=world.main.y;
  {let best=1e9;for(let i=0;i<world.landUse.length;i++){if(world.landUse[i]===LU.victTerrace){const x=i%world.N,y=(i/world.N)|0;const d=Math.abs(dist(x,y,world.main.x,world.main.y)-2.2/world.cellKm);if(d<best){best=d;fcx=x;fcy=y;}}}}
  inst.push({kind:"Football",name:world.main.name+" "+fcSuf+" FC",detail:tier+" · est. "+rng.int(1878,1912),x:fcx,y:fcy});
  world.landmarks.push({x:fcx,y:fcy,type:"stadium",name:world.main.name+" "+fcSuf+" FC"});
  {
    // ground the paper on a centre cell
    let px2=world.main.x,py2=world.main.y;
    outer:for(let r2=0;r2<14;r2++)for(let a2=0;a2<16;a2++){
      const x2=Math.round(world.main.x+r2*Math.cos(a2)),y2=Math.round(world.main.y+r2*Math.sin(a2));
      if(x2<0||y2<0||x2>=world.N||y2>=world.N)continue;
      const c2=world.landUse[y2*world.N+x2];
      if(c2===LU.highStreet||c2===LU.cbd){px2=x2;py2=y2;break outer;}
    }
    inst.push({kind:"Newspaper",name:"The "+world.main.name+" "+rng.pick(["Chronicle","Courier","Argus","Gazette","Examiner","Telegraph","Post"]),detail:"est. "+rng.int(1832,1888),x:px2,y:py2});
    inst.push({kind:"Market",name:world.main.name+" Market",detail:rng.pick(["Tuesday","Wednesday","Thursday","Saturday"])+(rng.chance(0.5)?" & Saturday":""),x:px2,y:py2});
    inst.push({kind:"College",name:world.main.name+" College",detail:"further education · est. "+rng.int(1946,1971),x:px2,y:py2});
    if(rng.chance(0.7))inst.push({kind:"Brewery",name:rng.pick(["Old ","Golden ","Black ","White "])+rng.pick(["Lion","Anchor","Swan","Bell"])+" Brewery",detail:"est. "+rng.int(1790,1870),x:px2,y:py2});
    inst.push({kind:"Theatre",name:rng.pick(["The Empire","The Hippodrome","The Playhouse","The Alhambra"]),detail:"est. "+rng.int(1890,1928),x:px2,y:py2});
  }
  
  const resv=world.landmarks.find(l=>l.type==="reservoir");
  if(resv)inst.push({kind:"Water",name:resv.name+" ("+rng.int(1868,1901)+", supplies the borough)"});
  const pw=world.landmarks.find(l=>l.type==="power");
  if(pw)inst.push({kind:"Energy",name:(pw.name||"the")+" Power Station · "+rng.pick(["CCGT","biomass conversion","decommissioning"])});
  const sew=(()=>{for(let i=0;i<world.landUse.length;i++)if(world.landUse[i]===LU.sewage)return true;return false;})();
  if(sew)inst.push({kind:"Water",name:world.main.name+" wastewater treatment works"});

  /* ---- borough GVA by sector ---- */
  const gvaBySector={};let tot=0;
  for(const s of SECTORS){let t2=0;const a=jobsSec[s];for(let i=0;i<a.length;i++)t2+=a[i];
    gvaBySector[s]=t2*SEC_GVA[s]/1000;tot+=gvaBySector[s];} // GBP m
  let jobsTotal=0;for(const s2 in gvaBySector)jobsTotal+=0;   // recomputed below
  {let jt=0;for(const s2 of Object.keys(SEC_GVA)){jt+=(world.jobsBySector&&world.jobsBySector[s2])||0;}
   jobsTotal=jt||Math.round(world.totPop*0.44);}
  world.economy={employers,institutions:inst,gvaBySector,gvaTotal:tot,jobsTotal};
}
