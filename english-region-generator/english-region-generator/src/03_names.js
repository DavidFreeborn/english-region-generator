"use strict";
/* ============================================================
   TOPONYMY
   English place-names are a palimpsest: Brittonic river names
   survive almost everywhere; Old English elements dominate
   settlement names; Old Norse (-by, -thorpe, -thwaite, -kirk)
   marks the Danelaw; Norman-French arrives as affixes
   (Magna/Parva, Regis, -le-Street) rather than new coinages;
   functional suffixes are conditioned on the actual site
   (-ford at crossings, -mouth at estuaries, -combe in SW
   valleys, -hurst in wooded Wealden country, -by on Danelaw
   farmland). Roman-origin towns take river-root + the regional
   reflex of "castra" (-chester / -caster / -cester).
   ============================================================ */

const RIVER_ON = ["A","E","I","O","U","Ai","Ea","Ou","Y","Al","Ar","Av","Ax","Br","Cal","Char","Col","Cul","Dar","De","Der","Do","Du","Ex","Fro","Ir","Ke","Ler","Lu","Med","Ny","Ot","Rib","Ro","Se","Ta","Te","Tre","Ty","We","Wy","Yar","Ad","Aln","Am","An","Ba","Bea","Bla","Bo","Bra","Bre","Ca","Ce","Che","Chu","Cla","Cle","Co","Cra","Cre","Da","Dea","Dea","Dee","Din","Ea","Eb","Ed","Ell","Er","Es","Fa","Fe","Fin","Fo","Ga","Gle","Go","Gra","Gre","Ha","Hu","Id","Il","In","Is","It","Ke","Ki","La","Lea","Li","Lo","Ly","Ma","Me","Mi","Mo","Na","Ne","Ni","No","Nu","Oa","Ol","On","Or","Pa","Pe","Pi","Po","Ra","Rea","Re","Ri","Ru","Ry","Sa","Sca","Se","Sha","She","Si","Ska","Ske","So","Spe","Sto","Stu","Swa","Sy","Tam","Tar","Tea","Tei","Tha","Thu","Ti","To","Tor","Tu","Ur","Us","Va","Ve","Wa","Wan","Wea","Wel","Wen","Wi","Wo","Wre","Yea","Yo"];
const RIVER_END = ["ne","n","me","re","der","went","vern","low","well","ver","dle","ent","on","un","er","e","ey","w","rne","ther","don","vy","tha","ta","dda","dder","ddle","nnow","llen","llon","rrow","rack","von","ven","vet","veny","ret","rit","rant","land","lan","ling","lyn","dhope","sk","ske","se","sey","the","then","dern","dale","der","nning","nter","ster","ther","tt","ttle"];

