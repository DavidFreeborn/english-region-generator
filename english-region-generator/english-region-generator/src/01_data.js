"use strict";
/* ============================================================
   REGIONAL DOMAIN DATABASE
   Encodes (in simplified but faithful form):
   - stratigraphy & lithology per English region, ordered from
     oldest/most-resistant (upland end of dip) to youngest/softest
     (lowland end). England's grand structure: strata dip gently
     SE, scarps face NW; uplands expose older resistant rock.
   - resource geology (coal measures, ironstone, tin, salt, clay)
   - place-name stratigraphy: Brittonic substrate, Old English,
     Old Norse (Danelaw), Norman-French affixes; regional
     generics for streams and valleys.
   - industrial-era economic drivers, building materials,
   - DATA-FITTED demographic priors: class-level means of ONS Census 2021
   local-authority profiles (training split of reference/atlas_ethnicity_2021.json,
   fitted 2026-07-18; cells without a region-class training example use the
   pooled national class mean and are recorded as such in fitted_priors.json).
   Values are priors for a *typical* settlement of each class in
   the region; per-ward variation is modelled downstream.
   ============================================================ */

/* Lithology palette. resist: erosion resistance 0..1 (drives relief).
   soil: 0..1 arable quality of derived soils. */
const LITH = {
  granite:   {name:"Granite (Cornubian batholith)", era:"Permian intrusion", color:"#c9a0b4", resist:0.97, soil:0.12, aquifer:false, moor:true, minerals:["tin","chinaclay"]},
  volcanics: {name:"Borrowdale-type volcanics",     era:"Ordovician",  color:"#b08bc0", resist:0.98, soil:0.10, aquifer:false, moor:true},
  slate:     {name:"Slates & killas",               era:"Devonian",    color:"#9aa3b5", resist:0.72, soil:0.35, aquifer:false, minerals:["tin"]},
  carbLst:   {name:"Carboniferous Limestone",       era:"Carboniferous",color:"#8fb4c9", resist:0.88, soil:0.35, aquifer:true, karst:true},
  gritstone: {name:"Millstone Grit",                era:"Carboniferous",color:"#b5a58c", resist:0.90, soil:0.15, aquifer:false, moor:true},
  coalMeas:  {name:"Coal Measures",                 era:"Carboniferous",color:"#8c8478", resist:0.55, soil:0.45, aquifer:false, coal:true, minerals:["ironstone","fireclay"]},
  culm:      {name:"Culm Measures",                 era:"Carboniferous",color:"#a3a08a", resist:0.55, soil:0.30, aquifer:false},
  magLst:    {name:"Magnesian Limestone",           era:"Permian",     color:"#e3d9a8", resist:0.70, soil:0.60, aquifer:true},
  redSst:    {name:"Permo-Triassic Sandstone",      era:"Permo-Triassic",color:"#e0a884", resist:0.52, soil:0.62, aquifer:true},
  mudstone:  {name:"Mercia Mudstone",               era:"Triassic",    color:"#d98f7e", resist:0.30, soil:0.62, minerals:["salt","gypsum"]},
  lias:      {name:"Lias clays & limestones",       era:"Early Jurassic",color:"#b4c4a0", resist:0.34, soil:0.60},
  oolite:    {name:"Oolitic Limestone",             era:"Mid Jurassic",color:"#e8d590", resist:0.68, soil:0.55, aquifer:true, minerals:["ironstone","freestone"]},
  oxClay:    {name:"Oxford & Kimmeridge Clay",      era:"Late Jurassic",color:"#adbfa8", resist:0.24, soil:0.55, minerals:["brickclay"]},
  greensand: {name:"Greensand",                     era:"Cretaceous",  color:"#c2cf9a", resist:0.55, soil:0.40, aquifer:true, heath:true},
  wealdClay: {name:"Weald Clay",                    era:"Cretaceous",  color:"#a8c2a2", resist:0.25, soil:0.50, minerals:["brickclay","wealdiron"]},
  hwSst:     {name:"High Weald sandstones",         era:"Cretaceous",  color:"#c7b98f", resist:0.62, soil:0.35, wooded:true, minerals:["wealdiron"]},
  chalk:     {name:"Chalk",                         era:"Late Cretaceous",color:"#eef0da", resist:0.72, soil:0.55, aquifer:true, downland:true},
  londClay:  {name:"London Clay",                   era:"Eocene",      color:"#b7ab95", resist:0.22, soil:0.50, minerals:["brickclay"]},
  crag:      {name:"Crag sands",                    era:"Pliocene",    color:"#e6cf9e", resist:0.20, soil:0.45, softCoast:true},
  till:      {name:"Glacial till (boulder clay)",   era:"Quaternary",  color:"#cfc6ae", resist:0.28, soil:0.68, softCoast:true},
  fen:       {name:"Fen peat & silt",               era:"Holocene",    color:"#c4d6c0", resist:0.05, soil:0.90, fen:true, softCoast:true},
  alluvium:  {name:"Alluvium",                      era:"Holocene",    color:"#d9e4cf", resist:0.08, soil:0.80, flood:true},
};

