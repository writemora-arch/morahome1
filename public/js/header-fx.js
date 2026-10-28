/* MORA HOME — premium animated header background (gold dust, sand, stars, glitter). One canvas, no libraries. */
(function(){
var hd=document.querySelector('.site-header');
if(!hd||hd.querySelector('.mh-fx'))return;
var fx=document.createElement('div');
fx.className='mh-fx';fx.setAttribute('aria-hidden','true');
fx.innerHTML='<div class="vg"></div><div class="ray"></div><div class="ray r2"></div><canvas></canvas><div class="ln"></div><div class="gl"></div>';
hd.insertBefore(fx,hd.firstChild);
var cv=fx.querySelector('canvas'),ctx=cv.getContext('2d'),R=Math.random;
if(!ctx)return;
var W=0,H=0,dpr=1,D=[],SD=[],G=[],T=[],B=[];
var SC=['#C9A24A','#D8B976','#B58B3E','#E8D3A0','#9C7A3C','#7A5A32'];
var TC=['#E0B94F','#D4AC4E','#EBCB7A','#C99A2E'];
function sprite(r,g,b){var c=document.createElement('canvas');c.width=c.height=48;var x=c.getContext('2d'),gr=x.createRadialGradient(24,24,0,24,24,24);gr.addColorStop(0,'rgba('+r+','+g+','+b+',1)');gr.addColorStop(.18,'rgba('+r+','+g+','+b+',.85)');gr.addColorStop(.5,'rgba('+r+','+g+','+b+',.22)');gr.addColorStop(1,'rgba('+r+','+g+','+b+',0)');x.fillStyle=gr;x.fillRect(0,0,48,48);return c}
var S={g:sprite(212,172,78),l:sprite(240,208,120),w:sprite(107,74,53),r:sprite(150,24,24),b:sprite(226,195,116),h:sprite(255,244,200)};
function build(){
var k=Math.min(2.5,Math.max(.8,W*H/(380*92)));
var nd=Math.round(140*k),ns=Math.round(400*k),ng=Math.round(55*k),nt=Math.round(36*k),nb=Math.round(9*Math.sqrt(k));
D=[];SD=[];G=[];T=[];B=[];
for(var i=0;i<nd;i++){var q=R(),z=q<.45?.4:q<.8?.7:1,t=R(),c=t<.5?'g':t<.82?'l':t<.93?'w':'r';
D.push({x:R()*W,y:R()*H,z:z,k:c,s:(1+R()*1.4)*z,vy:-(3+R()*7)*z,ph:R()*6.28,sp:.8+R()*2,ba:.65+R()*.35,ox:0,oy:0})}
for(var j=0;j<ns;j++){var u=R(),ci=u<.28?0:u<.52?1:u<.7?2:u<.86?3:u<.95?4:5,zz=.5+R()*.5;
SD.push({x:R()*W,y:R()*H,c:ci,s:(.7+R())*(.6+zz*.4),vx:(4+R()*14)*zz,vy:(R()-.55)*6*zz,ph:R()*6.28,sp:.5+R()*1.5,a:.5+R()*.45,ox:0,oy:0})}
for(var m=0;m<ng;m++){var cc=R();G.push({x:R()*W,y:R()*H,vx:(R()-.3)*6,vy:-(1+R()*4),ph:R()*6.28,sp:.7+R()*1.8,s:.6+R(),col:cc<.55?'255,244,205':cc<.85?'255,255,255':'255,214,150',rot:R()*.8})}
for(var a=0;a<nt;a++){var big=R()<.3;T.push({x:R()*W,y:R()*H,r:big?4.5+R()*3:2+R()*2.2,vx:(R()-.3)*3,vy:-(.5+R()*2),ph:R()*6.28,sp:.5+R()*1.1,rot:R()*1.57,rs:(R()-.5)*.25,col:TC[Math.floor(R()*TC.length)]})}
for(var n=0;n<nb;n++)B.push({x:R()*W,y:R()*H,r:8+R()*13,vx:(R()-.5)*4,vy:-(1+R()*2),ph:R()*6.28,sp:.2+R()*.3,a:.07+R()*.08});
}
function size(){var w=fx.clientWidth,h=fx.clientHeight;if(!w||!h)return;W=w;H=h;dpr=Math.min(window.devicePixelRatio||1,2);cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);build()}
function star(x,y,r,rot){var ri=r*.26;ctx.beginPath();for(var i=0;i<8;i++){var ang=rot+i*.7854,rr=i%2?ri:r,px=x+Math.cos(ang)*rr,py=y+Math.sin(ang)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath()}
var mx=-999,my=-999;
hd.addEventListener('pointermove',function(e){var b=fx.getBoundingClientRect();mx=e.clientX-b.left;my=e.clientY-b.top},{passive:true});
hd.addEventListener('pointerleave',function(){mx=my=-999},{passive:true});
function push(p,dt,z){var dx=p.x-mx,dy=p.y-my,dd=dx*dx+dy*dy;if(dd<3600&&dd>1){var m=Math.sqrt(dd),f=(1-m/60)*70*dt*z;p.ox+=dx/m*f;p.oy+=dy/m*f}var k=Math.pow(.05,dt);p.ox*=k;p.oy*=k}
var last=performance.now(),run=true,pending=false,reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function req(){if(pending)return;pending=true;requestAnimationFrame(function(t){pending=false;frame(t)})}
function frame(now){
if(!run)return;
if(!W){size();if(!W){req();return}}
var dt=Math.min((now-last)/1000,.05);last=now;var t=now/1000,i,n,c,s;
ctx.clearRect(0,0,W,H);
for(i=0;i<B.length;i++){var o=B[i];o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.y<-30)o.y=H+30;if(o.x<-30)o.x=W+30;if(o.x>W+30)o.x=-30;ctx.globalAlpha=o.a*(.7+.3*Math.sin(t*o.sp+o.ph));var d=o.r*2;ctx.drawImage(S.b,o.x-o.r,o.y-o.r,d,d)}
for(n=0;n<D.length;n++){var p=D[n];p.y+=p.vy*dt;p.x+=Math.sin(t*.5+p.ph)*5*p.z*dt;if(p.y<-6){p.y=H+6;p.x=R()*W}push(p,dt,p.z);
var tw=.5+.5*Math.sin(t*p.sp+p.ph),edge=Math.min(1,p.y/14,(H-p.y)/14+.3);
ctx.globalAlpha=Math.max(0,p.ba*(.35+.65*tw)*p.z*Math.min(1,edge));var d2=p.s*4.2;ctx.drawImage(S[p.k],p.x+p.ox-d2/2,p.y+p.oy-d2/2,d2,d2)}
for(c=0;c<SC.length;c++){ctx.fillStyle=SC[c];
for(s=0;s<SD.length;s++){var a=SD[s];if(a.c!==c)continue;
a.x+=(a.vx+Math.sin(t*.7+a.ph)*6)*dt;a.y+=(a.vy+Math.cos(t*.9+a.ph)*4)*dt;
if(a.x>W+3){a.x=-3;a.y=R()*H}if(a.y<-3)a.y=H+3;if(a.y>H+3)a.y=-3;
push(a,dt,.8);ctx.globalAlpha=a.a*(.75+.25*Math.sin(t*a.sp+a.ph));ctx.fillRect(a.x+a.ox,a.y+a.oy,a.s,a.s)}}
for(i=0;i<T.length;i++){var st=T[i];st.x+=st.vx*dt;st.y+=st.vy*dt;st.rot+=st.rs*dt;
if(st.y<-10){st.y=H+10;st.x=R()*W}if(st.x>W+10)st.x=-10;if(st.x<-10)st.x=W+10;
var tw2=.5+.5*Math.sin(t*st.sp+st.ph),sc=.55+.45*tw2,e2=Math.min(1,(st.y+4)/16,(H-st.y)/16+.4),rr=st.r*sc,al=(.4+.6*tw2)*Math.max(0,e2);
ctx.globalAlpha=al*.55;var gs=rr*5;ctx.drawImage(S.h,st.x-gs/2,st.y-gs/2,gs,gs);
ctx.globalAlpha=al;ctx.fillStyle=st.col;star(st.x,st.y,rr,st.rot);ctx.fill();
ctx.globalAlpha=al*.9;ctx.fillStyle='#FFF8DC';star(st.x,st.y,rr*.45,st.rot);ctx.fill()}
for(i=0;i<G.length;i++){var q=G[i];q.x+=q.vx*dt;q.y+=q.vy*dt;
if(q.y<-8){q.y=H+8;q.x=R()*W}if(q.x>W+8)q.x=-8;if(q.x<-8)q.x=W+8;
var fl=Math.pow(Math.max(0,Math.sin(t*q.sp+q.ph)),14);if(fl<.03)continue;
var L=(2.5+7*fl)*q.s;ctx.globalAlpha=Math.min(1,fl*.9);var g2=L*3.2;ctx.drawImage(S.h,q.x-g2/2,q.y-g2/2,g2,g2);
ctx.globalAlpha=Math.min(1,fl*1.1);ctx.strokeStyle='rgba('+q.col+',1)';ctx.lineWidth=.9;
ctx.beginPath();ctx.moveTo(q.x-L,q.y);ctx.lineTo(q.x+L,q.y);ctx.moveTo(q.x,q.y-L);ctx.lineTo(q.x,q.y+L);ctx.stroke();
var L2=L*.5,cr=Math.cos(.785+q.rot)*L2,sr=Math.sin(.785+q.rot)*L2;
ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(q.x-cr,q.y-sr);ctx.lineTo(q.x+cr,q.y+sr);ctx.moveTo(q.x-sr,q.y+cr);ctx.lineTo(q.x+sr,q.y-cr);ctx.stroke();
ctx.fillStyle='#fff';ctx.fillRect(q.x-.7,q.y-.7,1.4,1.4)}
ctx.globalAlpha=1;
if(!reduce)req()}
size();
req();
if('IntersectionObserver' in window){new IntersectionObserver(function(e){var v=e[0].isIntersecting;if(v&&!run&&!reduce){run=true;last=performance.now();req()}else if(!v)run=false}).observe(hd)}
document.addEventListener('visibilitychange',function(){if(document.hidden)run=false;else if(!run&&!reduce){run=true;last=performance.now();req()}});
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(size,200)});
setTimeout(function(){fx.classList.add('on')},120);
})();
