/* Offline time-series and validation analyses. Each named method is isolated:
   an unsupported data shape or numerical error produces a DROP card. */
(() => {
  'use strict';
  const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
  const sum = a => a.reduce((s,x)=>s+x,0);
  const variance = a => { const m=mean(a); return sum(a.map(x=>(x-m)**2))/(a.length-1); };
  const quantile = (a,p) => { const v=a.slice().sort((x,y)=>x-y), t=(v.length-1)*p, i=Math.floor(t); return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(t-i); };
  const metric = (label,value,format='number') => ({label,value,format});
  const chart = (type,labels,series) => ({type,labels,series});
  const series = (name,values) => ({name,values});
  const fail = s => { throw new Error(s); };
  const need = (test,s) => { if(!test) fail(s); };
  const random = seed => { let t=seed>>>0; return () => { t+=0x6D2B79F5; let x=t; x=Math.imul(x^(x>>>15),x|1); x^=x+Math.imul(x^(x>>>7),x|61); return ((x^(x>>>14))>>>0)/4294967296; }; };
  function logGamma(z) {
    const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(z<.5) return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z-=1; let x=.99999999999980993; for(let i=0;i<c.length;i++) x+=c[i]/(z+i+1);
    const t=z+7.5; return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function chiTail(x,df) {
    need(df>0 && x>=0,'카이제곱 근사의 자유도가 부족합니다.');
    if(x===0) return 1;
    const a=df/2, z=x/2, lead=Math.exp(-z+a*Math.log(z)-logGamma(a));
    if(z<a+1) { let s=1/a, t=s; for(let i=1;i<500;i++){t*=z/(a+i);s+=t;if(Math.abs(t)<Math.abs(s)*1e-13) break;} return Math.max(0,Math.min(1,1-lead*s)); }
    let b=z+1-a,c=1e30,d=1/b,h=d;
    for(let i=1;i<500;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-30)d=1e-30;c=b+an/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<1e-13)break;}
    return Math.max(0,Math.min(1,lead*h));
  }
  function solve(A,b) {
    const n=b.length, m=A.map((r,i)=>[...r,b[i]]);
    for(let j=0;j<n;j++) { let k=j;for(let i=j+1;i<n;i++)if(Math.abs(m[i][j])>Math.abs(m[k][j]))k=i;
      need(Math.abs(m[k][j])>1e-10,'설계행렬의 독립적인 정보가 부족합니다.'); [m[j],m[k]]=[m[k],m[j]];
      const v=m[j][j];for(let u=j;u<=n;u++)m[j][u]/=v;
      for(let i=0;i<n;i++)if(i!==j){const f=m[i][j];for(let u=j;u<=n;u++)m[i][u]-=f*m[j][u];}
    } return m.map(r=>r[n]);
  }
  function ols(X,y) {
    need(X.length> X[0].length+2,'회귀 추정을 위한 날짜 수가 부족합니다.');
    const p=X[0].length,A=Array.from({length:p},()=>Array(p).fill(0)),b=Array(p).fill(0);
    for(let k=0;k<y.length;k++)for(let i=0;i<p;i++){b[i]+=X[k][i]*y[k];for(let j=0;j<p;j++)A[i][j]+=X[k][i]*X[k][j];}
    const beta=solve(A,b),fit=X.map(r=>sum(r.map((v,j)=>v*beta[j]))),res=y.map((v,i)=>v-fit[i]);
    const sse=sum(res.map(v=>v*v)),sst=sum(y.map(v=>(v-mean(y))**2));
    return {beta,fit,res,sse,r2:sst>0?1-sse/sst:0,p};
  }
  function correlation(a,b) {
    need(a.length===b.length && a.length>2,'상관 계산에 날짜가 부족합니다.');
    const ma=mean(a),mb=mean(b),aa=sum(a.map(v=>(v-ma)**2)),bb=sum(b.map(v=>(v-mb)**2));
    need(aa>0 && bb>0,'한 변수의 값이 모두 같아 상관을 정의할 수 없습니다.');
    return sum(a.map((v,i)=>(v-ma)*(b[i]-mb)))/Math.sqrt(aa*bb);
  }
  function rank(a) {
    const ix=a.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v), out=[];
    for(let i=0;i<ix.length;){let j=i+1;while(j<ix.length && ix[j].v===ix[i].v)j++;for(let k=i;k<j;k++)out[ix[k].i]=(i+j-1)/2+1;i=j;}return out;
  }
  function acf(a,max) {
    const m=mean(a),den=sum(a.map(v=>(v-m)**2));need(den>0,'시계열 분산이 0입니다.');
    return Array.from({length:max+1},(_,k)=>sum(a.slice(k).map((v,i)=>(v-m)*(a[i]-m)))/den);
  }
  function ljung(a,m) {const r=acf(a,m),n=a.length,Q=n*(n+2)*sum(r.slice(1).map((v,i)=>v*v/(n-i-1)));return {Q,p:chiTail(Q,m),r};}
  function normalQuantile(p) {
    const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924],b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857],c=[-.00778489400243029,-.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878],d=[.00778469570904146,.32246712907004,2.445134137143,3.75440866190742];
    if(p<.02425){const q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
    if(p>.97575)return -normalQuantile(1-p);
    const q=p-.5,r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  function loess(y,span,x0) {
    const n=y.length,k=Math.min(n,span), nearest=Array.from({length:n},(_,i)=>i).sort((a,b)=>Math.abs(a-x0)-Math.abs(b-x0)).slice(0,k);
    const h=Math.max(...nearest.map(i=>Math.abs(i-x0)))*1.000001 || 1;
    let sw=0,sx=0,sy=0,sxx=0,sxy=0;
    for(const i of nearest){const x=i-x0,w=(1-(Math.abs(x)/h)**3)**3;sw+=w;sx+=w*x;sy+=w*y[i];sxx+=w*x*x;sxy+=w*x*y[i];}
    const den=sw*sxx-sx*sx;return Math.abs(den)>1e-12?(sy*sxx-sx*sxy)/den:sy/sw;
  }
  const smooth = (a,w) => a.map((_,i)=>loess(a,w,i));
  const movingValid = (a,w) => Array.from({length:a.length-w+1},(_,i)=>mean(a.slice(i,i+w)));
  function stl(y) {
    need(y.length>=35,'주간 STL에는 최소 5주가 필요합니다.');
    const n=y.length,p=7; let trend=Array(n).fill(0),season=Array(n).fill(0);
    for(let loop=0;loop<5;loop++) {
      const detrend=y.map((v,i)=>v-trend[i]),ext=Array(n+2*p).fill(0);
      for(let phase=0;phase<p;phase++) {
        const sub=detrend.filter((_,i)=>i%p===phase);
        for(let t=-p;t<n+p;t++)if(((t%p)+p)%p===phase)ext[t+p]=loess(sub,7,(t-phase)/p);
      }
      const low=smooth(movingValid(movingValid(movingValid(ext,p),p),3),9);
      need(low.length===n,'STL 저역통과 단계에서 길이가 일치하지 않습니다.');
      season=y.map((_,i)=>ext[i+p]-low[i]); trend=smooth(y.map((v,i)=>v-season[i]),15);
    }
    const residual=y.map((v,i)=>v-trend[i]-season[i]);
    need([...trend,...season,...residual].every(Number.isFinite),'STL 계산에 유한하지 않은 값이 발생했습니다.');
    return {trend,season,residual};
  }
  function ar(y,lag) {
    need(y.length>=Math.max(21,lag*3),'자기회귀 추정에 최소 3주가 필요합니다.');
    const fit=ols(y.slice(lag).map((_,i)=>[1,y[i]]),y.slice(lag)),[c,phi]=fit.beta;
    need(Math.abs(phi)<1,'추정 자기회귀 계수가 정상성 범위를 벗어나 이 모형을 DROP했습니다.');
    return {c,phi,sigma2:fit.sse/(y.length-lag-2),lag};
  }
  function ets(y) {
    need(y.length>=14,'ETS 추정에 최소 2주가 필요합니다.');let best;
    for(let a=.05;a<.96;a+=.05){let level=y[0],sse=0;for(let i=1;i<y.length;i++){sse+=(y[i]-level)**2;level=a*y[i]+(1-a)*level;}if(!best || sse<best.sse)best={alpha:a,level,sse};}
    return {...best,sigma2:best.sse/(y.length-2)};
  }
  function forecast(y,kind,h=7) {
    need(y.length>=14,'예측에는 최소 2주가 필요합니다.');
    if(kind==='계절 단순')return {values:Array.from({length:h},(_,i)=>y[y.length-7+(i%7)]),info:'전주 같은 요일 값',params:[]};
    if(kind==='ETS(A,N,N)'){const m=ets(y);return {values:Array(h).fill(m.level),se:Array.from({length:h},(_,i)=>Math.sqrt(m.sigma2*(1+i*m.alpha*m.alpha))),info:'가법 오차·추세 없음·계절 없음',params:[metric('α',m.alpha)]};}
    const lag=kind==='ARIMA(1,0,0)'?1:7,m=ar(y,lag),v=y.slice();
    for(let i=0;i<h;i++)v.push(m.c+m.phi*v[v.length-lag]);
    return {values:v.slice(-h),se:Array.from({length:h},(_,i)=>Math.sqrt(m.sigma2*sum(Array.from({length:Math.floor(i/lag)+1},(_,j)=>m.phi**(2*j))))),info:`상수 + ${lag}일 지연값 회귀; 조건부 최소제곱 추정`,params:[metric('자기회귀 계수',m.phi)]};
  }
  const kinds=['계절 단순','ETS(A,N,N)','ARIMA(1,0,0)','SARIMA(0,0,0)(1,0,0)[7]'];
  function crossValidate(y) {
    need(y.length>=42,'시간 교차검증에는 최소 6주가 필요합니다.');
    const horizon=Math.min(14,Math.floor(y.length/4)),result=[];
    for(const kind of kinds){try {let e=[];for(let t=y.length-horizon;t<y.length;t++)e.push(y[t]-forecast(y.slice(0,t),kind,1).values[0]);result.push({kind,mae:mean(e.map(Math.abs)),rmse:Math.sqrt(mean(e.map(v=>v*v))),n:e.length});}catch(error){result.push({kind,error:error.message});}}
    return result;
  }
  function dailyRows(rows,ctx) {
    need(rows.length>0,'선택된 거래가 없습니다.');
    const dates=rows.map(r=>r.date).sort(),lo=ctx.dateFrom || (ctx.dataBounds && ctx.dataBounds.min) || dates[0],hi=ctx.dateTo || (ctx.dataBounds && ctx.dataBounds.max) || dates[dates.length-1];
    let start=Date.parse(lo+'T00:00:00Z'),end=Date.parse(hi+'T00:00:00Z');
    need(Number.isFinite(start) && Number.isFinite(end) && end>=start && (end-start)/864e5<3660,'지원 날짜 범위는 최대 10년입니다.');
    const days=[];for(let t=start;t<=end;t+=864e5){const date=new Date(t),key=date.toISOString().slice(0,10);days.push({date:key,count:0,total:0,sales:0,purchases:0,weekday:date.getUTCDay(),month:key.slice(0,7),monthEnd:date.getUTCDate()>=26?1:0,groups:{}});}
    const map=new Map(days.map(d=>[d.date,d]));
    for(const r of rows){const d=map.get(r.date);if(!d)continue;d.count++;d.total+=r.amount;if(r.type==='매출')d.sales+=r.amount;if(r.type==='매입')d.purchases+=r.amount;const key=r[ctx.groupBy || 'department'];d.groups[key]=(d.groups[key]||0)+r.amount;}
    return days;
  }
  function design(days,calendar=true) {
    const weekdays=[...new Set(days.map(d=>d.weekday))].sort(),months=[...new Set(days.map(d=>d.month))].sort(),endVar=new Set(days.map(d=>d.monthEnd)).size>1;
    const labels=['절편',...weekdays.slice(1).map(k=>`요일 ${k}`),...(calendar?months.slice(1).map(k=>k):['날짜 추세']),...(calendar && endVar?['26일 이후']:[])];
    const X=days.map((d,i)=>[1,...weekdays.slice(1).map(k=>+(k===d.weekday)),...(calendar?months.slice(1).map(k=>+(k===d.month)):[i/Math.max(1,days.length-1)]),...(calendar && endVar?[d.monthEnd]:[])]);
    return {X,labels};
  }
  function weekFamily(days,rows,key,seed) {
    const w=Math.floor(days.length/7);need(w>=6,'블록 순열검정에는 최소 6개의 완전한 7일 블록이 필요합니다.');
    const counts={};for(const r of rows)counts[r[key]]=(counts[r[key]]||0)+1;
    const names=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,12);need(names.length>=2,'비교할 집단이 두 개 이상 필요합니다.');
    const weekly=names.map(name=>Array.from({length:w},(_,i)=>Math.log1p(sum(days.slice(i*7,i*7+7).map(d=>d.groups[name]||0)))));
    const rng=random(seed),signs=Array.from({length:499},()=>Array.from({length:w},()=>rng()<.5?-1:1)),out=[];
    for(let a=0;a<names.length;a++)for(let b=a+1;b<names.length;b++){
      const delta=weekly[a].map((v,i)=>v-weekly[b][i]),observed=Math.abs(mean(delta));let exceed=0;
      for(const sign of signs)if(Math.abs(mean(delta.map((v,i)=>v*sign[i])))>=observed-1e-12)exceed++;
      out.push({a:names[a],b:names[b],p:(exceed+1)/500,effect:mean(delta)});
    }
    const ordered=out.map((r,i)=>({...r,i})).sort((a,b)=>a.p-b.p);let prev=0;
    for(let i=0;i<ordered.length;i++){prev=Math.max(prev,Math.min(1,ordered[i].p*(ordered.length-i)));out[ordered[i].i].holm=prev;}
    let next=1;for(let i=ordered.length-1;i>=0;i--){next=Math.min(next,ordered[i].p*ordered.length/(i+1));out[ordered[i].i].bh=Math.min(1,next);}
    return {tests:out,weeks:w,names,partial:days.length-w*7};
  }
  globalThis.DashboardModules=globalThis.DashboardModules||{};
  globalThis.DashboardModules.temporal=async function(rows,ctx={}) {
    const cards=[],seed=ctx.seed || 20261001;
    const add=(id,fn)=>{try{const c=fn();cards.push({id:String(id),status:'ok',summary:'',explanation:'',metrics:[],notes:[],...c});}catch(error){cards.push({id:String(id),status:'dropped',summary:'적용 제외',explanation:'이 기법의 조건 또는 계산 단계가 충족되지 않아 요청대로 DROP했습니다.',metrics:[],notes:[error.message]});}};
    let days;try{days=dailyRows(rows,ctx);}catch(error){for(const id of [...Array.from({length:19},(_,i)=>56+i),...Array.from({length:11},(_,i)=>86+i)])add(id,()=>fail(error.message));return cards;}
    const labels=days.map(d=>d.date.slice(5)),counts=days.map(d=>d.count),sales=days.map(d=>d.sales),purchases=days.map(d=>d.purchases),n=days.length,unitNote=`분석 단위는 ${n}개 달력일입니다. 선택 기간 안에서 필터를 통과한 거래가 없는 날짜는 0건으로 집계합니다.`,emptyNote=ctx.completeLedger===false?'자료가 전체 원장인지 확인되지 않았으므로 누락 날짜와 실제 0건 날짜를 구분할 수 없습니다.':unitNote;
    let calendarCache,cvCache,familyCache;
    const calendar=()=>calendarCache||(calendarCache={...design(days),...ols(design(days).X,counts)});
    const cv=()=>cvCache||(cvCache=crossValidate(counts));
    const family=()=>familyCache||(familyCache=weekFamily(days,rows,ctx.groupBy || 'department',seed+89));
    const weekdayAdjusted=y=>{const by=Array.from({length:7},()=>[]);days.forEach((d,i)=>by[d.weekday].push(y[i]));return y.map((v,i)=>v-mean(by[days[i].weekday]));};
    const formatN=v=>Number(v.toFixed(4));
    add(56,()=>({summary:`${n}일의 매출·매입 총액을 날짜 순서로 비교합니다.`,explanation:'각 거래일의 매출액과 매입액을 따로 더했습니다. 두 값의 차이는 원가 대응이 확인된 이익이 아닙니다.',metrics:[metric('일평균 거래 건수',mean(counts)),metric('최대 일거래 건수',Math.max(...counts))],chart:chart('line',labels,[series('매출액',sales),series('매입액',purchases)]),notes:[unitNote,emptyNote]}));
    add(57,()=>{need(n>=7,'7일 이동평균을 위한 기간이 부족합니다.');return {summary:'직전 7일 평균으로 일별 거래 건수의 흐름을 봅니다.',explanation:'각 날짜와 그 이전 6일만 사용한 후행 이동평균입니다. 미래 관측을 사용하지 않으며 처음 6일은 표시하지 않습니다.',metrics:[metric('마지막 7일 평균',mean(counts.slice(-7)))],chart:chart('line',labels.slice(6),[series('실제 거래 건수',counts.slice(6)),series('7일 이동평균',movingValid(counts,7))]),notes:[unitNote]};});
    add(58,()=>{need(n>=7,'7일 이동중앙값을 위한 기간이 부족합니다.');return {summary:'일별 총액의 7일 중앙값으로 일시적인 고액 거래의 영향을 줄여 봅니다.',explanation:'7개 날짜의 총 거래금액 중앙값입니다. 거래 1건당 금액의 중앙값과는 다릅니다.',metrics:[metric('마지막 7일 총액 중앙값',quantile(days.slice(-7).map(d=>d.total),.5),'money')],chart:chart('line',labels.slice(6),[series('실제 일총액',days.slice(6).map(d=>d.total)),series('7일 중앙값',Array.from({length:n-6},(_,i)=>quantile(days.slice(i,i+7).map(d=>d.total),.5)))]),notes:[unitNote]};});
    add(59,()=>{const m=calendar();return {status:'limited',summary:'요일·월·26일 이후 여부와 일별 건수의 관계를 함께 추정합니다.',explanation:'일별 거래 건수를 종속변수로 하는 최소제곱 회귀입니다. 기준 요일·기준 월과 비교하며, 월말은 26일부터로 정의했습니다. 날짜 구성의 기술적 설명이며 인과효과가 아닙니다.',metrics:[metric('설명력 R²',m.r2),metric('잔차 표준편차',Math.sqrt(m.sse/(n-m.p)))],chart:chart('line',labels,[series('실제',counts),series('달력 회귀 적합값',m.fit)]),table:{headers:['항목','계수 (건)'],rows:m.labels.map((s,i)=>[s,formatN(m.beta[i])])},notes:['건수의 정규 오차를 가정한 유의확률은 제시하지 않습니다. 음수 적합값이 있으면 건수 예측용으로 사용하지 마세요.',unitNote]};});
    add(60,()=>{need(n>=21,'ACF에는 최소 21일이 필요합니다.');const r=acf(counts,Math.min(21,Math.floor(n/3)));return {summary:'이전 날짜와 거래 건수의 연관성을 시차별로 살펴봅니다.',explanation:'전체 평균을 뺀 일별 거래 건수의 자기상관입니다. 요일 반복이나 추세도 포함되므로 잔차의 독립성 검정과 구분합니다.',metrics:[metric('7일 시차 ACF',r[7])],chart:chart('bar',r.slice(1).map((_,i)=>`${i+1}일`),[series('ACF',r.slice(1))]),notes:[unitNote]};});
    add(61,()=>{need(n>=28,'PACF에는 최소 28일이 필요합니다.');const m=Math.min(14,Math.floor(n/4)),r=acf(counts,m),out=[];let phi=[];
      for(let k=1;k<=m;k++){const den=1-sum(phi.map((v,j)=>v*r[j+1]));need(Math.abs(den)>1e-10,'PACF 재귀 단계의 분모가 0입니다.');const a=(r[k]-sum(phi.map((v,j)=>v*r[k-j-1])))/den;const next=phi.map((v,j)=>v-a*phi[k-j-2]);next.push(a);phi=next;out.push(a);}
      return {summary:'중간 시차를 통제한 날짜 간 관련성을 추정합니다.',explanation:'표본 ACF에 Durbin–Levinson 재귀를 적용한 Yule–Walker PACF입니다. 짧은 자료에서 큰 시차의 값은 불안정할 수 있습니다.',metrics:[metric('7일 시차 PACF',out[6])],chart:chart('bar',out.map((_,i)=>`${i+1}일`),[series('PACF',out)]),notes:[unitNote]};});
    add(62,()=>{const m=calendar(),lag=Math.min(14,Math.floor(n/5));need(lag>=4,'Ljung–Box 검정의 날짜 수가 부족합니다.');const q=ljung(m.res,lag);return {status:'limited',summary:'달력 효과를 고려한 뒤에도 날짜 간 의존성이 남는지 점검합니다.',explanation:`달력 회귀 잔차의 1~${lag}일 자기상관을 합친 Ljung–Box Q 검정입니다. 외생 달력 회귀의 잔차에 적용하며 ARMA 차수 공제는 0입니다.`,metrics:[metric('Q 통계량',q.Q),metric('근사 p',q.p,'pvalue'),metric('자유도',lag)],chart:chart('bar',q.r.slice(1).map((_,i)=>`${i+1}일`),[series('잔차 ACF',q.r.slice(1))]),notes:['카이제곱 근사는 소표본·이분산에 민감합니다. 유의하지 않아도 독립성이 증명되는 것은 아닙니다.']};});
    add(63,()=>{const m=stl(counts);return {status:'limited',summary:'LOESS로 일별 건수를 추세·주간 반복·잔차로 분리합니다.',explanation:'비강건 STL: 주기 7, 계절 하위계열 LOESS 창 7, 7·7·3 이동평균 저역통과 후 LOESS 창 9, 추세 LOESS 창 15, 내부 반복 5회입니다. 강건 재가중은 사용하지 않았습니다.',metrics:[metric('잔차 표준편차',Math.sqrt(variance(m.residual))),metric('최근 추세',m.trend[n-1])],chart:chart('line',labels,[series('실제 건수',counts),series('추세',m.trend),series('주간 성분',m.season)]),notes:['주간 성분은 0 부근의 가감값이며 추세와 함께 해석합니다. 끝부분 추세는 특히 불확실합니다.','연간 계절성은 분석하지 않습니다.']};});
    let change;
    const breakpoint=()=>{if(change)return change;need(n>=42,'변화점 탐지에는 최소 42일이 필요합니다.');const y=weekdayAdjusted(counts),base=sum(y.map(v=>(v-mean(y))**2));need(base>0,'변화점을 구별할 변동이 없습니다.');let best={sse:Infinity};for(let k=14;k<=n-14;k++){const a=mean(y.slice(0,k)),b=mean(y.slice(k)),sse=sum(y.map((v,i)=>(v-(i<k?a:b))**2));if(sse<best.sse)best={k,a,b,sse};}return change={...best,y,reduction:1-best.sse/base};};
    add(64,()=>{const m=breakpoint();return {status:'limited',summary:`수준 변화 후보는 ${days[m.k].date}입니다.`,explanation:'요일 평균을 제거한 일별 건수에서 한 개 변화점을 전수 탐색했습니다. 양쪽에 최소 14일을 남기고 구간 내 제곱오차를 최소화했습니다.',metrics:[metric('전후 수준 차이',m.b-m.a),metric('오차 감소율',m.reduction,'percent')],chart:chart('line',labels,[series('요일 보정 건수',m.y),series('두 구간 수준',m.y.map((_,i)=>i<m.k?m.a:m.b))]),notes:['자료에서 가장 좋은 시점을 선택한 탐색 결과입니다. 변화가 통계적으로 입증되었다는 뜻이 아니며 검정 p를 제시하지 않습니다.']};});
    add(65,()=>{const bp=breakpoint(),base=design(days,false);const X=base.X.map((r,i)=>[...r,+(i>=bp.k),Math.max(0,i-bp.k)/n]),m=ols(X,counts);return {status:'limited',summary:`${days[bp.k].date} 전후의 수준과 기울기를 분절회귀로 설명합니다.`,explanation:'요일·전체 선형 추세에 전후 수준 점프와 시점 이후 기울기 항을 더한 OLS입니다. 변화점은 같은 자료에서 탐색했습니다.',metrics:[metric('수준 점프 (건)',m.beta[m.beta.length-2]),metric('이후 일별 기울기 변화',m.beta[m.beta.length-1]/n),metric('설명력 R²',m.r2)],chart:chart('line',labels,[series('실제',counts),series('분절회귀',m.fit)]),notes:['변화점 선택의 불확실성을 반영하지 못하므로 계수 유의확률과 인과효과를 보고하지 않습니다.']};});
    const monitoring=()=>{need(n>=42,'관리도에는 기준 28일과 이후 최소 14일이 필요합니다.');const base=days.slice(0,28),w=Array.from({length:7},(_,k)=>mean(base.filter(d=>d.weekday===k).map(d=>d.count))),r=counts.map((v,i)=>v-w[days[i].weekday]),sd=Math.sqrt(sum(r.slice(0,28).map(v=>v*v))/(28-7));need(sd>0,'기준 구간의 잔차 표준편차가 0입니다.');return {z:r.slice(28).map(v=>v/sd),sd};};
    add(66,()=>{const m=monitoring();let pos=0,neg=0,flags=0;const a=[],b=[];for(const z of m.z){pos=Math.max(0,pos+z-.5);neg=Math.min(0,neg+z+.5);a.push(pos);b.push(neg);if(pos>5||neg< -5)flags++;}return {status:'limited',summary:'기준 4주의 요일별 수준에서 지속적으로 벗어나는 날짜를 봅니다.',explanation:'표준화 잔차의 양측 CUSUM입니다. 기준값 k=0.5, 결정한계 h=5이며 신호 뒤 자동 초기화하지 않습니다.',metrics:[metric('한계 밖 날짜',flags),metric('관찰 날짜',m.z.length)],chart:chart('line',labels.slice(28),[series('양의 CUSUM',a),series('음의 CUSUM',b),series('상한',a.map(()=>5)),series('하한',a.map(()=>-5))]),notes:['기준 28일의 안정성을 가정합니다. 자기상관·비정규성 때문에 한계 이탈을 확정적인 이상 판정으로 보지 않습니다.']};});
    add(67,()=>{const m=monitoring();let v=0,flags=0;const vals=[],limits=[];m.z.forEach((z,i)=>{v=.2*z+.8*v;const lim=3*Math.sqrt(.2/1.8*(1-.8**(2*(i+1))));vals.push(v);limits.push(lim);if(Math.abs(v)>lim)flags++;});return {status:'limited',summary:'최근 날짜에 더 큰 가중치를 주어 수준 이동을 감시합니다.',explanation:'기준 28일의 요일 보정 표준화 잔차에 λ=0.2를 적용했습니다. 시작값 0, 시간에 따라 넓어지는 3σ 관리한계를 사용합니다.',metrics:[metric('한계 밖 날짜',flags),metric('최근 EWMA',vals[vals.length-1])],chart:chart('line',labels.slice(28),[series('EWMA',vals),series('상한',limits),series('하한',limits.map(v=>-v))]),notes:['기준 구간이 안정적이고 잔차가 독립이라는 관리도 가정은 별도 검토가 필요합니다.']};});
    for(const [id,kind] of [[68,kinds[0]],[69,kinds[1]],[70,kinds[2]],[71,kinds[3]]])add(id,()=>{const f=forecast(counts,kind),future=Array.from({length:7},(_,i)=>new Date(Date.parse(days[n-1].date+'T00:00:00Z')+864e5*(i+1)).toISOString().slice(0,10)),evaluation=n>=42?cv().find(r=>r.kind===kind):null;return {status:'limited',summary:`${kind}로 다음 7일의 거래 건수를 예측합니다.`,explanation:`${f.info}. 고정된 단순 사양이며 자동 모형 선택을 하지 않습니다.`,metrics:[...f.params,metric('다음 7일 예측 합계',sum(f.values)),...(evaluation && !evaluation.error?[metric('최근 최대 14일 1일 예측 MAE',evaluation.mae)]:[])],chart:chart('line',future.map(d=>d.slice(5)),[series('예측 건수',f.values)]),table:{headers:f.se?['날짜','예측','조건부 95% 하한','조건부 95% 상한']:['날짜','예측'],rows:future.map((d,i)=>f.se?[d,formatN(f.values[i]),formatN(f.values[i]-1.96*f.se[i]),formatN(f.values[i]+1.96*f.se[i])]:[d,formatN(f.values[i])])},notes:['현재 필터로 선택한 거래 흐름의 예측입니다. 구조 변화가 있으면 성능이 나빠집니다.',f.se?'구간은 정규 혁신오차와 추정 모수 고정을 가정합니다. 모수 불확실성을 포함하지 않으며 하한이 음수이면 건수 모형의 한계입니다.':'계절 단순예측은 점예측만 제시합니다.',...(evaluation && evaluation.error?[`교차검증 DROP: ${evaluation.error}`]:[])]};});
    add(72,()=>{const r=correlation(sales,purchases),X=design(days,false).X,adj=correlation(ols(X,sales).res,ols(X,purchases).res);return {status:'limited',summary:'일별 매출액과 매입액이 함께 움직이는 정도를 측정합니다.',explanation:'원금액의 Pearson 상관과 요일·선형 날짜 추세를 제거한 잔차 상관을 함께 보고합니다.',metrics:[metric('원금액 Pearson r',r),metric('요일·추세 보정 r',adj)],chart:{type:'scatter',labels:['일매출액','일매입액'],series:[],points:days.map(d=>({x:d.sales,y:d.purchases,label:d.date}))},notes:['극단값에 민감하며 같은 날 집계값의 연관성입니다. 수금·지급 연결이나 인과효과를 나타내지 않습니다.']};});
    add(73,()=>{const a=rank(sales),b=rank(purchases),r=correlation(a,b);return {status:'limited',summary:'일매출 순위가 높은 날짜에 일매입 순위도 높은지 봅니다.',explanation:'동점에는 평균순위를 부여한 Spearman 순위상관입니다. 선형 관계에 한정하지 않지만 비단조 관계를 요약하지는 못합니다.',metrics:[metric('Spearman ρ',r),metric('날짜 수',n)],chart:{type:'scatter',labels:['매출액 순위','매입액 순위'],series:[],points:days.map((d,i)=>({x:a[i],y:b[i],label:d.date}))},notes:['공통 요일·추세의 영향이 포함되며 탐색적 상관으로 해석합니다.']};});
    add(74,()=>{need(n>=35,'시차 상관에는 최소 35일이 필요합니다.');const X=design(days,false).X,a=ols(X,purchases).res,b=ols(X,sales).res,lags=Array.from({length:15},(_,i)=>i-7),r=lags.map(k=>k>=0?correlation(a.slice(0,n-k),b.slice(k)):correlation(a.slice(-k),b.slice(0,n+k)));const best=r.reduce((a,v,i)=>Math.abs(v)>Math.abs(r[a])?i:a,0);return {status:'limited',summary:`탐색한 시차 중 절대 상관이 가장 큰 값은 ${lags[best]}일입니다.`,explanation:'매출·매입에서 각각 요일과 선형 추세를 제거했습니다. 양의 시차 k는 k일 전 매입과 현재 매출의 잔차 상관입니다.',metrics:[metric('선택 시차',lags[best]),metric('해당 상관',r[best])],chart:chart('bar',lags.map(k=>`${k}일`),[series('보정 후 시차 상관',r)]),notes:['15개 시차를 탐색한 최대값이므로 선택 편향이 있습니다. 유의확률·인과관계·매입의 매출 전환일로 해석하지 않습니다.']};});
    add(86,()=>{need(n>=28,'7일 블록 부트스트랩에는 최소 28일이 필요합니다.');const rng=random(seed+86),rep=[];for(let b=0;b<400;b++){let amount=0,count=0,taken=0;while(taken<n){const start=Math.floor(rng()*(n-6));for(let j=0;j<7 && taken<n;j++,taken++){amount+=days[start+j].total;count+=days[start+j].count;}}if(count)rep.push(amount/count);}need(rep.length>=390,'유효한 부트스트랩 표본이 부족합니다.');const lower=quantile(rep,.025),upper=quantile(rep,.975);const min=Math.min(...rep),max=Math.max(...rep),bins=Array(16).fill(0);rep.forEach(v=>bins[Math.min(15,Math.floor((v-min)/(max-min||1)*16))]++);return {status:'limited',summary:'날짜 의존성을 일부 보존하며 거래당 평균금액의 불확실성을 추정합니다.',explanation:'연속 7일 이동 블록을 복원추출해 원래 날짜 수만큼 연결했습니다. 각 재표본에서 총액÷총건수를 구한 400회 백분위 구간입니다.',metrics:[metric('거래당 평균',sum(days.map(d=>d.total))/sum(counts),'money'),metric('95% 하한',lower,'money'),metric('95% 상한',upper,'money')],chart:chart('bar',bins.map((_,i)=>Math.round((min+(i+.5)*(max-min)/16)/10000)+'만원'),[series('재표집 횟수',bins)]),notes:['블록 길이 7·난수 시드 고정. 비정상 추세·3개월보다 긴 의존성·큰 거래에 대한 민감성은 남습니다. 원장 전체를 모집단으로 보면 이 구간은 관측 합계의 오차가 아닙니다.']};});
    add(87,()=>{const f=family(),t=f.tests[0];return {status:'limited',summary:`${t.a}와 ${t.b}의 주간 금액 차이를 블록 순열로 비교합니다.`,explanation:'시작일부터 겹치지 않는 7일 블록을 만들고 집단별 log(1+블록 총액)의 차이를 구했습니다. 블록 전체의 집단 라벨을 뒤집는 499회 부호 순열과 +1 보정으로 양측 p를 계산합니다.',metrics:[metric('블록 수',f.weeks),metric('평균 로그금액 차이',t.effect),metric('조건부 순열 p',t.p,'pvalue')],table:{headers:['집단 A','집단 B','p'],rows:f.tests.slice(0,12).map(t=>[t.a,t.b,formatN(t.p)])},notes:['집단은 거래 수 상위 순으로 선택합니다. 블록 간 독립성과 귀무가설 아래 집단 교환가능성을 가정한 탐색용입니다. 관찰자료에서 이 가정은 보장되지 않습니다.',`마지막 불완전 블록 ${f.partial}일 제외. 최저 Monte Carlo p는 0.002입니다.`]};});
    add(88,()=>{const group={};for(const r of rows){const k=r[ctx.groupBy||'department'];(group[k]||(group[k]=[])).push(r.amount);}const names=Object.keys(group).sort((a,b)=>group[b].length-group[a].length);need(names.length>=2,'효과크기 비교에는 두 집단이 필요합니다.');const a=group[names[0]],b=group[names[1]];return {summary:`${names[0]}와 ${names[1]}의 차이를 실제 원 단위로 제시합니다.`,explanation:'거래 수가 가장 많은 두 집단을 비교합니다. 평균 차이·중앙값 차이·평균 비율은 서로 다른 차이의 크기를 나타냅니다.',metrics:[metric('평균 차이 A−B',mean(a)-mean(b),'money'),metric('중앙값 차이 A−B',quantile(a,.5)-quantile(b,.5),'money'),metric('평균금액 비율 A/B',mean(a)/mean(b))],table:{headers:['집단','건수','평균금액','중앙값'],rows:names.map(k=>[k,group[k].length,Math.round(mean(group[k])),Math.round(quantile(group[k],.5))])},notes:['부서·결제수단·날짜 등 다른 조건을 보정하지 않은 기술적 차이입니다. 집단 간 인과효과가 아닙니다.']};});
    for(const [id,key,title] of [[89,'holm','Holm'],[90,'bh','Benjamini–Hochberg']])add(id,()=>{const f=family(),sig=f.tests.filter(t=>t[key]<.05).length;return {status:'limited',summary:`동일한 ${f.tests.length}개 집단 쌍 순열검정에 ${title} 보정을 적용합니다.`,explanation:`검정군은 거래 수 상위 최대 12개 ${ctx.groupBy==='payment'?'결제수단':ctx.groupBy==='type'?'거래 구분':'부서'}의 모든 쌍입니다. #87과 같은 주간 로그총액 부호 순열 p를 사용합니다. ${id===89?'오름차순 p에 남은 검정 수를 곱하고 누적 최대값을 취했습니다.':'오름차순 p에 전체 검정 수÷순위를 곱하고 역방향 누적 최소값을 취했습니다.'}`,metrics:[metric('검정 수',f.tests.length),metric('보정값 0.05 미만',sig)],table:{headers:['집단 A','집단 B','원 p',id===89?'Holm p':'BH q'],rows:f.tests.map(t=>[t.a,t.b,formatN(t.p),formatN(t[key])])},notes:['개별 순열검정의 교환가능성 가정이 먼저 충족되어야 합니다. 다른 카드의 모든 p를 한꺼번에 보정한 결과가 아닙니다.',id===89?'Holm은 유효한 원 p 아래 검정 간 의존성과 무관하게 가족단위 오류율을 통제합니다.':'BH의 독립성 또는 특정 양의 의존성 조건을 검증하지 않았으므로 FDR 통제를 보장하지 않습니다. 탐색용 보정값입니다.']};});
    add(91,()=>{need(rows.length>=20,'Q–Q 도표에는 최소 20개 거래가 필요합니다.');const vals=rows.map(r=>Math.log(r.amount));need(vals.every(Number.isFinite),'로그 변환에는 양수 금액이 필요합니다.');const m=mean(vals),sd=Math.sqrt(variance(vals));need(sd>0,'로그금액 분산이 0입니다.');const sorted=vals.sort((a,b)=>a-b),k=Math.min(200,sorted.length),points=Array.from({length:k},(_,j)=>{const i=Math.round(j*(sorted.length-1)/(k-1));return {x:normalQuantile((i+.5)/sorted.length),y:(sorted[i]-m)/sd,label:`백분위 ${((i+.5)/sorted.length*100).toFixed(1)}%`};});return {summary:'로그금액의 꼬리와 비대칭이 정규분포에서 얼마나 벗어나는지 봅니다.',explanation:'x축은 표준정규 이론 분위수, y축은 표준화한 로그금액 분위수입니다. 두 축 값이 비슷한 직선에 놓일수록 정규분포 모양에 가깝습니다.',metrics:[metric('거래 수',rows.length),metric('표시 분위점',k)],chart:{type:'scatter',labels:['정규 이론 분위수','표준화 로그금액 분위수'],series:[],points},notes:['최대 200개 분위점으로 원자료 전체의 분위수를 요약합니다. 그림만으로 정규성 또는 특정 모형의 적합성을 확정하지 않습니다.']};});
    add(92,()=>{const m=calendar(),aux=ols(m.X,m.res.map(v=>v*v)),stat=n*aux.r2;return {status:'limited',summary:'달력 조건에 따라 일별 건수 잔차의 분산이 달라지는지 진단합니다.',explanation:'제곱 잔차를 원래 달력 설명변수에 회귀한 n×R²의 Koenker–Breusch–Pagan LM 근사입니다. 거래 금액 회귀의 이분산 검정은 아닙니다.',metrics:[metric('LM 통계량',stat),metric('근사 p',chiTail(stat,m.p-1),'pvalue'),metric('자유도',m.p-1)],chart:{type:'scatter',labels:['달력모형 적합 건수','잔차 제곱'],series:[],points:m.fit.map((x,i)=>({x,y:m.res[i]**2,label:days[i].date}))},notes:['독립 관측을 가정한 점근 검정입니다. 시간 의존성이 있으면 p의 해석이 제한됩니다.']};});
    add(93,()=>{const r=calendar().res,lag=Math.min(14,Math.floor(n/5));need(lag>=7,'자기상관 진단에 날짜가 부족합니다.');const q=ljung(r,lag),dw=sum(r.slice(1).map((v,i)=>(v-r[i])**2))/sum(r.map(v=>v*v));return {status:'limited',summary:'잔차의 1일·7일 관련성과 전체 자기상관을 함께 확인합니다.',explanation:'달력 건수 회귀의 잔차에 ACF·Durbin–Watson·Ljung–Box를 적용했습니다. #62와 같은 잔차를 다른 진단 관점에서 요약합니다.',metrics:[metric('Durbin–Watson',dw),metric('잔차 7일 ACF',q.r[7]),metric('Ljung–Box 근사 p',q.p,'pvalue')],chart:chart('line',labels,[series('달력 회귀 잔차',r)]),notes:['독립성의 증명이 아닙니다. 반복되는 날짜 패턴은 건수 회귀·신뢰구간의 상관 구조에 반영할 필요가 있습니다.']};});
    add(94,()=>{need(n>=21,'과산포 진단에는 최소 21일이 필요합니다.');const weekday=[...new Set(days.map(d=>d.weekday))],mu=days.map(d=>mean(days.filter(x=>x.weekday===d.weekday).map(x=>x.count)));need(mu.every(v=>v>0),'일부 요일의 기대 건수가 0이어서 과산포를 계산할 수 없습니다.');const chi=sum(counts.map((v,i)=>(v-mu[i])**2/mu[i])),df=n-weekday.length;return {status:'limited',summary:'요일을 고려한 Poisson 건수 모형에서 남은 과산포를 봅니다.',explanation:'요일별로 일정한 로그평균을 갖는 Poisson 모형의 MLE는 각 요일 표본평균입니다. Pearson 잔차 제곱합을 잔차 자유도로 나눈 산포비를 계산했습니다.',metrics:[metric('Pearson 산포비',chi/df),metric('Pearson χ²',chi),metric('근사 상측 p',chiTail(chi,df),'pvalue')],chart:chart('line',labels,[series('실제 거래 건수',counts),series('요일 Poisson 기대 건수',mu)]),notes:['산포비가 1보다 크면 요일만으로 설명되지 않은 변동을 뜻합니다. 누락된 월·추세·날짜 의존성도 원인이 될 수 있어 음이항 모형의 정답 판정이 아닙니다.']};});
    add(95,()=>{const results=cv(),valid=results.filter(r=>!r.error);need(valid.length>0,'모든 후보 모형의 시간 교차검증이 실패했습니다.');return {status:valid.length===results.length?'ok':'limited',summary:'과거 자료만 학습해 최근 최대 14일의 다음 날 거래 건수를 비교합니다.',explanation:'확장 학습창으로 하루씩 전진합니다. 각 예측 시점마다 ETS 계수·AR 계수 등을 그 이전 관측만으로 다시 추정했습니다. MAE와 RMSE가 작을수록 검증기간 성능이 좋습니다.',metrics:[metric('검증 날짜',valid[0].n),metric('평가 모형',valid.length)],chart:chart('bar',valid.map(r=>r.kind),[series('MAE (건)',valid.map(r=>r.mae)),series('RMSE (건)',valid.map(r=>r.rmse))]),table:{headers:['모형','MAE','RMSE','상태'],rows:results.map(r=>r.error?[r.kind,'—','—',`DROP: ${r.error}`]:[r.kind,formatN(r.mae),formatN(r.rmse),'평가 완료'])},notes:['4개 사양을 같은 날짜에서 비교합니다. 이 기간에서 가장 좋은 모형이 앞으로도 가장 좋다는 보장은 없습니다. 전처리나 모형 선택에 미래 자료를 쓰지 않았습니다.']};});
    add(96,()=>{need(rows.length>=20,'민감도 분석에는 최소 20개 거래가 필요합니다.');const v=rows.map(r=>r.amount),q=quantile(v,.99),trim=v.filter(x=>x<=q),cap=v.map(x=>Math.min(x,q)),variants=[['원본 전체',v],['상위 1% 경계로 절단',cap],['99분위 초과 제외',trim]];return {summary:'큰 거래를 다르게 처리했을 때 평균금액이 얼마나 바뀌는지 비교합니다.',explanation:'전체 거래를 유지한 결과를 기준으로 99분위 초과 금액을 경계값으로 바꾸는 윈저화와 해당 거래 제외 결과를 병기합니다. 원본 파일은 수정하지 않습니다.',metrics:[metric('99분위 경계',q,'money'),metric('제외 시 평균 변화율',mean(trim)/mean(v)-1,'percent')],chart:chart('bar',variants.map(x=>x[0]),[series('평균금액',variants.map(x=>mean(x[1]))),series('중앙값',variants.map(x=>quantile(x[1],.5)))]),table:{headers:['조건','건수','평균금액','중앙값','총액'],rows:variants.map(([name,a])=>[name,a.length,Math.round(mean(a)),Math.round(quantile(a,.5)),Math.round(sum(a))])},notes:['큰 거래를 오류로 판정한 것이 아닙니다. 제외·윈저화는 추정 대상을 바꾸므로 원본 분석을 대신하지 않습니다.']};});
    return cards;
  };
})();