/* Old-English personal-name stems & topographic firsts (shared) */
const OE_PERS = ["Ead","Aelf","Aethel","Beorn","Cyne","Ecg","Wulf","Sige","Os","Dunn","Hild","Cuth","Wil","Leof","Aldwin","Bald","Here","Ord","God","Wig","Eorm","Frith"];
const OE_PERS_SHORT = ["Ed","El","Ath","Barn","Ken","Edge","Wool","Sey","Os","Dun","Hil","Cud","Wil","Lev","Ald","Bal","Har","Or","God","Wy","Arm","Frit",
  "Aeth","Beorn","Cyne","Dud","Ead","Ecg","Folc","Gar","Hild","Hun","Leof","Man","Off","Pad","Sig","Tid","Tor","Wend","Wig","Wulf","Bass","Bill","Bly","Bot","Cea","Ceol","Cott","Dodd","Ebb","Emm","Gild","Gos","Hemm","Hux","Idd","Kemp","Lull","Mund","Ord","Ott","Pott","Sax","Snod","Tadd","Ugg","Wass","Wibb","Winn"];
const ON_PERS = ["Grim","Orm","Thor","Ketel","Gunn","Asl","Swein","Ulf","Skel","Ran","Hakon","Kol","Toki","Brand","Sten","Auk","Ing","Ravn"];
const ON_PERS_ANG = ["Grim","Orm","Thur","Kettle","Gun","As","Swain","Ul","Skel","Ran","Hack","Cole","Tock","Brand","Stain","Oak","Ing","Raven",
  "Ask","Brack","Carl","Crox","Dan","Flax","Gam","Gauk","Hax","Kell","Kirk","Laz","Lound","Osgo","Rauce","Scaw","Scrat","Sig","Skeg","Snel","Sturs","Thirk","Thor","Toft","Ulce","Wick","Wraw"];
const TOPO_FIRST = ["Stan","Mere","Wood","Brad","Lang","Mickle","Ash","Thorn","Alder","Hazel","Sand","Clay","Fen","Marsh","Moor","Shel","Whit","Black","Red","Stone","Well","Cold","Broad","Nether","Over","High","Low","Mid","North","South","East","West","New","Old","Mill","Salt","Church","Kirk","Hare","Fox","Swin","Ox","Shep","Cal","Hor","Wal","Har","Bar","Chad","Pen",
  "Elm","Birch","Maple","Withy","Sallow","Bramble","Furze","Ling","Bent","Rush","Sedge","Reed","Crab","Plum","Apple","Pear","Berry","Haw","Sloe","Hip","Bracken","Gorse","Heather","Brere","Holly","Ivy","Yew","Box","Lime","Beech","Aspen","Poplar","Willow","Horn","Chest","Service","Rown","Quick","Eller","Owler","Seal","Segg","Star","Sun","Wind","Storm","Frost","Snow","Rain","Cloud","Shade","Light","Dark","Grey","Green","Brown","Gold","Silver","Copper","Iron","Lead","Tin","Chalk","Flint","Grit","Shingle","Pebble","Crag","Scar","Cliff","Bank","Brink","Edge","Ridge","Comb","Hollow","Dell","Dingle","Slade","Slack","Gill","Clough","Sike","Beck","Brook","Bourne","Spring","Fount","Pool","Tarn","Lake","Flash","Wash","Bridge","Wath","Stath","Hythe","Key","Port","Haven","Cove","Ness","Point","Head","Bill","Spit","Bay","Sound"];

