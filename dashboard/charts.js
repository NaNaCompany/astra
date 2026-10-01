/* Dependency-free, offline SVG charts. All axes show untransformed values unless labelled. */
(function(G){'use strict';
const C=['#168a7f','#e8a66b','#778aca','#b98cab','#96b4a1','#dc8e7f','#8db4c9','#baa679','#8e9ca4'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>!Number.isFinite(+v)?'—':Math.abs(v)>=1e8?(v/1e8).toFixed(1)+'억':Math.abs(v)>=1e4?(v/1e4).toFixed(Math.abs(v)>=1e6?0:1)+'만':Math.abs(v)>=1000?(v/1000).toFixed(1)+'천':Math.abs(v)<.01&&v!==0?Number(v).toExponential(1):Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
const raw=v=>Number.isFinite(+v)?Number(v).toLocaleString('ko-KR',{maximumFractionDigits:5}):String(v);
const tx=(x,y,s,opt='',size=10)=>`<text x="${x}" y="${y}" fill="#94a4ad" font-size="${size}" ${opt}>${esc(s)}</text>`;
const lin=(x1,y1,x2,y2,opt='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ecf0f2" ${opt}/>`;
const palette=(i)=>C[i%C.length];
const shorten=(value,limit)=>{const s=String(value??'');return s.length>limit?s.slice(0,limit-1)+'…':s};
const sparseTicks=(length,count=4)=>new Set(Array.from({length:Math.min(length,count)},(_,i)=>Math.round(i*(length-1)/Math.max(1,Math.min(length,count)-1))));
function shell(el,inner,W,H,legend=[],label='분석 그래프',compact=false){
 const shown=compact?legend.slice(0,2):legend;
 el.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="font-family:Segoe UI,맑은 고딕,sans-serif"><title>${esc(label)}</title>${inner}</svg>`+(legend.length?`<div class="chart-legend">${shown.map((s,i)=>`<span title="${esc(s.name||s)}"><i style="background:${s.color||palette(i)}"></i>${esc(compact?shorten(s.name||s,15):s.name||s)}</span>`).join('')}${compact&&legend.length>shown.length?`<span class="chart-legend-more" title="${esc(legend.slice(shown.length).map(s=>s.name||s).join(', '))}">+${legend.length-shown.length}개 계열</span>`:''}</div>`:'');
 let tip;el.querySelectorAll('[data-tip]').forEach(node=>{node.addEventListener('pointerenter',()=>{tip=document.createElement('div');tip.className='chart-tooltip';tip.textContent=node.getAttribute('data-tip');el.append(tip)});node.addEventListener('pointermove',e=>{if(tip){let rect=el.getBoundingClientRect();tip.style.left=Math.min(e.clientX-rect.left+8,Math.max(0,rect.width-tip.offsetWidth-8))+'px';tip.style.top=Math.max(0,e.clientY-rect.top-50)+'px'}});node.addEventListener('pointerleave',()=>{if(tip)tip.remove();tip=null})});
}
function render(el,chart,opts={}){
 if(typeof el==='string')el=document.querySelector(el);if(!el)return;
 if(!chart){el.innerHTML='<div class="empty-chart">이 분석은 수치와 결과표로 확인할 수 있습니다.</div>';return}
 let type=chart.type||'bar';if(type==='histogram')type='bar';if(type==='matrix')type='heatmap';
 const compact=!!opts.compact,W=opts.width||(compact?340:740),H=opts.height||(compact?190:280);
 if(type==='heatmap')return heatmap(el,chart,W,H,opts);
 if(type==='scatter')return scatter(el,chart,W,H,opts);
 if(type==='box')return box(el,chart,W,H,opts);
 if(type==='interval')return interval(el,chart,W,H,opts);
 let labels=(chart.labels||[]).map(String),series=(chart.series||[]).map(s=>({name:s.name||'',values:(s.values||[]).map(v=>Number.isFinite(+v)&&v!==null?+v:null)}));
 if(!labels.length&&series.length)labels=series[0].values.map((_,i)=>String(i+1));
 if(!series.length||!labels.length){el.innerHTML='<div class="empty-chart">표시할 그래프 데이터가 없습니다.</div>';return}
 const L=compact?46:64,R=compact?12:16,T=compact?12:18,B=compact?30:labels.some(s=>s.length>14)?66:42,PW=W-L-R,PH=H-T-B;
 let nums=series.flatMap(s=>s.values.filter(v=>v!==null));if(!nums.length){el.innerHTML='<div class="empty-chart">유효한 수치가 없습니다.</div>';return}
 let lo=Math.min(0,...nums),hi=Math.max(0,...nums);if(lo===hi)hi=lo+1;hi+=.10*(hi-lo);if(lo<0)lo-=.05*(hi-lo);
 const y=v=>T+PH-(v-lo)/(hi-lo)*PH;
 const steps=compact?3:4;let out='';for(let i=0;i<=steps;i++){let v=lo+(hi-lo)*i/steps,py=y(v);out+=lin(L,py,W-R,py)+tx(L-(compact?6:10),py+3,fmt(v),'text-anchor="end"',compact?9:10)}
 const dateLike=labels.every(x=>/^\d{4}-\d{2}/.test(x));const lab=v=>dateLike?v.slice(5):shorten(v,compact?9:17),ticks=sparseTicks(labels.length);
 let tickEvery=Math.max(1,Math.ceil(labels.length/9));
 if(type==='line'){
  const x=i=>L+(labels.length===1?PW/2:i/(labels.length-1)*PW);
  if(series.length===1&&lo>=0){let good=series[0].values.map((v,i)=>v!==null?[x(i),y(v)]:null).filter(Boolean);if(good.length)out+=`<path d="M${good[0][0]},${y(0)} ${good.map(p=>'L'+p.join(',')).join(' ')} L${good.at(-1)[0]},${y(0)} Z" fill="${palette(0)}" opacity=".06"/>`}
  series.forEach((s,j)=>{let d='',open=false;s.values.slice(0,labels.length).forEach((v,i)=>{if(v===null){open=false;return}d+=(open?'L':'M')+x(i)+','+y(v)+' ';open=true});out+=`<path d="${d}" fill="none" stroke="${palette(j)}" stroke-width="${compact?1.8:2.4}" stroke-linejoin="round" stroke-linecap="round"/>`;s.values.slice(0,labels.length).forEach((v,i)=>{if(v!==null)out+=`<circle cx="${x(i)}" cy="${y(v)}" r="${compact?2.3:labels.length>40?5:4}" fill="${palette(j)}" opacity="${labels.length>(compact?20:40)?.03:1}" data-tip="${esc(labels[i]+'\n'+s.name+': '+raw(v))}"/>`})});
  labels.forEach((s,i)=>{if(compact?ticks.has(i):(i%tickEvery===0&&i<labels.length-1-Math.floor(tickEvery/2))||i===labels.length-1)out+=tx(x(i),H-B+(compact?19:23),lab(s),`text-anchor="${compact&&i===labels.length-1&&i>0?'end':compact&&i===0?'start':'middle'}"`,compact?9:10)});
 }else{
  const groupW=PW/labels.length,barW=Math.min(40,groupW*.68/series.length);
  series.forEach((s,j)=>s.values.slice(0,labels.length).forEach((v,i)=>{if(v===null)return;const x=L+groupW*i+groupW/2+(j-series.length/2)*barW,py=Math.min(y(0),y(v));out+=`<rect x="${x}" y="${py}" width="${Math.max(1,barW-2)}" height="${Math.max(1,Math.abs(y(v)-y(0)))}" rx="2" fill="${palette(j)}" opacity="${.65+.35*i/Math.max(1,labels.length-1)}" data-tip="${esc(labels[i]+'\n'+s.name+': '+raw(v))}"/>`}));
  labels.forEach((s,i)=>{if(compact?ticks.has(i):i%tickEvery===0)out+=tx(L+groupW*(i+.5),H-B+(compact?19:23),lab(s),`text-anchor="${compact&&i===labels.length-1&&i>0?'end':compact&&i===0?'start':'middle'}"`,compact?9:10)});
 }
 shell(el,out,W,H,series,opts.label||chart.title||'분석 결과',compact);
}
function scatter(el,ch,W,H,opts={}){
 const compact=!!opts.compact;
 const pts=(ch.points||[]).filter(p=>Number.isFinite(+p.x)&&Number.isFinite(+p.y));if(!pts.length){el.innerHTML='<div class="empty-chart">산점도에 필요한 좌표가 없습니다.</div>';return}
 let xs=pts.map(p=>+p.x),ys=pts.map(p=>+p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmin===xmax)xmax=xmin+1;if(ymin===ymax)ymax=ymin+1;const xp=.06*(xmax-xmin),yp=.08*(ymax-ymin);xmin-=xp;xmax+=xp;ymin-=yp;ymax+=yp;
 const L=compact?46:68,R=compact?12:20,T=compact?12:20,B=compact?30:43,x=v=>L+(v-xmin)/(xmax-xmin)*(W-L-R),y=v=>T+(ymax-v)/(ymax-ymin)*(H-T-B),steps=compact?3:4;let out='';for(let i=0;i<=steps;i++){let vx=xmin+(xmax-xmin)*i/steps,vy=ymin+(ymax-ymin)*i/steps;out+=lin(L,y(vy),W-R,y(vy))+tx(L-(compact?6:9),y(vy)+3,fmt(vy),'text-anchor="end"',compact?9:10)+tx(x(vx),H-(compact?11:15),fmt(vx),`text-anchor="${compact&&i===steps?'end':compact&&i===0?'start':'middle'}"`,compact?9:10)}
 if(ch.diagonal){let lo=Math.max(xmin,ymin),hi=Math.min(xmax,ymax);out+=lin(x(lo),y(lo),x(hi),y(hi),'stroke-dasharray="4 4"')}
 const gr=[...new Set(pts.map(p=>p.group||''))];pts.slice(0,3000).forEach(p=>{let k=gr.indexOf(p.group||'');out+=`<circle cx="${x(+p.x)}" cy="${y(+p.y)}" r="${compact?(pts.length<35?3.4:1.8):pts.length<35?4.7:2.5}" fill="${palette(k)}" opacity="${pts.length<35?.8:.36}" data-tip="${esc((p.label||'관측')+'\nx: '+raw(p.x)+' · y: '+raw(p.y))}"/>`;if(!compact&&pts.length<=20&&p.label)out+=tx(x(+p.x)+7,y(+p.y)-6,p.label,'',9)});shell(el,out,W,H,gr.length>1?gr.map(name=>({name})):[],opts.label||ch.title||'산점도',compact);
}
function heatmap(el,ch,W,H,opts={}){
 const compact=!!opts.compact;
 let matrix=ch.matrix||[],xl=ch.xLabels||ch.labels||[],yl=ch.yLabels||[];
 if(!matrix.length&&ch.series?.length){matrix=ch.series.map(s=>s.values);yl=ch.series.map(s=>s.name);xl=ch.labels||[]}
 if(!matrix.length||!matrix[0]?.length){el.innerHTML='<div class="empty-chart">교차표 데이터가 없습니다.</div>';return}
 const nr=matrix.length,nc=matrix[0].length;if(!xl.length)xl=Array.from({length:nc},(_,i)=>String(i+1));if(!yl.length)yl=Array.from({length:nr},(_,i)=>String(i+1));if(!compact)H=Math.max(H,nr*29+52);
 const L=compact?59:95,R=compact?8:15,T=compact?8:10,B=compact?30:40,cw=(W-L-R)/nc,rh=(H-T-B)/nr,nums=matrix.flat().filter(Number.isFinite),min=Math.min(0,...nums),max=Math.max(1,...nums),xticks=sparseTicks(nc),yticks=sparseTicks(nr,5),gap=compact?Math.min(1.5,cw/5,rh/5):2;let out='';
 matrix.forEach((row,i)=>{if(!compact||yticks.has(i))out+=tx(L-(compact?6:10),T+rh*(i+.5)+3,compact?shorten(yl[i]||String(i+1),6):yl[i]||String(i+1),'text-anchor="end"',compact?9:10);row.forEach((v,j)=>{if(!Number.isFinite(v))return;let q=min<0?Math.abs(v)/Math.max(Math.abs(min),max):v/max;let c=v<0?'#db997b':palette(0);out+=`<rect x="${L+j*cw+gap}" y="${T+i*rh+gap}" width="${Math.max(.1,cw-2*gap)}" height="${Math.max(.1,rh-2*gap)}" rx="${compact?1.5:3}" fill="${c}" opacity="${.1+.8*q}" data-tip="${esc((yl[i]||i)+' × '+(xl[j]||j)+': '+raw(v))}"/>`;if(compact?cw>=42&&rh>=21&&nc<=6&&nr<=6:nc<=12&&nr<=20)out+=`<text x="${L+(j+.5)*cw}" y="${T+(i+.5)*rh+4}" font-size="${compact?9:10}" text-anchor="middle" fill="${q>.65?'#fff':'#40656c'}">${esc(fmt(v))}</text>`})});
 xl.forEach((s,j)=>{if(!compact||xticks.has(j))out+=tx(L+(j+.5)*cw,H-(compact?11:15),shorten(s,compact?7:12),`text-anchor="${compact&&j===nc-1&&j>0?'end':compact&&j===0?'start':'middle'}"`,compact?9:10)});shell(el,out,W,H,[],opts.label||ch.title||'교차 관계 히트맵',compact);
}
function box(el,ch,W,H,opts={}){
 const compact=!!opts.compact;
 let boxes=ch.boxes||ch.data||[];if(!boxes.length&&ch.series?.length)boxes=ch.series.filter(s=>s.values?.length>=5).map(s=>({label:s.name,min:s.values[0],q1:s.values[1],median:s.values[2],q3:s.values[3],max:s.values[4]}));
 boxes=boxes.filter(b=>[b.min,b.q1,b.median,b.q3,b.max].every(Number.isFinite));if(!boxes.length){el.innerHTML='<div class="empty-chart">분위수는 결과표에서 확인할 수 있습니다.</div>';return}
 const L=compact?46:65,R=compact?12:15,T=compact?12:15,B=compact?30:40,PW=W-L-R,PH=H-T-B,hi=Math.max(...boxes.map(b=>b.max))*1.06||1,lo=Math.min(0,...boxes.map(b=>b.min)),y=v=>T+(hi-v)/(hi-lo)*PH,steps=compact?3:4,ticks=sparseTicks(boxes.length);let out='';for(let i=0;i<=steps;i++){let v=lo+(hi-lo)*i/steps;out+=lin(L,y(v),W-R,y(v))+tx(L-(compact?6:9),y(v)+3,fmt(v),'text-anchor="end"',compact?9:10)}
 boxes.forEach((b,i)=>{let x=L+PW*(i+.5)/boxes.length,bw=Math.min(compact?34:44,PW/boxes.length*.48),c=palette(i);out+=`<g data-tip="${esc(b.label+'\n최솟값 '+raw(b.min)+'\nQ1 '+raw(b.q1)+'\n중앙값 '+raw(b.median)+'\nQ3 '+raw(b.q3)+'\n최댓값 '+raw(b.max))}"><line x1="${x}" y1="${y(b.max)}" x2="${x}" y2="${y(b.min)}" stroke="${c}"/><rect x="${x-bw/2}" y="${y(b.q3)}" width="${bw}" height="${Math.max(2,y(b.q1)-y(b.q3))}" rx="2" fill="${c}" opacity=".3"/><line x1="${x-bw/2}" x2="${x+bw/2}" y1="${y(b.median)}" y2="${y(b.median)}" stroke="${c}" stroke-width="2"/></g>`;if(!compact||ticks.has(i))out+=tx(x,H-(compact?11:15),compact?shorten(b.label,8):b.label,`text-anchor="${compact&&i===boxes.length-1&&i>0?'end':compact&&i===0&&boxes.length>1?'start':'middle'}"`,compact?9:10)});shell(el,out,W,H,[],opts.label||ch.title||'집단별 금액 상자그림',compact);
}
function interval(el,ch,W,H,opts={}){
 const compact=!!opts.compact,pts=(ch.points||[]).filter(p=>[p.value,p.lo,p.hi].every(Number.isFinite));
 if(!pts.length){el.innerHTML='<div class="empty-chart">표시할 추정치와 신뢰구간이 없습니다.</div>';return}
 let lo=Math.min(0,...pts.flatMap(p=>[p.value,p.lo,p.hi])),hi=Math.max(0,...pts.flatMap(p=>[p.value,p.lo,p.hi]));if(lo===hi)hi=lo+1;const pad=(hi-lo)*.07;lo-=pad;hi+=pad;
 const L=compact?76:140,R=compact?12:25,T=compact?12:18,B=compact?30:42,PW=W-L-R,PH=H-T-B,x=v=>L+(v-lo)/(hi-lo)*PW,y=i=>T+PH*(i+.5)/pts.length,steps=compact?3:4;let out='';
 for(let i=0;i<=steps;i++){const v=lo+(hi-lo)*i/steps;out+=lin(x(v),T,x(v),H-B)+tx(x(v),H-(compact?11:15),fmt(v),`text-anchor="${compact&&i===0?'start':compact&&i===steps?'end':'middle'}"`,compact?9:10)}
 out+=`<line x1="${x(0)}" y1="${T}" x2="${x(0)}" y2="${H-B}" stroke="#9aabb2" stroke-dasharray="3 4"/>`;
 pts.forEach((p,i)=>{const py=y(i),color=palette(0),tip=(p.label||String(i+1))+'\n추정치: '+raw(p.value)+'\n'+(ch.intervalLabel||'95% 신뢰구간')+': '+raw(p.lo)+' ~ '+raw(p.hi);out+=tx(L-8,py+3,shorten(p.label||String(i+1),compact?7:16),'text-anchor="end"',compact?9:10)+`<g data-tip="${esc(tip)}"><rect x="${L}" y="${py-9}" width="${PW}" height="18" fill="transparent"/><line x1="${x(p.lo)}" y1="${py}" x2="${x(p.hi)}" y2="${py}" stroke="${color}" stroke-width="${compact?2:3}"/><line x1="${x(p.lo)}" y1="${py-4}" x2="${x(p.lo)}" y2="${py+4}" stroke="${color}"/><line x1="${x(p.hi)}" y1="${py-4}" x2="${x(p.hi)}" y2="${py+4}" stroke="${color}"/><circle cx="${x(p.value)}" cy="${py}" r="${compact?3.6:5}" fill="${color}" stroke="white" stroke-width="1.5"/></g>`});
 shell(el,out,W,H,[{name:'추정치 (점)'},{name:(ch.intervalLabel||'95% 신뢰구간')+' (선)',color:palette(0)}],opts.label||ch.title||'추정치와 신뢰구간',compact);
}
function horizontal(el,items){let total=items.reduce((s,d)=>s+d.value,0),max=Math.max(1,...items.map(d=>d.value));el.innerHTML=items.map((d,i)=>`<div style="margin:0 0 14px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;font-size:10px;color:#738993"><span>${esc(d.label)}</span><span style="font-variant-numeric:tabular-nums;color:#718991">${fmt(d.value)}원 <small style="color:#aab5bb;margin-left:7px">${(100*d.value/(total||1)).toFixed(1)}%</small></span></div><div style="height:6px;background:#f2f5f6;border-radius:4px;overflow:hidden"><div style="height:6px;width:${d.value/max*100}%;background:${i===0?palette(0):'#a3c8be'};border-radius:4px"></div></div></div>`).join('')}
G.DashCharts={render,horizontal,palette:C,fmt};
})(globalThis);
