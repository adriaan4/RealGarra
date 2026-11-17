const http=require('http'),fs=require('fs'),path=require('path');
const SV=path.join(process.env.DATA_DIR||path.join(__dirname,'..','data'),'barro');fs.mkdirSync(SV,{recursive:true});
const REAL=JSON.parse(fs.readFileSync(path.join(__dirname,'real.json'),'utf8'));
const FM={'1-2-1':[1,2,1],'2-1-1':[2,1,1],'1-1-2':[1,1,2],'2-2':[2,2,0]};
const slots=f=>['GK',...Array(FM[f][0]).fill('DEF'),...Array(FM[f][1]).fill('MID'),...Array(FM[f][2]).fill('FWD')];
const K=['pace','shoot','pass','drib','def','phys'];
const WT={GK:[0,0,.15,0,.65,.2],DEF:[.1,.05,.15,.1,.4,.2],MID:[.15,.15,.3,.25,.05,.1],FWD:[.25,.35,.1,.2,0,.1]};
const BI={GK:[-12,-25,-5,-18,8,0],DEF:[-4,-14,-2,-8,10,6],MID:[0,-2,8,6,-6,-2],FWD:[6,10,-4,4,-18,0]};
const GATE=[5000,3200,1800,1000,600],SPON=[6000,4000,2200,1200,600],BUD=[400000,200000,100000,50000,30000],BASE=[80,74,69,65,61];
const LIGAS={1:'Bayern de los Caídos|Inter Mitente|AC Milaness|Manchester Piti|Paris San Germán|Borussia Dormund|Liverpool de Janeiro|Juventus de Turín y Tónica|Arsenal de Copas|Chelsea Pensioners|Tottenham Hotspurs|Manchester Unitedos',2:'Schalke Temeto|Ajax Tú|Atleti Coño|Real Suciedad|Bayer Leverkusen y Coca-Cola|Nápoles de Copas|Roma Imperiale|Lazio de la Droga|Fiorentina de la Vega|Atalanta de Copas|Newcastle United Kingdom|PSV Eindhoven de la Borrachera',3:'Real Pagaygoza|Celta de Vino|Vodka Juniors|Oseasuna|Real Fachadolida|Deportivo Alcohólico|Getafe de Copas|Eintracht de Resaca|Rayo Vallecanabis|Sporting de Gijón Tonic|Nottingham Forest Gump|Club Brujas de Copas',4:'Mallorca de Noche|Espanyol de Bar|Elche\'s|Cádiz Club de Fútbol y Birras|Granada Mecánica|Almería de Servicio|Leganés de la Frontera|Girona\'t|Racing de Santander y Gin|Huesca la Vista|Numancia de Copas|Atlético Garrafón'};
const P1=['Atlético','Real','Deportivo','Racing','Unión','Sporting','Athletic','CD','Club','Juventud'];
const P2=['Ribera','Cantera','Norte','Sur','Olmo','Vega','Alameda','Cerro','Puente','Retiro','Barrio','Molino','Estrella','Acacias','Halcón','Bahía','Sierra','Pinar','Lunar','Roble','Mirador','Fortuna','Tormenta','Arrabal','Fragua','Colmena','Delta','Faro'];
const FN=['Álex','Iván','Rubén','Sergio','Dani','Nico','Raúl','Marcos','Óscar','Leo','Teo','Biel','Gonzalo','Samu','Quique','Edu','Víctor','Aitor','Joel','Mateo','Cris','Fran','Lucas','Rafa'];
const SN=['Ruiz','Gil','Navas','Ortega','Cano','Soto','Prieto','Lara','Vidal','Mora','Peña','Rey','Calvo','Pardo','Nieto','Cruz','Heras','Bravo','Ibáñez','Duran','Lozano','Santos','Marín','Rojas'];
const rnd=g=>{g.seed=(g.seed+0x6D2B79F5)|0;let t=g.seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
const ri=(g,a,b)=>a+Math.floor(rnd(g)*(b-a+1)),pick=(g,a)=>a[ri(g,0,a.length-1)],cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const shuf=(g,a)=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=ri(g,0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const wpick=(g,a,f)=>{const w=a.map(f),s=w.reduce((x,y)=>x+y,0);let r=rnd(g)*s;for(let i=0;i<a.length;i++){if((r-=w[i])<=0)return a[i]}return a[a.length-1]};
const val=o=>Math.round((o-52)**3*6/100)*100;
const raw=p=>K.reduce((s,k,i)=>s+p[k]*WT[p.pos][i],0),ovrOf=p=>cl(Math.round(raw(p)),60,99);
const refresh=p=>{p.ovr=ovrOf(p);if(p.ovr>p.pot)p.pot=p.ovr;p.val=val(p.ovr);p.sal=Math.round(p.val/150*(p.sx||1))};
function mk(g,pos,base,name,n,t){const p={id:g.pid++,name,pos,n,t,fat:0,form:0,inj:0,tr:0,gr:+(.8+rnd(g)*.5).toFixed(2),ct:ri(g,1,3),s:{g:0,a:0,app:0,rt:0,yc:0}};
  BI[pos].forEach((b,i)=>p[K[i]]=cl(base+b+ri(g,-5,5),30,99));const d=Math.round(base-raw(p));K.forEach(k=>p[k]=cl(p[k]+d,30,99));
  p.ovr=ovrOf(p);p.pot=cl(p.ovr+ri(g,0,12),60,99);p.val=val(p.ovr);p.sal=Math.round(p.val/150);g.P[p.id]=p;return p}
const freeN=(g,t)=>{const u=new Set(t.pl.map(i=>g.P[i].n));let n=2;while(u.has(n))n++;return n};
function mkTeam(g,div,name,base,o={}){const id='t'+g.tid++,h=ri(g,0,359);
  const t={id,name,div,c:o.c||[`hsl(${h} 70% 42%)`,`hsl(${(h+150+ri(g,0,60))%360} 75% 88%)`],cr:{s:ri(g,0,4),p:ri(g,0,3),i:(name.split(' ').filter(w=>!['de','los','la','del','y'].includes(w.toLowerCase())).slice(0,2).map(w=>w[0]).join('')).toUpperCase()},st:'Estadio '+pick(g,P2),bud:BUD[div-1],pl:[],lu:[],bn:[],fm:'2-1-1',cap:0,gar:!!o.gar,real:!!o.real};
  g.T[id]=t;const px=['GK','DEF','DEF','MID','MID','FWD','FWD',pick(g,['DEF','MID','FWD'])],used=new Set();
  px.forEach((pos,i)=>{let n=pos==='GK'?1:ri(g,2,30);while(used.has(n))n=ri(g,2,40);used.add(n);const nm=pick(g,FN)+' '+pick(g,SN);t.pl.push(mk(g,pos,base+ri(g,-6,6),nm,n,id).id)});
  g.divs[div].push(id);return t}
function auto(g,t){const S=slots(t.fm),pool=t.pl.map(i=>g.P[i]),used=new Set();
  t.lu=S.map(sl=>{let b=null,bv=-1;for(const p of pool){if(used.has(p.id)||p.inj)continue;const v=p.ovr*(1-p.fat*.0015)*(p.pos===sl?1:(sl==='GK'||p.pos==='GK')?.7:.93);if(v>bv){bv=v;b=p}}if(!b)b=pool.find(p=>!used.has(p.id));used.add(b.id);return b.id});
  t.bn=pool.filter(p=>!used.has(p.id)).map(p=>p.id);if(!t.pl.includes(t.cap))t.cap=pool.reduce((a,p)=>p.ovr>a.ovr?p:a).id}
function fixInj(g,t,news){t.lu.forEach((id,i)=>{const p=g.P[id];if(!p.inj)return;const S=slots(t.fm)[i];const c=t.bn.map(x=>g.P[x]).filter(x=>!x.inj).sort((a,b)=>(b.pos===S)-(a.pos===S)||b.ovr-a.ovr)[0];
  if(c){t.lu[i]=c.id;t.bn[t.bn.indexOf(c.id)]=id;news(`${p.name} está lesionado: entra ${c.name}`,'injury')}})}
const table=(g,d)=>{const m={};g.divs[d].forEach(i=>m[i]={id:i,pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0});
  g.fx[d].filter(f=>f.done).forEach(f=>{const a=m[f.h],b=m[f.a];a.pj++;b.pj++;a.gf+=f.hg;a.gc+=f.ag;b.gf+=f.ag;b.gc+=f.hg;if(f.hg>f.ag){a.g++;b.p++;a.pts+=3}else if(f.hg<f.ag){b.g++;a.p++;b.pts+=3}else{a.e++;b.e++;a.pts++;b.pts++}});
  return Object.values(m).sort((x,y)=>y.pts-x.pts||(y.gf-y.gc)-(x.gf-x.gc)||y.gf-x.gf||(x.id<y.id?-1:1))};
function mkFx(g,ids,order){const fixed=ids[0],rot=order||shuf(g,ids.slice(1)),n=rot.length,out=[];
  for(let r=0;r<n;r++){const pr=[[fixed,rot[r]]];for(let k=1;k<=(n-1)/2;k++)pr.push([rot[(r+k)%n],rot[(r-k+n)%n]]);
    pr.forEach(([a,b],i)=>{const sw=(r+i)%2,h=sw?b:a,v=sw?a:b;out.push({r,h,a:v});out.push({r:r+n,h:v,a:h})})}return out}
function news(g,t,k){g.news.unshift({w:g.round,s:g.season,t,k});g.news.length=Math.min(g.news.length,60)}
function setup(g){g.round=0;g.fx={};g.dates=[];for(let r=0;r<22;r++)g.dates.push(g.season?new Date(Date.UTC(2026+g.season,9,25+7*r)).toISOString().slice(0,10):REAL.cal[r].date);
  const gd=g.T[g.me].div;
  for(let d=1;d<=5;d++){const ids=g.divs[d].slice().sort((a,b)=>(b===g.me)-(a===g.me));let ord=null;
    if(d===gd&&g.season===0&&ids[0]===g.me){const by={};ids.forEach(i=>by[g.T[i].name]=i);ord=REAL.cal.slice(0,11).map(c=>by[c.rival]);if(ord.some(x=>!x)||new Set(ord).size!==11)ord=null}
    g.fx[d]=mkFx(g,d===gd?ids:shuf(g,ids),ord)}
  for(const p of Object.values(g.P)){p.s={g:0,a:0,app:0,rt:0,yc:0};p.fat=0;p.inj=0}
  const rk=g.divs[gd].map(i=>[i,g.T[i].pl.map(x=>g.P[x].ovr).sort((a,b)=>b-a).slice(0,5).reduce((x,y)=>x+y,0)]).sort((a,b)=>b[1]-a[1]).findIndex(x=>x[0]===g.me)+1;
  g.obj=gd===1?(rk<=3?{t:'Ser campeón de Primera',max:1}:{t:'Terminar entre los 6 primeros',max:6}):rk<=3?{t:'Ascender: terminar entre los 2 primeros',max:2}:rk<=8?{t:'Terminar entre los 6 primeros',max:6}:{t:'Evitar los puestos bajos (top 9)',max:9};
  auto(g,g.T[g.me]);news(g,`Arranca la temporada ${2026+g.season}/${(27+g.season)%100}. Objetivo: ${g.obj.t}`,'season')}
function create(name){const g={id:Date.now().toString(36),name:name||'Mi carrera',seed:(Date.now()&0x7fffffff)^0x5bd1e995,season:0,round:0,pid:1,tid:1,T:{},P:{},divs:{1:[],2:[],3:[],4:[],5:[]},fx:{},dates:[],hist:[],news:[],fin:[],streak:0};
  const sq=REAL.squad,want=['ANTONIO','JIMÉNEZ','MARIO','ADRI','DODU','CARLOS','PABLO','DAVID'];
  const t=mkTeam(g,5,REAL.garra,61,{gar:1,real:1,c:REAL.colors});g.me=t.id;t.st='Campo de Garra';
  t.pl.forEach(i=>delete g.P[i]);t.pl=[];
  for(const nm of want){const s=sq.find(x=>x.name===nm);t.pl.push(mk(g,s.pos,63+ri(g,-4,5),s.name,s.n,t.id).id)}
  for(const s of sq)if(!want.includes(s.name)){const p=mk(g,s.pos,61+ri(g,-4,4),s.name,s.n,null);p.real=1}
  const by=n=>t.pl.find(i=>g.P[i].name===n);t.lu=['ANTONIO','JIMÉNEZ','MARIO','ADRI','CARLOS'].map(by);t.bn=['DODU','PABLO','DAVID'].map(by);t.cap=by('CARLOS');
  for(const r of REAL.teams){const ppg=r.pj?r.pts/r.pj:1.2;mkTeam(g,5,r.name,cl(61+(ppg-1.2)*3,58,66),{real:1})}
  const used=new Set([...g.divs[5].map(i=>g.T[i].name)]);
  for(let d=1;d<=4;d++)for(const n of LIGAS[d].split('|'))mkTeam(g,d,n,BASE[d-1]+ri(g,-2,2));
  for(let i=0;i<8;i++)mk(g,pick(g,['GK','DEF','MID','FWD']),60+ri(g,0,10),pick(g,FN)+' '+pick(g,SN),ri(g,2,60),null);
  for(const x of Object.values(g.T))if(!x.gar)auto(g,x);
  setup(g);news(g,'Comienza DEL BARRO AL GARRO. ¡Garra FC empieza desde abajo!','season');return g}
function side(g,t,home){const S=slots(t.fm),L=t.lu.map((id,i)=>{const p=g.P[id],sl=S[i];let e=p.ovr*(1-p.fat*.0015)+p.form+((p.mo==null?60:p.mo)-60)/20;if(p.pos!==sl)e*=(sl==='GK'||p.pos==='GK')?.7:.93;const f=e/p.ovr;return{p,sl,a:k=>p[k]*f}});
  const mean=(w,f)=>{let s=0,c=0;L.forEach(l=>{if(l.sl==='GK')return;const x=w[l.sl];s+=x*f(l);c+=x});return s/c},h=home?1.03:1;
  return{L,A:h*mean({FWD:1.4,MID:1,DEF:.5},l=>l.a('shoot')*.4+l.a('drib')*.3+l.a('pace')*.3),C:h*mean({MID:1.5,FWD:.8,DEF:.8},l=>l.a('pass')),D:h*mean({DEF:1.4,MID:.8,FWD:.3},l=>l.a('def')*.7+l.a('phys')*.3),GK:L[0].a('def')}}
function sim(g,H,A){const s=[side(g,H,1),side(g,A,0)],day=[1+(rnd(g)-.5)*.1,1+(rnd(g)-.5)*.1],tm=[H,A];
  const r={sc:[0,0],p:[0,0],sh:[0,0],so:[0,0],sv:[0,0],fo:[0,0],yc:[0,0],ev:[],rt:{},g:{},a:{},sv_:{},tl:[]};
  for(let m=0;m<34;m++){const c0=s[0].C*day[0],c1=s[1].C*day[1],i=rnd(g)<c0/(c0+c1)?0:1,o=1-i,at=s[i],df=s[o],min=Math.ceil((m+1)*40/34);r.p[i]++;
    if(rnd(g)<.12){r.fo[o]++;let cd='f';const fi=ri(g,1,4);if(rnd(g)<.15){const f=df.L[fi].p;r.yc[o]++;f.s.yc++;cd='y';r.ev.push({m:min,t:'Y',i:o,x:`${f.name} ve la amarilla`})}r.tl.push([min,o,fi,-1,cd])}
    if(rnd(g)>cl(.55+(at.A*day[i]-df.D)*.012,.2,.85)){r.tl.push([min,i,-1,-1,'p']);continue}r.sh[i]++;
    const sh=wpick(g,at.L,l=>({FWD:3,MID:1.5,DEF:.5,GK:.05}[l.sl])*l.p.shoot);
    const si=at.L.indexOf(sh);if(rnd(g)>cl(.45+(sh.a('shoot')-60)/150,.3,.8)){r.tl.push([min,i,si,-1,'m']);continue}r.so[i]++;
    if(rnd(g)<cl(.36+(sh.a('shoot')-df.GK)*.009,.12,.6)){r.sc[i]++;r.g[sh.p.id]=(r.g[sh.p.id]||0)+1;let as=null;
      if(rnd(g)<.7){as=wpick(g,at.L.filter(l=>l!==sh),l=>({MID:2,FWD:1,DEF:1,GK:.3}[l.sl])*l.p.pass);r.a[as.p.id]=(r.a[as.p.id]||0)+1}
      r.tl.push([min,i,si,as?at.L.indexOf(as):-1,'g']);r.ev.push({m:min,t:'G',i,x:`⚽ ${sh.p.name}${as?` (asist. ${as.p.name})`:''}  ${r.sc[0]}-${r.sc[1]}`})}
    else{r.sv[o]++;r.tl.push([min,i,si,-1,'s']);const k=df.L[0].p.id;r.sv_[k]=(r.sv_[k]||0)+1}}
  const res=[r.sc[0]-r.sc[1],r.sc[1]-r.sc[0]];r.pos=Math.round(r.p[0]/34*100);
  s.forEach((x,i)=>{x.L.forEach(l=>{const p=l.p;let v=6+(r.g[p.id]||0)+.6*(r.a[p.id]||0)+.15*(r.sv_[p.id]||0)+(res[i]>0?.3:res[i]<0?-.2:0)+(rnd(g)-.5)*.8;v=+cl(v,3,10).toFixed(1);r.rt[p.id]=v;
      p.s.app++;p.s.rt+=v;p.s.g+=r.g[p.id]||0;p.s.a+=r.a[p.id]||0;p.fat=Math.min(100,p.fat+16);p.form=v>7.5?Math.min(5,p.form+1):v<5.5?Math.max(-5,p.form-1):p.form-Math.sign(p.form);
      if(rnd(g)<.008){p.inj=ri(g,1,4)+1;r.ev.push({m:ri(g,1,40),t:'I',i,x:`🩹 ${p.name} se lesiona (${p.inj-1} jornadas)`})}});
    tm[i].bn.forEach(id=>g.P[id].fat=Math.min(100,g.P[id].fat+5))});
  r.lu=[H.lu.slice(),A.lu.slice()];r.fm=[H.fm,A.fm];r.ev.sort((a,b)=>a.m-b.m);r.mvp=Object.keys(r.rt).sort((a,b)=>r.rt[b]-r.rt[a])[0];return r}
function advance(g){const r=g.round,me=g.T[g.me],out={},fin=(k,a,t)=>{me.bud+=a;g.fin.push({s:g.season,w:r+1,k,t,a});if(g.fin.length>400)g.fin.shift()};
  for(const x of Object.values(g.T))x.gar?fixInj(g,x,(t,k)=>news(g,t,k)):auto(g,x);
  const played=new Set(me.lu);
  for(let d=1;d<=5;d++)for(const f of g.fx[d].filter(f=>f.r===r)){const H=g.T[f.h],A=g.T[f.a],rep=sim(g,H,A);f.hg=rep.sc[0];f.ag=rep.sc[1];f.done=1;
    for(const [t,gf,gc,home] of [[H,f.hg,f.ag,1],[A,f.ag,f.hg,0]]){const sal=t.pl.reduce((s,i)=>s+g.P[i].sal,0),inc=SPON[d-1]+(home?GATE[d-1]:0)+(gf>gc?Math.round(SPON[d-1]*.4):0);
      if(t.gar){fin('Patrocinio',SPON[d-1],'Patrocinadores');if(home)fin('Entradas',GATE[d-1],'Taquilla');if(gf>gc)fin('Premios',Math.round(SPON[d-1]*.4),'Prima por victoria');fin('Salarios',-sal,'Salarios de la plantilla')}else t.bud=Math.max(0,t.bud+inc-sal)}
    if(f.h===g.me||f.a===g.me){f.rep=rep;out.f=f;const me_=f.h===g.me,gf=me_?f.hg:f.ag,gc=me_?f.ag:f.hg,op=g.T[me_?f.a:f.h];
      g.streak=gf>gc?Math.max(1,g.streak+1):gf<gc?Math.min(-1,g.streak-1):0;
      news(g,`J${r+1}: ${H.name} ${f.hg}-${f.ag} ${A.name}`,'result');
      if(g.streak===3)news(g,'¡Racha de 3 victorias seguidas de Garra FC!','streak');if(g.streak===-3)news(g,'Garra FC encadena 3 derrotas. Toca reaccionar.','streak');
      for(const e of rep.ev)if(e.t==='I'&&tmHas(g,e.i?A:H,e))news(g,e.x,'injury')}
    else if(Math.abs(f.hg-f.ag)>=5)news(g,`Goleada en ${d}ª: ${H.name} ${f.hg}-${f.ag} ${A.name}`,'result')}
  if(rnd(g)<.35){const ts=Object.values(g.T).filter(x=>!x.gar),a=pick(g,ts),b=pick(g,ts.filter(x=>x.div===a.div&&x!==a));if(b){const pa=g.P[pick(g,a.pl)],pb=g.P[pick(g,b.pl)];
    a.pl=a.pl.map(i=>i===pa.id?pb.id:i);b.pl=b.pl.map(i=>i===pb.id?pa.id:i);pa.t=b.id;pb.t=a.id;[pa.n,pb.n]=[freeN(g,b),freeN(g,a)];news(g,`Fichaje: ${pa.name} (${a.name}) ↔ ${pb.name} (${b.name})`,'transfer')}}
  out.nm=chat(g,played,out.f?(out.f.h===g.me?out.f.hg-out.f.ag:out.f.ag-out.f.hg):0);
  for(const p of Object.values(g.P)){p.fat=Math.max(0,p.fat-14);if(p.inj>0)p.inj--;p.tr=0}
  g.round++;if(g.round>=22)out.season=endSeason(g);return out}
const tmHas=(g,t,e)=>t.gar;
function endSeason(g){const rec={s:g.season,ch:{},pro:[],rel:[],gp:null},tb={},mv=[];
  for(let d=1;d<=5;d++){tb[d]=table(g,d);rec.ch[d]=tb[d][0].id;
    tb[d].forEach((x,pos)=>{const t=g.T[x.id],pz=Math.round(SPON[d-1]*(12-pos-1)*.5);if(t.gar){g.fin.push({s:g.season,w:22,k:'Premios',t:`Premio por la ${pos+1}ª plaza`,a:pz});t.bud+=pz}else t.bud+=pz;
      if(d>1&&pos<2)mv.push([t,d-1,1]);if(d<5&&pos>=10)mv.push([t,d+1,0])})}
  const gd=g.T[g.me].div,gp=tb[gd].findIndex(x=>x.id===g.me);rec.gp={d:gd,pos:gp+1,pts:tb[gd][gp].pts,obj:g.obj.t,ok:gp+1<=g.obj.max};
  for(let d=1;d<=5;d++)g.divs[d]=[];Object.values(g.T).forEach(t=>{const m=mv.find(x=>x[0]===t);if(m){t.div=m[1];(m[2]?rec.pro:rec.rel).push(t.id)}g.divs[t.div].push(t.id)});
  for(const p of Object.values(g.P)){if(p.ovr<p.pot&&rnd(g)<.7){for(let i=0;i<2;i++){const k=pick(g,K);p[k]=Math.min(99,p[k]+ri(g,1,2))}}else if(rnd(g)<.12){const k=pick(g,K);p[k]=Math.max(30,p[k]-1)}
    refresh(p);if(--p.ct<=0){p.ct=ri(g,2,3);if(p.t===g.me)news(g,`${p.name} renueva contrato (${p.ct} temporadas)`,'transfer')}}
  for(let i=0;i<4;i++)mk(g,pick(g,['GK','DEF','MID','FWD']),60+ri(g,0,12),pick(g,FN)+' '+pick(g,SN),ri(g,2,60),null);
  g.hist.push(rec);news(g,`Fin de temporada: Garra FC ${gp+1}º en ${gd}ª. ${rec.gp.ok?'¡Objetivo cumplido!':'Objetivo no cumplido.'}${rec.pro.includes(g.me)?' ¡ASCENSO!':rec.rel.includes(g.me)?' Descenso.':''}`,'season');
  g.season++;setup(g);if(g.T[g.me].div===1)news(g,'¡Garra FC está en Primera División! Del barro al Garro.','season');return rec}
const err=m=>({err:m});
// ===== VESTUARIO: mensajes de los jugadores al mister (se guardan en g.msgs, dentro de la carrera) =====
const DNm=['','Primera','Segunda','Tercera','Cuarta','Quinta'],MO=p=>p.mo==null?60:p.mo,mood=(p,d)=>{p.mo=cl(MO(p)+d,0,100)},eu=n=>Math.round(n).toLocaleString('es-ES')+' €';
const CD={play:6,raise:12,tired:5,out:10};
const TXT={
 play:[p=>'Mister, creo que tengo que jugar más. Me veo para ser titular.',p=>'Necesito jugar, mister. Así, sentado en el banquillo, no me veo.',p=>`Llevo ${p.ns} jornadas sin jugar. ¿Me va a dar minutos o qué?`,p=>'Oiga, mister, ¿qué tengo que hacer para jugar? Yo estoy listo.',p=>'Yo sé que hay competencia, pero creo que tengo que jugar. Se lo digo con respeto.'],
 raise:[(p,to)=>`Mister, estoy rindiendo y cobro ${eu(p.sal)} por jornada. ¿Me sube el sueldo a ${eu(to)}?`,(p,to)=>`Sin ánimo de faltar: súbeme el sueldo (${eu(to)}) y me dejo la piel por este escudo.`,(p,to)=>`Me han llegado comentarios de otros equipos… Yo quiero quedarme, pero ${eu(to)} me ayudarían a pensarlo menos.`],
 tired:[p=>'Mister, estoy hecho polvo. Necesito descansar un partido.',p=>'Las piernas no me responden. ¿Me da un respiro esta jornada?',p=>'Yo qué sé, mister, igual me conviene parar un poco. Voy cargadísimo.'],
 out:[p=>'Mister, así no sigo. Quiero salir del club.',p=>'No me siento valorado. Si llega una oferta, quiero que la escuche.',p=>'Yo qué sé, mister, igual lo mejor es que me traspase. Estoy desmotivado.'],
 thanks:[p=>'Gracias por la confianza, mister. No le voy a fallar.',p=>'Mister, gracias por darme la oportunidad. Me la voy a dejar toda en el campo.',p=>'Gracias por confiar en mí. Esto no se me olvida.']};
const say=(g,k,p,t,o,x)=>{const M=g.msgs||(g.msgs=[]),m={id:g.mid=(g.mid||0)+1,k,pid:p.id,pn:p.name,pos:p.pos,ovr:p.ovr,n:p.n,s:g.season,w:g.round+1,ab:g.season*22+g.round,st:o?'new':'info',t,o:o||[],...x};M.unshift(m);if(M.length>60)M.length=60;return m};
function mkOffer(g,p){const me=g.T[g.me],M=g.msgs||(g.msgs=[]);
  if(!p){const ps=me.pl.map(i=>g.P[i]).filter(q=>!M.some(m=>m.k==='offer'&&m.st==='new'&&m.pid===q.id));if(!ps.length)return null;p=wpick(g,ps,q=>(q.ovr-55)**2+1)}
  const O0=Object.values(g.T).filter(t=>!t.gar&&t.pl.length>3&&t.bud>=p.val*.7);if(!O0.length)return null;
  const O=pick(g,O0),amt=Math.max(500,Math.round(Math.min(p.val*(.9+rnd(g)*.5),O.bud*.9)/100)*100),pp=O.pl.map(i=>g.P[i]),same=pp.filter(q=>q.pos===p.pos),back=(same.length?same:pp).sort((a,b)=>a.ovr-b.ovr)[0];
  return say(g,'offer',p,`El ${O.name} (${DNm[O.div]}) quiere a ${p.name}: ofrece ${eu(amt)} y te cede a ${back.name} (${back.pos}, media ${back.ovr}).`,[['accept','Aceptar'],['more','Pedir un 20% más'],['reject','Rechazar']],{tid:O.id,amt,back:back.id,bn:back.name})}
function chat(g,played,res){const me=g.T[g.me],M=g.msgs||(g.msgs=[]),ab=g.season*22+g.round,minS=Math.min(...me.lu.map(i=>g.P[i].ovr));let n=0;
  const pend=(id,k)=>M.some(m=>m.pid===id&&m.k===k&&m.st==='new'),mc=(p,k)=>ab-((p.mc&&p.mc[k])??-99)>=CD[k],mark=(p,k)=>{(p.mc||(p.mc={}))[k]=ab};
  for(const m of M){if(m.st!=='new')continue;const age=ab-m.ab,p=g.P[m.pid];
    if(!p||p.t!==g.me)m.st='void';
    else if(m.k==='offer'){if(age>=2){m.st='exp';m.rp='La oferta ha caducado.'}}
    else if(age>=3){m.st='ign';m.rp='Sin respuesta del mister.';mood(p,m.k==='raise'?-8:-6)}}
  for(const p of shuf(g,me.pl.map(i=>g.P[i]))){
    const was=p.ns||0,pl=played.has(p.id);p.ns=pl?0:was+1;mood(p,pl?(res>0?2:res<0?-1:0):(p.ns>=3?-1:0));
    if(pl&&was>=3){mood(p,6);say(g,'thanks',p,pick(g,TXT.thanks)(p));n++;continue}
    if(n>=3)continue;let k=null;const r=rnd(g);
    if(MO(p)<30&&mc(p,'out')&&!pend(p.id,'out')&&r<.5)k='out';
    else if(!pl&&!p.inj&&p.ns>=3&&mc(p,'play')&&!pend(p.id,'play')&&r<(p.ovr>=minS-3?.6:.35))k='play';
    else if(pl&&p.fat>=55&&mc(p,'tired')&&!pend(p.id,'tired')&&r<.4)k='tired';
    else if(pl&&p.s.app>=4&&(p.s.rt/p.s.app>=7||p.s.g+p.s.a>=5)&&mc(p,'raise')&&!pend(p.id,'raise')&&r<.35)k='raise';
    if(!k)continue;mark(p,k);n++;const t=pick(g,TXT[k]);
    if(k==='play')say(g,k,p,t(p),[['start','Serás titular el próximo partido'],['soon','Paciencia, tendrás tus minutos'],['earn','Gánatelo en los entrenos']]);
    else if(k==='tired')say(g,k,p,t(p),[['rest','Descansa este partido'],['push','Aguanta, te necesito']]);
    else if(k==='out')say(g,k,p,t(p),[['sell','Vale, escucharé ofertas'],['stay','De aquí no sales']]);
    else{const to=Math.max(p.sal+10,Math.round(p.sal*1.3));say(g,k,p,t(p,to),[['yes','Te lo subo a '+eu(to)],['bit','Te subo un 10%'],['no','Ahora no toca']],{to})}}
  if(M.filter(m=>m.k==='offer'&&m.st==='new').length<2&&rnd(g)<.3&&mkOffer(g))n++;
  return n}
function answer(g,b){const me=g.T[g.me],P=g.P,m=(g.msgs||[]).find(x=>x.id===b.id);if(!m||m.st!=='new')return err('Este mensaje ya está resuelto');
  const p=P[m.pid],o=m.o.find(x=>x[0]===b.opt);if(!o)return err('Respuesta no válida');if(!p||p.t!==g.me){m.st='void';return err('Ese jugador ya no está en tu plantilla')}
  const done=(rp,msg)=>{m.st='done';m.ch=o[1];m.rp=rp;return{msg:msg||rp}},raise=to=>{p.sx=to/(p.val/150);p.sal=to};
  switch(m.k+':'+o[0]){
  case'play:start':{if(p.inj)return err(p.name+' está lesionado');if(!me.lu.includes(p.id)){const S=slots(me.fm);let bi=-1,bv=1e9;me.lu.forEach((id,i)=>{if((S[i]==='GK')!==(p.pos==='GK'))return;const v=P[id].ovr+(S[i]===p.pos?0:6);if(v<bv){bv=v;bi=i}});if(bi<0)return err('No hay hueco para él: cámbialo a mano en Tácticas');const old=me.lu[bi],j=me.bn.indexOf(p.id);if(j<0)return err('Alineación no válida');me.bn[j]=old;me.lu[bi]=p.id}
    mood(p,15);return done('¡Gracias, mister! No le voy a fallar.',p.name+' será titular')}
  case'play:soon':mood(p,3);return done('Vale, mister, esperaré mi oportunidad.');
  case'play:earn':mood(p,p.ovr>=Math.min(...me.lu.map(i=>P[i].ovr))?-9:-5);return done(MO(p)<30?'Así no, mister. Esto no se hace.':'Pues entrenaré más, pero me ha sentado mal.');
  case'raise:yes':raise(m.to);mood(p,20);return done('¡Eso es! Me quedo toda la vida.',`${p.name} cobra ${eu(m.to)}/jornada`);
  case'raise:bit':{const to=Math.round(p.sal*1.1);if(rnd(g)<.55){raise(to);mood(p,8);return done('Es poco… pero vale, acepto.',`${p.name} cobra ${eu(to)}/jornada`)}mood(p,-4);return done('¿Solo eso? Me lo pensaré, mister.')}
  case'raise:no':mood(p,-10);return done('Pues me acordaré de esto cuando renueve.');
  case'tired:rest':{const S=slots(me.fm),i=me.lu.indexOf(p.id),c=i<0?null:me.bn.map(x=>P[x]).filter(x=>!x.inj&&((S[i]==='GK')===(x.pos==='GK'))).sort((a,b)=>(b.pos===S[i])-(a.pos===S[i])||b.ovr-a.ovr)[0];
    if(i>=0){if(!c)return err('No tienes un suplente disponible para sustituirle');me.lu[i]=c.id;me.bn[me.bn.indexOf(c.id)]=p.id}mood(p,6);return done('Gracias, mister. Me hace falta.',p.name+' descansa')}
  case'tired:push':mood(p,-4);return done('Vale, mister… aguantaré como pueda.');
  case'out:sell':{const x=mkOffer(g,p);mood(p,5);return done(x?'Gracias, mister. A ver quién llama.':'Nadie ha llamado todavía…',x?'Ya hay una oferta por '+p.name:'Aún no hay ofertas por '+p.name)}
  case'out:stay':mood(p,-8);return done('Pues aquí me quedo, pero así no rindo igual.');
  case'offer:reject':{mood(p,MO(p)<40?-6:0);return done(MO(p)<40?'La oferta se rechaza. '+p.name+' no lo entiende: quería irse.':'Oferta rechazada.')}
  case'offer:more':{const O=g.T[m.tid],a2=Math.round(m.amt*1.2/100)*100;if(O&&O.bud>=a2&&rnd(g)<.5){m.amt=a2;m.t=`El ${O.name} accede a subir: ${eu(a2)} y a ${m.bn} por ${p.name}.`;m.o=[['accept','Aceptar'],['reject','Rechazar']];return{msg:'Han aceptado subir la oferta'}}
    m.st='rej';m.ch=o[1];m.rp='Retiran la oferta.';return{msg:'El club retira la oferta'}}
  case'offer:accept':{const O=g.T[m.tid],back=P[m.back];if(!O||!back||back.t!==O.id)return err('La oferta ya no es válida');if(O.bud<m.amt)return err('Ese club ya no puede pagarlo');
    me.bud+=m.amt;O.bud-=m.amt;me.pl=me.pl.map(i=>i===p.id?back.id:i);O.pl=O.pl.map(i=>i===back.id?p.id:i);const gn=p.n;back.t=g.me;p.t=O.id;back.n=gn;p.n=freeN(g,O);back.sx=1.1;back.sal=Math.round(back.val/150*1.1);back.ct=ri(g,2,3);back.mo=60;back.ns=0;
    me.lu=me.lu.map(i=>i===p.id?back.id:i);me.bn=me.bn.map(i=>i===p.id?back.id:i);if(me.cap===p.id)me.cap=back.id;auto(g,O);
    g.fin.push({s:g.season,w:g.round+1,k:'Fichajes',t:`Venta de ${p.name} al ${O.name}`,a:m.amt});news(g,`Traspaso: ${p.name} se va al ${O.name}; llega ${back.name} a Garra FC`,'transfer');
    (g.msgs||[]).forEach(x=>{if(x!==m&&x.pid===p.id&&x.st==='new')x.st='void'});return done('Operación cerrada.',`${p.name} vendido por ${eu(m.amt)}`)}
  }return err('Respuesta no válida')}
function act(g,b){const me=g.T[g.me],P=g.P;
  switch(b.type){
  case'advance':return{out:advance(g)};
  case'lineup':{const ids=[...b.lu,...b.bn];if(!FM[b.fm]||b.lu.length!==5||b.bn.length!==3||new Set(ids).size!==8||ids.some(i=>!me.pl.includes(i)))return err('Alineación no válida');
    if(!ids.includes(b.cap))return err('Capitán no válido');me.lu=b.lu;me.bn=b.bn;me.fm=b.fm;me.cap=b.cap;return{}}
  case'setp':{const p=P[b.pid];if(!p||p.t!==g.me||!K||!WT[b.pos])return err('Jugador no válido');const n=+b.n;if(!(n>=1&&n<=99)||me.pl.some(i=>i!==p.id&&P[i].n===n))return err('Dorsal repetido o no válido');p.pos=b.pos;p.n=n;refresh(p);return{}}
  case'train':{const p=P[b.pid];if(!p||p.t!==g.me||!K.includes(b.attr))return err('No válido');if(p.tr)return err('Ya ha entrenado esta semana');if(p.inj)return err('Está lesionado');
    const cost=1500;if(me.bud<cost)return err('Presupuesto insuficiente');me.bud-=cost;g.fin.push({s:g.season,w:g.round+1,k:'Entrenamiento',t:`${p.name}: ${b.attr}`,a:-cost});p.tr=1;
    let gain=rnd(g)<cl(.65-p.fat/200,.2,.65)?(rnd(g)<.15?2:1):0,old=p.ovr;const prev=p[b.attr];p[b.attr]=Math.min(99,prev+gain);if(ovrOf(p)>p.pot)p[b.attr]=prev;refresh(p);p.fat=Math.min(100,p.fat+8);
    return{msg:p[b.attr]>prev?`${p.name}: ${b.attr} ${prev}→${p[b.attr]}${p.ovr>old?` (media ${old}→${p.ovr})`:''}`:`${p.name} no mejora (${p[b.attr]===prev&&ovrOf(p)>=p.pot?'techo de potencial':'sin progreso'})`}}
  case'msg':return answer(g,b);
  case'buy':{const p=P[b.pid],give=P[b.give];if(!p||!give||give.t!==g.me||p.t===g.me)return err('Operación no válida');
    const ask=Math.round(p.val*(p.t?1+.15*p.gr:.8)/100)*100,offer=Math.round(+b.offer);if(!(offer>0))return err('Oferta no válida');
    if(offer<ask*.92)return{counter:ask,msg:`Oferta rechazada. Piden ${ask.toLocaleString('es-ES')} €`};
    const net=offer-give.val,O=p.t?g.T[p.t]:null;if(net>me.bud)return err('Presupuesto insuficiente');if(O&&net<0&&O.bud<-net)return err('Ese club no puede pagar la diferencia');
    me.bud-=net;if(O)O.bud+=net;me.pl=me.pl.map(i=>i===give.id?p.id:i);if(O)O.pl=O.pl.map(i=>i===p.id?give.id:i);
    const gn=give.n;p.t=g.me;const prevT=O;give.t=O?O.id:null;p.n=gn;if(O)give.n=freeN(g,O);p.sx=1.1;p.sal=Math.round(p.val/150*1.1);p.ct=ri(g,2,3);p.mo=60;p.ns=0;
    me.lu=me.lu.map(i=>i===give.id?p.id:i);me.bn=me.bn.map(i=>i===give.id?p.id:i);if(me.cap===give.id)me.cap=p.id;if(O)auto(g,O);
    g.fin.push({s:g.season,w:g.round+1,k:'Fichajes',t:`${p.name} por ${give.name} (+${offer})`,a:-net});news(g,`Fichaje: ${p.name} llega a Garra FC; sale ${give.name}`,'transfer');return{msg:`¡Fichado ${p.name}!`}}
  }return err('Acción desconocida')}
let getUser=d=>d.length>=8?{id:d,name:'Jugador'}:null;const C={},file=id=>path.join(SV,id.replace(/[^a-z0-9]/gi,'')+'.json');
// ---- Guardado: Upstash Redis (sobrevive a redeploys) + copia en disco. Cada carrera = una clave barro:g:<id> (gzip+base64) ----
const zlib=require('zlib'),R_URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,''),R_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'',REMOTE=!!(R_URL&&R_TOKEN),PFX='barro:g:',sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function redis(...cmd){const r=await fetch(R_URL,{method:'POST',headers:{Authorization:'Bearer '+R_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(cmd)}),d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error||'Redis HTTP '+r.status);return d.result}
const enc=g=>'gz:'+zlib.gzipSync(JSON.stringify(g)).toString('base64'),dec=s=>JSON.parse(s.startsWith('gz:')?zlib.gunzipSync(Buffer.from(s.slice(3),'base64')).toString('utf8'):s);
const idOf=id=>String(id||'').replace(/[^a-z0-9]/gi,'');
const readDisk=()=>{const o={};try{for(const f of fs.readdirSync(SV))if(f.endsWith('.json'))try{const g=JSON.parse(fs.readFileSync(path.join(SV,f),'utf8'));if(g&&g.id)o[g.id]=g}catch(e){console.error('Barro: archivo ilegible '+f)}}catch(e){}return o};
const fl={},dirty=new Set();
function flush(id){const f=fl[id]||(fl[id]={p:null,again:false});if(f.p){f.again=true;return f.p} // si ya se está guardando, vuelve a guardar la última versión al terminar
  return f.p=(async()=>{try{do{f.again=false;const g=C[id];if(g)await redis('SET',PFX+id,enc(g));else await redis('DEL',PFX+id);dirty.delete(id)}while(f.again)}catch(e){dirty.add(id);console.error('Barro: fallo al guardar en Upstash, reintento en 10 s: '+e.message)}finally{f.p=null}})()}
setInterval(()=>{for(const id of [...dirty])flush(id)},10000).unref();
process.on('SIGTERM',()=>{for(const id of [...dirty])flush(id)});
let ready=null;
function init(){return ready||(ready=(async()=>{const local=readDisk();
  if(!REMOTE){Object.assign(C,local);console.warn('Barro: sin UPSTASH_REDIS_REST_URL/TOKEN, las carreras solo se guardan en disco (se pierden en cada redeploy de Render free).');return}
  let keys=[];for(let i=1;;i++){try{keys=[];let cur='0';do{const r=await redis('SCAN',cur,'MATCH',PFX+'*','COUNT',200);cur=String(r[0]);keys.push(...r[1])}while(cur!=='0');break}catch(e){if(i>=5)throw e;console.error('Barro: Upstash no responde (intento '+i+'/5): '+e.message);await sleep(2000*i)}}
  for(const k of [...new Set(keys)]){let raw;for(let i=1;;i++){try{raw=await redis('GET',k);break}catch(e){if(i>=5)throw e;await sleep(1500*i)}}
    try{const g=dec(raw);if(g&&g.id)C[g.id]=g}catch(e){throw new Error('No se pudo leer '+k+' (no arranco para no pisarla): '+e.message)}}
  let up=0;for(const [id,g] of Object.entries(local))if(!C[id]){C[id]=g;up++;await flush(id)} // primera vez: sube las carreras que hubiera en disco
  console.log('Barro: '+Object.keys(C).length+' carreras cargadas desde Upstash'+(up?' (+'+up+' subidas desde disco)':''))})().catch(e=>{ready=null;console.error('Barro: init falló: '+e.message);throw e}))}
init().catch(()=>{});
const load=id=>C[idOf(id)]||null;
const save=g=>{C[g.id]=g;try{fs.writeFileSync(file(g.id),JSON.stringify(g))}catch(e){}return REMOTE?flush(g.id):Promise.resolve()};
const del=id=>{id=idOf(id);delete C[id];try{fs.unlinkSync(file(id))}catch(e){}return REMOTE?flush(id):Promise.resolve()};
const list=uid=>Object.values(C).filter(g=>g&&g.owner===uid).map(g=>({id:g.id,name:g.name,season:g.season,round:g.round,div:g.T[g.me].div})).sort((a,b)=>b.id.localeCompare(a.id));
const MT={'.html':'text/html;charset=utf8','.js':'text/javascript','.png':'image/png','.css':'text/css'};
const handle=(q,s)=>{const u=new URL(q.url,'http://x'),j=(o,c=200)=>{s.writeHead(c,{'content-type':'application/json'});s.end(JSON.stringify(o))};
  if(u.pathname.startsWith('/api/')){const run=async body=>{try{try{await init()}catch(e){return j({err:'Guardado no disponible, reintenta en unos segundos'},503)}const b=body&&typeof body==='object'?body:body?JSON.parse(body):{},id=u.searchParams.get('id');
    const user=getUser(String(q.headers['x-device']||''));if(u.pathname==='/api/me')return j({user:user&&{id:user.id,name:user.name}});if(!user)return j({err:'login'},401);if(u.pathname==='/api/saves')return j(list(user.id));
    if(u.pathname==='/api/new'){const g=create(String(b.name||'').slice(0,40));g.owner=user.id;await save(g);return j(g)}
    const g=load(id||'');if(!g||g.owner!==user.id)return j({err:'Partida no encontrada'},404);
    if(u.pathname==='/api/game'&&q.method==='DELETE'){await del(id);return j({})}
    if(u.pathname==='/api/game')return j(g);
    if(u.pathname==='/api/rename'){g.name=String(b.name||g.name).slice(0,40);await save(g);return j({})}
    if(u.pathname==='/api/act'){const r=act(g,b);if(!r.err)await save(g);return j({...r,g:r.err?undefined:g})}
    j({err:'?'},404)}catch(e){console.error(e);j({err:'Error del servidor'},500)}};if(q.body!==undefined)run(q.body);else{let body='';q.on('data',d=>body+=d);q.on('end',()=>run(body))}return}
  const f=path.join(__dirname,'public',u.pathname==='/'?'index.html':path.normalize(u.pathname).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end('No encontrado')}s.writeHead(200,{'content-type':MT[path.extname(f)]||'application/octet-stream'});s.end(d)})};
if(require.main===module)http.createServer(handle).listen(process.env.PORT||3000,()=>console.log('DEL BARRO AL GARRO en http://localhost:'+(process.env.PORT||3000)));
module.exports={create,act,table,handle,auth:f=>{getUser=f}};