const REGIONS = {
  "north-east": {
    label:"North East", rain:750, upRain:1300, arableBias:0.35,
    strata:[["volcanics",0.05],["carbLst",0.14],["gritstone",0.12],["coalMeas",0.30],["magLst",0.16],["mudstone",0.13],["till",0.10]],
    stratumNoise:0.35, coastType:"mixed",
    stream:"Burn", valley:["Dene","Dale"], hill:["Law","Fell","Edge"],
    topony:{oe:0.62,on:0.16,celtic:0.06,norman:0.16,
      suffixes:[["ton",22],["ham",8],["ington",10],["ley",6],["field",5],["worth",3],["burn",8],["den",4],["shiels",4],["hope",5],["law",4],["wick",4],["by",3],["ford",0],["chester",0],["le-street",3],["haugh",3],["side",3]],
      streetGate:false, chesterForm:"chester"},
    industry:{coal:0.95, textile:null, steel:0.6, ship:0.85, fish:0.6, chem:0.5, eng:0.7, brew:0.3, pottery:0, hosiery:0, hitech:0.15, naval:0.1, resort:0.4, glass:0.4},
    build:{terrace:"stone-and-brick colliery rows", brick:"buff and red brick", stone:"sandstone", roof:"Welsh slate & pantile"},
    demo:{ /* [WB, WhiteOther, Pak, Ind, Bang, BlkAfr, BlkCar, Chin, Mixed, Other] percentages */
      city:[79.5,2.5,6.2,1.9,0.4,2.3,0.1,0.5,2.1,4.5], town:[90.3,2.6,1.35,0.95,0.4,0.65,0.1,0.35,1.4,1.9],
      small:[93.4,1.85,0.78,0.53,0.25,0.38,0.05,0.28,1.15,1.35], village:[96.5,1.1,0.2,0.1,0.1,0.1,0,0.2,0.9,0.8],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.335,town:0.26,small:0.24,village:0.30}, badHealthBias:1.25},
    leBase:[77.9,81.8], gvaIndex:0.82,
  },
  "north-west": {
    label:"North West", rain:1150, upRain:1900, arableBias:0.22,
    strata:[["volcanics",0.07],["carbLst",0.10],["gritstone",0.14],["coalMeas",0.24],["redSst",0.18],["mudstone",0.15],["till",0.12]],
    stratumNoise:0.4, coastType:"soft",
    stream:"Brook", valley:["Clough","Dale","Bottom"], hill:["Fell","Pike","Edge","Moss"],
    topony:{oe:0.55,on:0.26,celtic:0.08,norman:0.11,
      suffixes:[["ton",20],["ham",6],["ley",12],["by",7],["thwaite",5],["field",4],["worth",5],["shaw",5],["bottom",4],["clough",3],["wick",3],["dale",3],["beck",3],["ford",0],["chester",0],["stock",3],["moss",4],["hulme",4]],
      streetGate:true, chesterForm:"chester"},
    industry:{coal:0.85, textile:"cotton", steel:0.25, ship:0.55, fish:0.45, chem:0.75, eng:0.8, brew:0.5, pottery:0.1, hosiery:0, hitech:0.3, naval:0.05, resort:0.7, glass:0.5},
    build:{terrace:"red-brick two-up-two-downs", brick:"Accrington red brick", stone:"gritstone", roof:"Welsh slate"},
    demo:{
      city:[72.82,5.22,3.2,7.82,0.66,2.22,0.42,0.82,2.54,4.28], town:[89.25,4.6,0.6,0.85,0.2,0.4,0.1,0.5,1.6,1.9],
      small:[91.64,3.48,0.39,0.61,0.12,0.35,0.15,0.39,1.4,1.48], village:[94.03,2.37,0.17,0.37,0.03,0.3,0.2,0.27,1.2,1.07],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.36,town:0.27,small:0.26,village:0.33}, badHealthBias:1.2},
    leBase:[78.2,82.0], gvaIndex:0.89,
  },
  "yorkshire": {
    label:"Yorkshire & the Humber", rain:850, upRain:1550, arableBias:0.45,
    strata:[["carbLst",0.10],["gritstone",0.17],["coalMeas",0.26],["magLst",0.09],["redSst",0.14],["oxClay",0.06],["chalk",0.09],["till",0.09]],
    stratumNoise:0.35, coastType:"mixed",
    stream:"Beck", valley:["Dale","Gill","Clough"], hill:["Fell","Moor","Edge","Howe"],
    topony:{oe:0.44,on:0.38,celtic:0.04,norman:0.14,
      suffixes:[["ton",16],["by",14],["thorpe",9],["ley",9],["thwaite",4],["ham",4],["field",5],["royd",4],["worth",4],["wick",3],["gate",0],["dale",4],["beck",3],["kirk",4],["holme",4],["stone",3],["sett",2]],
      streetGate:true, chesterForm:"caster"},
    industry:{coal:0.9, textile:"wool", steel:0.8, ship:0.35, fish:0.7, chem:0.35, eng:0.7, brew:0.55, pottery:0.1, hosiery:0.1, hitech:0.2, naval:0, resort:0.6, glass:0.35},
    build:{terrace:"blackened gritstone terraces (west), red brick (south & east)", brick:"red brick", stone:"millstone grit / magnesian limestone", roof:"stone flag & Welsh slate"},
    demo:{
      city:[87.3,5.2,0.3,0.9,0.2,0.5,0.1,1.4,1.8,2.3], town:[88.42,3.88,1.14,1.22,0.26,0.84,0.16,0.42,1.72,1.94],
      small:[91.51,3.24,0.67,0.81,0.13,0.52,0.13,0.31,1.31,1.37], village:[94.6,2.6,0.2,0.4,0,0.2,0.1,0.2,0.9,0.8],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.34,town:0.26,small:0.25,village:0.32}, badHealthBias:1.15},
    leBase:[78.3,82.1], gvaIndex:0.85,
  },
  "east-midlands": {
    label:"East Midlands", rain:680, upRain:1100, arableBias:0.62,
    strata:[["carbLst",0.07],["gritstone",0.08],["coalMeas",0.20],["redSst",0.14],["mudstone",0.16],["lias",0.14],["oolite",0.13],["oxClay",0.08]],
    stratumNoise:0.32, coastType:"soft",
    stream:"Brook", valley:["Dale","Vale"], hill:["Edge","Hill","Cliff"],
    topony:{oe:0.46,on:0.34,celtic:0.04,norman:0.16,
      suffixes:[["ton",18],["by",13],["thorpe",10],["ham",5],["ley",6],["field",5],["worth",4],["well",4],["stone",4],["ington",5],["wick",3],["stow",3],["borough",4],["dale",2],["cliffe",3]],
      streetGate:true, chesterForm:"caster"},
    industry:{coal:0.85, textile:"hosiery", steel:0.6, ship:0, fish:0.15, chem:0.2, eng:0.7, brew:0.6, pottery:0.05, hosiery:0.9, hitech:0.25, naval:0, resort:0.35, glass:0.1, quarry:0.7},
    build:{terrace:"red-brick bay-window terraces", brick:"orange-red brick", stone:"ironstone & oolite (south)", roof:"Welsh slate & Swithland"},
    demo:{
      city:[33.2,7.3,3.4,34.3,1.9,5.8,1.2,0.7,3.8,8.4], town:[88.42,3.88,1.14,1.22,0.26,0.84,0.16,0.42,1.72,1.94],
      small:[89.71,3.64,0.62,0.91,0.13,0.72,0.33,0.41,1.76,1.77], village:[91,3.4,0.1,0.6,0,0.6,0.5,0.4,1.8,1.6],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.33,town:0.27,small:0.26,village:0.33}, badHealthBias:1.05},
    leBase:[79.2,82.9], gvaIndex:0.88,
  },
  "west-midlands": {
    label:"West Midlands", rain:740, upRain:1150, arableBias:0.5,
    strata:[["volcanics",0.05],["carbLst",0.05],["coalMeas",0.24],["redSst",0.19],["mudstone",0.22],["lias",0.15],["oolite",0.10]],
    stratumNoise:0.38, coastType:"none",
    stream:"Brook", valley:["Vale","Dingle"], hill:["Edge","Hill","Bank"],
    topony:{oe:0.68,on:0.06,celtic:0.08,norman:0.18,
      suffixes:[["ton",18],["ley",13],["ham",6],["field",7],["worth",6],["wich",5],["hall",5],["bury",5],["cote",4],["ington",5],["stone",4],["heath",5],["green",5],["end",4],["hill",4]],
      streetGate:false, chesterForm:"cester"},
    industry:{coal:0.85, textile:null, steel:0.75, ship:0, fish:0, chem:0.35, eng:0.95, brew:0.75, pottery:0.85, hosiery:0.1, hitech:0.25, naval:0, resort:0.05, glass:0.6, metal:0.95},
    build:{terrace:"red and blue brick terraces", brick:"Staffordshire red & blue brick", stone:"sandstone (churches)", roof:"clay tile & slate"},
    demo:{
      city:[78.5,4.7,6,1.1,0.6,2,0.4,0.4,2.3,4], town:[83,5,1.8,2.5,0.1,2.1,0.4,0.4,2.6,2.1],
      small:[88.52,3.69,0.98,1.44,0.07,1.2,0.3,0.34,1.9,1.58], village:[94.03,2.37,0.17,0.37,0.03,0.3,0.2,0.27,1.2,1.07],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.315,town:0.26,small:0.25,village:0.32}, badHealthBias:1.1},
    leBase:[78.8,82.7], gvaIndex:0.87,
  },
  "east": {
    label:"East of England", rain:610, upRain:750, arableBias:0.88,
    strata:[["chalk",0.28],["till",0.30],["crag",0.12],["londClay",0.14],["fen",0.16]],
    stratumNoise:0.5, coastType:"soft",
    stream:"Beck", valley:["Vale","Dell"], hill:["Hill","Heath"],
    topony:{oe:0.62,on:0.18,celtic:0.03,norman:0.17,
      suffixes:[["ham",16],["ton",14],["field",7],["ford",0],["worth",5],["stead",6],["by",5],["thorpe",5],["ley",5],["wich",4],["market",0],["den",3],["ey",4],["fen",3],["toft",3],["bourn",4],["well",4],["hall",4]],
      streetGate:false, chesterForm:"chester"},
    industry:{coal:0, textile:"woollens-historic", steel:0, ship:0.15, fish:0.7, chem:0.2, eng:0.5, brew:0.85, pottery:0, hosiery:0, hitech:0.7, naval:0.15, resort:0.7, agriproc:0.9},
    build:{terrace:"gault-brick and render terraces", brick:"gault (white) & soft red brick", stone:"flint with stone dressings", roof:"pantile, thatch on cottages"},
    demo:{
      city:[72.82,5.22,3.2,7.82,0.66,2.22,0.42,0.82,2.54,4.28], town:[88.42,3.88,1.14,1.22,0.26,0.84,0.16,0.42,1.72,1.94],
      small:[91.22,3.12,0.65,0.79,0.15,0.57,0.18,0.34,1.46,1.5], village:[94.03,2.37,0.17,0.37,0.03,0.3,0.2,0.27,1.2,1.07],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.37,town:0.30,small:0.28,village:0.35}, badHealthBias:0.9},
    leBase:[80.3,83.8], gvaIndex:0.95,
  },
  "south-east": {
    label:"South East", rain:720, upRain:950, arableBias:0.55,
    strata:[["chalk",0.30],["greensand",0.12],["wealdClay",0.20],["hwSst",0.14],["londClay",0.14],["alluvium",0.10]],
    stratumNoise:0.35, coastType:"chalk",
    stream:"Bourne", valley:["Bottom","Vale","Dean"], hill:["Down","Hill","Beacon"],
    topony:{oe:0.72,on:0.02,celtic:0.05,norman:0.21,
      suffixes:[["ham",12],["ton",12],["ing",7],["stead",6],["hurst",7],["den",6],["fold",4],["ley",6],["field",5],["bourne",6],["worth",4],["dean",4],["mere",3],["wick",3],["combe",4],["sted",3],["down",4]],
      streetGate:false, chesterForm:"chester"},
    industry:{coal:0.05, textile:null, steel:0.05, ship:0.3, fish:0.5, chem:0.15, eng:0.5, brew:0.6, pottery:0.05, hosiery:0, hitech:0.75, naval:0.7, resort:0.9, commuter:0.9, wealdiron:0.4},
    build:{terrace:"stock-brick and tile-hung terraces", brick:"London stock & red brick", stone:"flint, ragstone", roof:"clay tile, weatherboard gables"},
    demo:{
      city:[72.82,5.22,3.2,7.82,0.66,2.22,0.42,0.82,2.54,4.28], town:[88.42,3.88,1.14,1.22,0.26,0.84,0.16,0.42,1.72,1.94],
      small:[91.22,3.12,0.65,0.79,0.15,0.57,0.18,0.34,1.46,1.5], village:[94.03,2.37,0.17,0.37,0.03,0.3,0.2,0.27,1.2,1.07],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.42,town:0.35,small:0.33,village:0.40}, badHealthBias:0.82},
    leBase:[80.6,84.1], gvaIndex:1.08,
  },
  "south-west": {
    label:"South West", rain:1050, upRain:1900, arableBias:0.3,
    strata:[["granite",0.13],["slate",0.26],["culm",0.16],["redSst",0.14],["lias",0.13],["oolite",0.10],["chalk",0.08]],
    stratumNoise:0.42, coastType:"hard",
    stream:"Water", valley:["Combe","Bottom","Vale"], hill:["Tor","Beacon","Down"],
    topony:{oe:0.48,on:0.01,celtic:0.32,norman:0.19,
      suffixes:[["ton",12],["combe",10],["ford",0],["worthy",6],["hayes",4],["ham",5],["cott",6],["ley",4],["stock",4],["bury",4],["well",4],["don",4],["mouth",0],["tre",0],["pol",0],["pen",0],["lan",0],["stow",4],["zeal",2],["beer",2]],
      celticPref:["Tre","Pen","Pol","Lan","Ros","Car"], streetGate:false, chesterForm:"cester"},
    industry:{coal:0.02, textile:"woollens-historic", steel:0, ship:0.35, fish:0.85, chem:0.05, eng:0.35, brew:0.5, pottery:0.1, hosiery:0, hitech:0.3, naval:0.75, resort:0.95, mining:"tin", agriproc:0.7, quarry:0.6},
    build:{terrace:"rendered and slate-hung terraces", brick:"local brick (east), render (west)", stone:"granite, killas slate, cob; Bath stone (NE)", roof:"scantle slate, thatch",},
    demo:{
      city:[85.6,6.4,0.1,0.9,0.2,0.5,0.3,1.1,2.7,2.2], town:[88.42,3.88,1.14,1.22,0.26,0.84,0.16,0.42,1.72,1.94],
      small:[91.22,3.12,0.65,0.79,0.15,0.57,0.18,0.34,1.46,1.5], village:[94.03,2.37,0.17,0.37,0.03,0.3,0.2,0.27,1.2,1.07],
      millTown:[56.9,3.3,17.8,15.8,1,0.7,0.1,0.3,1.7,2.4], degrees:{city:0.38,town:0.31,small:0.29,village:0.36}, badHealthBias:0.9},
    leBase:[80.2,83.9], gvaIndex:0.90,
  },
};

