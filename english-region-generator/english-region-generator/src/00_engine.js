"use strict";
/* ============================================================
   ENGINE: deterministic RNG, noise, grid helpers
   All generation is seeded => fully reproducible worlds.
   ============================================================ */

function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

class RNG{
  constructor(seed){this.f=mulberry32(typeof seed==="string"?hashStr(seed):seed>>>0);}
  next(){return this.f();}
  range(a,b){return a+(b-a)*this.f();}
  int(a,b){return Math.floor(this.range(a,b+1));} // inclusive
  pick(arr){return arr[Math.floor(this.f()*arr.length)];}
  // weighted pick from [[item,weight],...]
  wpick(pairs){let tot=0;for(const p of pairs)tot+=p[1];let r=this.f()*tot;for(const p of pairs){r-=p[1];if(r<=0)return p[0];}return pairs[pairs.length-1][0];}
  chance(p){return this.f()<p;}
  gauss(mu=0,sd=1){ // Box-Muller
    let u=0,v=0;while(u===0)u=this.f();while(v===0)v=this.f();
    return mu+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }
  shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(this.f()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  fork(tag){return new RNG(hashStr(tag)^Math.floor(this.f()*0xffffffff));}
}

/* ---------- lattice value noise + fBm ---------- */
function makeNoise2D(seed){
  const perm=new Uint8Array(512);const base=new Uint8Array(256);
  const r=mulberry32(seed>>>0);
  for(let i=0;i<256;i++)base[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[base[i],base[j]]=[base[j],base[i]];}
  for(let i=0;i<512;i++)perm[i]=base[i&255];
  const grad=(h,x,y)=>{switch(h&7){case 0:return x+y;case 1:return x-y;case 2:return -x+y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y;}};
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  return function(x,y){ // Perlin-style gradient noise, ~[-1,1]
    const X=Math.floor(x)&255,Y=Math.floor(y)&255;
    x-=Math.floor(x);y-=Math.floor(y);
    const u=fade(x),v=fade(y);
    const aa=perm[perm[X]+Y],ab=perm[perm[X]+Y+1],ba=perm[perm[X+1]+Y],bb=perm[perm[X+1]+Y+1];
    const l=(a,b,t)=>a+t*(b-a);
    return l(l(grad(aa,x,y),grad(ba,x-1,y),u),l(grad(ab,x,y-1),grad(bb,x-1,y-1),u),v)*1.42;
  };
}
function fbm(noise,x,y,oct=5,lac=2.0,gain=0.5){
  let a=0,amp=1,f=1,norm=0;
  for(let i=0;i<oct;i++){a+=amp*noise(x*f,y*f);norm+=amp;amp*=gain;f*=lac;}
  return a/norm;
}
function ridged(noise,x,y,oct=5,lac=2.0,gain=0.5){
  let a=0,amp=1,f=1,norm=0;
  for(let i=0;i<oct;i++){a+=amp*(1-Math.abs(noise(x*f,y*f)));norm+=amp;amp*=gain;f*=lac;}
  return a/norm; // [0..~1], ridge crests near 1
}

/* ---------- misc ---------- */
const clamp=(x,a,b)=>x<a?a:(x>b?b:x);
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function dist(x1,y1,x2,y2){const dx=x1-x2,dy=y1-y2;return Math.sqrt(dx*dx+dy*dy);}

/* Poisson-ish blue-noise sampler over grid with score function */
function bestCandidateSites(rng,N,count,minDist,score){
  const sites=[];
  const tries=count*45;
  for(let t=0;t<tries&&sites.length<count;t++){
    const x=rng.int(2,N-3),y=rng.int(2,N-3);
    const s=score(x,y);
    if(s<=0)continue;
    let ok=true;
    for(const p of sites){if(dist(x,y,p.x,p.y)<minDist){ok=false;break;}}
    if(ok&&rng.chance(clamp(s,0.05,1)))sites.push({x,y,score:s});
  }
  return sites;
}

/* simple binary heap priority queue (min) */
class MinHeap{
  constructor(){this.a=[];}
  push(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
  pop(){const a=this.a;const top=a[0];const last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}return top;}
  get size(){return this.a.length;}
}