const REAL_PLACES=new Set(("london,birmingham,manchester,leeds,liverpool,sheffield,bristol,newcastle,nottingham,leicester,coventry,bradford,stoke,wolverhampton,plymouth,derby,southampton,portsmouth,brighton,hull,preston,luton,milton keynes,norwich,bournemouth,swindon,sunderland,oxford,cambridge,york,ipswich,peterborough,gloucester,exeter,bath,chester,carlisle,durham,lancaster,lincoln,winchester,salisbury,canterbury,worcester,hereford,ely,truro,ripon,wells,wakefield,doncaster,rotherham,barnsley,halifax,huddersfield,oldham,rochdale,bolton,bury,wigan,stockport,blackburn,blackpool,burnley,southport,warrington,chesterfield,mansfield,grimsby,scunthorpe,darlington,gateshead,middlesbrough,hartlepool,reading,slough,watford,basildon,southend,chelmsford,colchester,maidstone,dover,hastings,eastbourne,crawley,guildford,woking,aldershot,basingstoke,andover,newbury,taunton,yeovil,bridgwater,barnstaple,torquay,paignton,exmouth,falmouth,penzance,stives,newquay,bodmin,launceston,tavistock,dartmouth,totnes,kingsbridge,marlow,henley,windsor,ascot,staines,epsom,dorking,reigate,horsham,lewes,rye,deal,margate,ramsgate,whitstable,faversham,ashford,tonbridge,sevenoaks,dartford,gravesend,rochester,gillingham,weston,clevedon,portishead,frome,trowbridge,devizes,marlborough,chippenham,cirencester,stroud,tewkesbury,evesham,ludlow,shrewsbury,oswestry,stafford,lichfield,tamworth,nuneaton,rugby,warwick,stratford,banbury,bicester,witney,abingdon,didcot,thame,aylesbury,buckingham,bedford,hitchin,stevenage,hertford,ware,harlow,braintree,witham,maldon,clacton,harwich,sudbury,haverhill,newmarket,thetford,diss,beccles,lowestoft,cromer,hunstanton,kingslynn,wisbech,march,spalding,boston,skegness,louth,horncastle,sleaford,grantham,stamford,oakham,melton,loughborough,hinckley,kettering,corby,wellingborough,northampton,daventry,towcester,brackley,olney,rushden,huntingdon,stneots,royston,saffron walden,dunmow,epping,ongar,brentwood,billericay,wickford,rayleigh,burnham,frinton,walton,felixstowe,woodbridge,aldeburgh,southwold,bungay,halesworth,framlingham,stowmarket,bury st edmunds,mildenhall,ely,chatteris,ramsey,whittlesey,crowland,bourne,ruskington,alford,mablethorpe,cleethorpes,brigg,caistor,market rasen,gainsborough,retford,worksop,ollerton,newark,southwell,bingham,keyworth,beeston,ilkeston,ripley,belper,matlock,bakewell,buxton,leek,cheadle,uttoxeter,stone,eccleshall,market drayton,whitchurch,wem,ellesmere,welshpool,bishop auckland,barnard castle,richmond,leyburn,hawes,settle,skipton,ilkley,otley,wetherby,tadcaster,selby,goole,howden,beverley,driffield,bridlington,filey,scarborough,whitby,pickering,malton,thirsk,northallerton,bedale,masham,pateley bridge,knaresborough,harrogate,boroughbridge,easingwold,helmsley,kirkbymoorside,stokesley,guisborough,redcar,saltburn,seaham,peterlee,consett,stanley,hexham,corbridge,prudhoe,ponteland,morpeth,ashington,blyth,cramlington,alnwick,amble,rothbury,wooler,berwick,haltwhistle,brampton,penrith,appleby,kirkby stephen,sedbergh,kendal,windermere,ambleside,keswick,cockermouth,workington,whitehaven,maryport,wigton,carnforth,morecambe,garstang,clitheroe,whalley,padiham,nelson,colne,barnoldswick,todmorden,hebden bridge,sowerby bridge,brighouse,cleckheaton,batley,dewsbury,ossett,pontefract,castleford,knottingley,featherstone,hemsworth,royston,penistone,stocksbridge,dronfield,eckington,staveley,bolsover,shirebrook,alfreton,heanor,long eaton,castle donington,ashby,coalville,swadlincote,burton,rugeley,cannock,brownhills,willenhall,bilston,tipton,dudley,stourbridge,halesowen,kidderminster,bewdley,bromsgrove,redditch,alcester,henley in arden,solihull,kenilworth,leamington,daventry").split(","));
class NameFactory{
  constructor(world){
    this.w=world; this.rng=world.rng.fork("names"); this.used=new Set();
    this.t=world.region.topony;
    this.saintPool=["St Mary","St Peter","St Michael","St Nicholas","All Saints","St John","St Andrew","Holy Trinity","St Cuthbert","St Chad","St Botolph","St Werburgh","St Petroc","St Wilfrid","St Helen","St Margaret","St Leonard","St Oswald"];
  }
  unique(gen){
    for(let k=0;k<40;k++){
      const n=gen();
      if(!n)continue;
      const key=n.toLowerCase().replace(/[^a-z ]/g,"");
      if(this.used.has(key))continue;
      if(REAL_PLACES.has(key)||REAL_PLACES.has(key.replace(/ /g,"")))continue;  // gazetteer collision
      this.used.add(key);return n;
    }
    const n=gen()+" "+this.rng.pick(["Heath","End","Green","Side"]); this.used.add(n.toLowerCase()); return n;
  }
  smooth(a,b){
    a=a.replace(/([a-z])\1$/,"$1");
    if(b.length&&a.length&&a[a.length-1].toLowerCase()===b[0].toLowerCase()) a=a.slice(0,-1);
    if(/[aeiou]$/i.test(a)&&/^[aeiou]/i.test(b)) a=a.slice(0,-1);
    let s=a+b; s=s.replace(/(.)\1\1/g,"$1$1");
    return s[0].toUpperCase()+s.slice(1).toLowerCase();
  }
  riverName(major){
    return this.unique(()=>{
      for(let k=0;k<25;k++){
        const n=this.smooth(this.rng.pick(RIVER_ON),this.rng.pick(RIVER_END));
        if(/[bcdfghjklmnpqrstvwxz]{3}/i.test(n))continue;       // no ugly clusters
        return n.length<3?n+"e":n;
      }
      return "Aire";
    });
  }
  streamName(){ // minor watercourse: OE/dialect generic
    const g=this.w.region.stream;
    const first=this.rng.pick(["Black","Whit","Mill","Holly","Crag","Fen","Marsh","Shire","Kid","Ash","Sand","Cold","Ox","Swin","Hag","Lady","Chur","Red","Stony","Wool"]);
    return this.unique(()=>this.smooth(first+(this.rng.chance(0.5)?"":this.rng.pick(["s","er","le"])), "")+" "+g);
  }
  /* core OE/ON compound */
  firstElement(norse){
    const r=this.rng;
    if(norse) return r.pick(ON_PERS_ANG);
    return r.chance(0.45)? r.pick(OE_PERS_SHORT) : r.pick(TOPO_FIRST);
  }
  pickSuffix(feat){
    const t=this.t, r=this.rng;
    // hard site-conditioned suffixes first
    if(feat.mouth) return "mouth";
    if(feat.crossing) return r.wpick([["ford",8],["bridge",feat.lateBridge?6:2]]);
    if(feat.harbour&&r.chance(0.4)) return r.pick(["port","haven","quay"]);
    if(feat.valleySW&&this.w.regionKey==="south-west") return "combe";
    if(feat.spring&&r.chance(0.5)) return r.pick(["well","bourne"]);
    const list=t.suffixes.filter(s=>s[1]>0);
    return r.wpick(list);
  }
  settlementName(feat={}){
    return this.unique(()=>this._settleOnce(feat));
  }
  _settleOnce(feat={}){
    const r=this.rng, t=this.t, w=this.w;
    {
      // Celtic layer (mostly SW far-west)
      if(r.chance(t.celtic*(feat.westBoost||1))){
        if(t.celticPref){
          const pre=r.pick(t.celticPref);
          const syl=r.pick(["vell","gon","din","zance","carn","meth","worra","lissick","gear","vose","nance","bury","ware","mor"]);
          return this.smooth(pre,syl)+(r.chance(0.2)?" "+r.pick(["Cross","Downs","Water"]):"");
        }
        return this.smooth(r.pick(["Pen","Crich","Cul","Marl","Bre"]),r.pick(["ton","den","low","dle","ock"]));
      }
      const norse=r.chance(t.on);
      let name;
      const suf=this.pickSuffix(feat);
      const norseSuf=["by","thorpe","thwaite","toft","kirk","holme","beck","dale","gill","sett"].includes(suf);
      const useNorse=norse||norseSuf;
      if(suf==="ington"||(suf==="ton"&&r.chance(0.3))){
        name=this.smooth(r.pick(OE_PERS_SHORT),"ington");
      } else if(suf==="ing"){
        name=this.smooth(r.pick(OE_PERS_SHORT),r.pick(["ing","ings"]));
      } else if(suf==="kirk"&&r.chance(0.5)){
        name=this.smooth("Kirk",this.firstElement(true).toLowerCase()+(r.chance(0.5)?"by":""));
      } else if(suf==="tre"||suf==="pol"||suf==="pen"||suf==="lan"){
        name=this.smooth(suf[0].toUpperCase()+suf.slice(1),r.pick(["vellan","gollan","dinnick","meor","warne"]));
      } else {
        name=this.smooth(this.firstElement(useNorse),suf);
      }
      // Norman / manorial / market affixes
      if(r.chance(t.norman*(feat.affixBoost||0.45))){
        const aff=r.wpick([["Magna/Parva",feat.village?3:0],["Great",3],["Little",feat.village?3:0],["Kings",2],["Bishops",1.5],["Market",feat.market?5:0.5],["Chipping",(w.regionKey==="south-east"||w.regionKey==="south-west")&&feat.market?3:0],["le",w.regionKey==="north-east"?3:0.3],["under",feat.underHill?3:0],["on-sea",0],["St",1.5]]);
        if(aff==="Magna/Parva") name=name+" "+r.pick(["Magna","Parva"]);
        else if(aff==="le") name=name+"-le-"+r.pick(["Street","Spring","Moor","Willows","Dale"]);
        else if(aff==="under") name=name+" under "+(feat.hillName||"Edge");
        else if(aff==="St") name=name+" St "+r.pick(["Mary","Peter","Anne","Giles","Lawrence"]);
        else name=aff+" "+name;
      }
      if(feat.onSea&&feat.resort&&r.chance(0.55)) name=name+"-on-Sea";
      if(feat.riverAffix&&r.chance(0.35)) name=name+" on "+feat.riverAffix;
      if(feat.colliery&&r.chance(0.4)) name=name+" Colliery";
      if(feat.newTown) name="New "+name;
      return name;
    }
  }
  /* Main-town naming: honours origin story */
  cityName(origin,riverName,feat){
    const r=this.rng,t=this.t;
    return this.unique(()=>{
      if(origin==="roman"&&riverName&&r.chance(0.8)){
        let root=riverName.replace(/[aeiou]+$/i,"");
        if(root.length<3)root=riverName.length>=3?riverName:this.firstElement(false);
        if(root.length>6)root=root.slice(0,5);
        return this.smooth(root,t.chesterForm);
      }
      if(origin==="minster"&&r.chance(0.6)) return this.smooth(this.firstElement(false),"minster");
      if(origin==="harbour"&&riverName&&feat.mouth&&r.chance(0.7)) return this.smooth(riverName,"mouth");
      if(origin==="burh"&&r.chance(0.5)) return this.smooth(this.firstElement(false),r.pick(["bury","borough","brough"]));
      if(origin==="norman"&&r.chance(0.4)) return r.pick(["Castleton","Newborough","Beauchamp","Belmont","Montford","Beaulea","Grosmont"].filter(n=>!this.used.has(n.toLowerCase())))||this._settleOnce(feat);
      return this._settleOnce(feat);
    });
  }
  wardStub(){const r=this.rng;return this.smooth(r.pick(TOPO_FIRST),r.pick(["ley","field","holme","croft","worth","den"]));}
  hillName(){const r=this.rng;return this.unique(()=>this.smooth(r.pick(TOPO_FIRST),r.chance(0.4)?"":r.pick(["er","in","s"]))+" "+r.pick(this.w.region.hill));}
  moorName(){const r=this.rng;return this.unique(()=>this.smooth(r.pick(["Black","Wither","Ravens","Stan","Bleak","Har","Grim","Whit","Dun","Ox"]),r.pick(["","stone","den","hope","shaw"]))+" Moor");}
  wardName(basis){ // basis: settlement name | landmark | field
    const r=this.rng;
    if(basis) return basis;
    const kind=r.wpick([["saint",3],["field",3],["gate",this.t.streetGate?2:0.3],["park",2],["compound",4]]);
    if(kind==="saint") return r.pick(this.saintPool)+"'s";
    if(kind==="gate") return r.pick(["North","East","West","Micklegate","Monk","Walm","Fisher"])+ (r.chance(0.6)?"gate":" Gate");
    if(kind==="field") return this.smooth(this.firstElement(false),r.pick(["field","fields"]));
    if(kind==="park") return this.smooth(this.firstElement(false),"")+" Park";
    return this.settlementName({village:true});
  }
  streetHigh(){return this.rng.chance(0.8)?"High Street":this.rng.pick(["Market Street","Fore Street","Front Street"]);}
}