const ETH_LABELS = ["White British","White Other","Pakistani","Indian","Bangladeshi","Black African","Black Caribbean","Chinese","Mixed","Other"];
const ETH_COLORS = ["#8fa6b8","#b8c9d6","#2e8b57","#e2953a","#4fae8f","#8a5fb0","#c25b8a","#d94f4f","#c9b458","#7d7d7d"];

/* Era palette for building-age lens (real construction eras) */
const ERAS = [
  {id:"medieval",  label:"Medieval core (pre-1700)",  color:"#7c3f2c"},
  {id:"georgian",  label:"Georgian & Regency (1700-1837)", color:"#b06a3b"},
  {id:"victorian", label:"Victorian & Edwardian (1837-1914)", color:"#c33d2e"},
  {id:"interwar",  label:"Interwar (1918-1939)", color:"#d98f3e"},
  {id:"postwar",   label:"Post-war (1945-1979)", color:"#e0c04f"},
  {id:"late20",    label:"Late C20 (1980-1999)", color:"#9fbf5a"},
  {id:"modern",    label:"2000-present", color:"#57a0c9"},
];

/* ATLAS_FIT: ethnicity priors fitted from ONS Census 2021 (see reference atlas
   in the methodology). Applied over hand-set priors; cells not listed remain
   hand-set and are labelled uncalibrated. Small n per cell is reported. */
