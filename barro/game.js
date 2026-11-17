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
const refresh=p=>{p.ovr=ovrOf(p);if(p.ovr>p.pot)p.pot=p.ovr;p.val=val(p.ovr);p.sal=Math.round(p.val/150)};
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
function side(g,t,home){const S=slots(t.fm),L=t.lu.map((id,i)=>{const p=g.P[id],sl=S[i];let e=p.ovr*(1-p.fat*.0015)+p.form;if(p.pos!==sl)e*=(sl==='GK'||p.pos==='GK')?.7:.93;const f=e/p.ovr;return{p,sl,a:k=>p[k]*f}});
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
  case'buy':{const p=P[b.pid],give=P[b.give];if(!p||!give||give.t!==g.me||p.t===g.me)return err('Operación no válida');
    const ask=Math.round(p.val*(p.t?1+.15*p.gr:.8)/100)*100,offer=Math.round(+b.offer);if(!(offer>0))return err('Oferta no válida');
    if(offer<ask*.92)return{counter:ask,msg:`Oferta rechazada. Piden ${ask.toLocaleString('es-ES')} €`};
    const net=offer-give.val,O=p.t?g.T[p.t]:null;if(net>me.bud)return err('Presupuesto insuficiente');if(O&&net<0&&O.bud<-net)return err('Ese club no puede pagar la diferencia');
    me.bud-=net;if(O)O.bud+=net;me.pl=me.pl.map(i=>i===give.id?p.id:i);if(O)O.pl=O.pl.map(i=>i===p.id?give.id:i);
    const gn=give.n;p.t=g.me;const prevT=O;give.t=O?O.id:null;p.n=gn;if(O)give.n=freeN(g,O);p.sal=Math.round(p.val/150*1.1);p.ct=ri(g,2,3);
    me.lu=me.lu.map(i=>i===give.id?p.id:i);me.bn=me.bn.map(i=>i===give.id?p.id:i);if(me.cap===give.id)me.cap=p.id;if(O)auto(g,O);
    g.fin.push({s:g.season,w:g.round+1,k:'Fichajes',t:`${p.name} por ${give.name} (+${offer})`,a:-net});news(g,`Fichaje: ${p.name} llega a Garra FC; sale ${give.name}`,'transfer');return{msg:`¡Fichado ${p.name}!`}}
  }return err('Acción desconocida')}
let getUser=d=>d.length>=8?{id:d,name:'Jugador'}:null;const C={},file=id=>path.join(SV,id.replace(/[^a-z0-9]/gi,'')+'.json');
const load=id=>C[id]||(fs.existsSync(file(id))?C[id]=JSON.parse(fs.readFileSync(file(id),'utf8')):null),save=g=>{C[g.id]=g;fs.writeFileSync(file(g.id),JSON.stringify(g))};
const list=uid=>fs.readdirSync(SV).map(f=>load(f.slice(0,-5))).filter(g=>g&&g.owner===uid).map(g=>({id:g.id,name:g.name,season:g.season,round:g.round,div:g.T[g.me].div})).sort((a,b)=>b.id.localeCompare(a.id));
const MT={'.html':'text/html;charset=utf8','.js':'text/javascript','.png':'image/png','.css':'text/css'};
const handle=(q,s)=>{const u=new URL(q.url,'http://x'),j=(o,c=200)=>{s.writeHead(c,{'content-type':'application/json'});s.end(JSON.stringify(o))};
  if(u.pathname.startsWith('/api/')){const run=body=>{try{const b=body&&typeof body==='object'?body:body?JSON.parse(body):{},id=u.searchParams.get('id');
    const user=getUser(String(q.headers['x-device']||''));if(u.pathname==='/api/me')return j({user:user&&{id:user.id,name:user.name}});if(!user)return j({err:'login'},401);if(u.pathname==='/api/saves')return j(list(user.id));
    if(u.pathname==='/api/new'){const g=create(String(b.name||'').slice(0,40));g.owner=user.id;save(g);return j(g)}
    const g=load(id||'');if(!g||g.owner!==user.id)return j({err:'Partida no encontrada'},404);
    if(u.pathname==='/api/game'&&q.method==='DELETE'){fs.unlinkSync(file(id));delete C[id];return j({})}
    if(u.pathname==='/api/game')return j(g);
    if(u.pathname==='/api/rename'){g.name=String(b.name||g.name).slice(0,40);save(g);return j({})}
    if(u.pathname==='/api/act'){const r=act(g,b);if(!r.err)save(g);return j({...r,g:r.err?undefined:g})}
    j({err:'?'},404)}catch(e){console.error(e);j({err:'Error del servidor'},500)}};if(q.body!==undefined)run(q.body);else{let body='';q.on('data',d=>body+=d);q.on('end',()=>run(body))}return}
  const f=path.join(__dirname,'public',u.pathname==='/'?'index.html':path.normalize(u.pathname).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end('No encontrado')}s.writeHead(200,{'content-type':MT[path.extname(f)]||'application/octet-stream'});s.end(d)})};
if(require.main===module)http.createServer(handle).listen(process.env.PORT||3000,()=>console.log('DEL BARRO AL GARRO en http://localhost:'+(process.env.PORT||3000)));
module.exports={create,act,table,handle,auth:f=>{getUser=f}};