const ATLAS_FIT={
  "east-midlands/city":{n:2,eth:[61.8, 7.5, 7.3, 4.2, 0.5, 4.0, 2.0, 0.9, 4.8, 3.1]},
  "east-midlands/town":{n:1,eth:[88.7, 5.3, 0.6, 0.7, 1.1, 0.4, 0.1, 0.3, 1.1, 0.8]},
  "north-east/city":{n:1,eth:[79.5, 2.5, 6.2, 1.9, 0.4, 2.3, 0.1, 0.5, 2.1, 2.4]},
  "north-east/town":{n:4,eth:[93.0, 1.9, 0.8, 0.6, 0.3, 0.5, 0.1, 0.3, 1.1, 0.7]},
  "north-west/millTown":{n:1,eth:[56.9, 3.3, 17.8, 15.8, 1.0, 0.7, 0.1, 0.3, 1.7, 1.4]},
  "south-west/city":{n:1,eth:[71.6, 9.2, 1.9, 1.8, 0.6, 3.8, 1.4, 1.2, 4.5, 1.9]},
  "west-midlands/city":{n:1,eth:[78.5, 4.7, 6.0, 1.1, 0.6, 2.0, 0.4, 0.4, 2.3, 1.7]},
  "west-midlands/village":{n:1,eth:[91.1, 5.5, 0.1, 0.5, 0.0, 0.2, 0.1, 0.2, 1.1, 0.5]},
  "yorkshire/city":{n:1,eth:[83.9, 7.6, 0.5, 0.5, 0.5, 1.6, 0.1, 0.5, 1.7, 1.8]},
  "yorkshire/town":{n:1,eth:[92.6, 3.5, 0.2, 0.3, 0.2, 0.4, 0.1, 0.3, 1.0, 0.7]},
  "yorkshire/village":{n:1,eth:[94.6, 2.6, 0.2, 0.4, 0.0, 0.2, 0.1, 0.2, 0.9, 0.4]},
};
for(const key in ATLAS_FIT){const [r,c]=key.split('/');if(REGIONS[r]&&REGIONS[r].demo){REGIONS[r].demo[c]=ATLAS_FIT[key].eth.slice();(REGIONS[r].demo.fitted=REGIONS[r].demo.fitted||{})[c]=ATLAS_FIT[key].n;}}
