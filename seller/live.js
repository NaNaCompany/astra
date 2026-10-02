/* Local practice events only: no external orders, messages, or mail are sent. */
var SellerLive = (function(){
  var inquiryMs = 15000, orderMs = 1000, ordersPerTick = 3, timer = null, busy = false;
  var initialStocks = {};
  PRODUCTS.forEach(function(p){ initialStocks[p.sku] = p.stock; });
  var initialOrders = ORDERS.slice();

  function getState(){
    var data = Store.get('live', null);
    if(!data) return {
      version:3,
      stocks:Object.assign({}, initialStocks), seedOrders:initialOrders.slice(),
      orders:[], events:[], sequence:0, nextInquiryAt:0, nextOrderAt:0
    };
    // Rebase opening stock once while preserving saved orders and stock already consumed.
    if((data.version || 1)<3){
      var stockAdjustment=(data.version || 1)<2?1500:-2500;
      data.stocks=data.stocks || {};
      PRODUCTS.forEach(function(p){
        var previous=data.stocks[p.sku];
        data.stocks[p.sku]=Number.isFinite(previous)?Math.max(0,previous+stockAdjustment):initialStocks[p.sku];
      });
      data.version=3;
      data.nextInquiryAt=Date.now()+inquiryMs;
      data.nextOrderAt=Date.now()+orderMs;
      Store.set('live',data);
    }
    return data;
  }
  function sync(data){
    data = data || getState();
    PRODUCTS.forEach(function(p){ p.stock = data.stocks[p.sku]; });
    ORDERS = data.orders.concat(data.seedOrders);
  }
  function locked(fn){
    if(navigator.locks && navigator.locks.request){
      return navigator.locks.request('nanashop-live-update', fn);
    }
    return Promise.resolve().then(fn);
  }
  function addInquiry(){
    var list=getInq(), cursor=Store.get('inqCursor',0);
    var source=INQ_QUEUE[cursor % INQ_QUEUE.length];
    var id=list.reduce(function(max,q){return Math.max(max,q.id);},0)+1;
    list.unshift({id:id,type:source.t,cust:source.c,q:source.q,at:ymdhm(new Date()),state:'미답변',answer:null});
    Store.set('inqCursor',cursor+1); Store.set('inq',list);
    return id;
  }
  function addOrder(data, now){
    var available=PRODUCTS.filter(function(p){return data.stocks[p.sku]>0;});
    if(!available.length) return null;
    var seq=data.sequence, p=available[seq % available.length];
    var before=data.stocks[p.sku], qty=Math.min(before,1+(seq % 3));
    var no='LIVE-'+ymd(new Date(now)).replace(/-/g,'')+'-'+String(seq+1).padStart(6,'0');
    data.sequence=seq+1; data.stocks[p.sku]=before-qty;
    data.orders.unshift({no:no,at:ymdhm(new Date(now)),day:ymd(new Date(now)),cust:ORDER_SEED[seq % ORDER_SEED.length].c,
      sku:p.sku,name:p.name,qty:qty,amount:p.price*qty,state:'결제완료'});
    var event={no:no,sku:p.sku,name:p.name,qty:qty,before:before,after:before-qty,at:now};
    data.events.unshift(event); data.events=data.events.slice(0,8);
    return event;
  }
  function updateClock(){
    var data=getState(), now=Date.now();
    [['liveInquiryCountdown',data.nextInquiryAt],['liveOrderCountdown',data.nextOrderAt]].forEach(function(pair){
      var el=document.getElementById(pair[0]);
      if(el) el.textContent=Math.max(0,Math.ceil((pair[1]-now)/1000))+'초';
    });
  }
  function tick(){
    if(busy || document.hidden || !Store.get('session',null)) return;
    busy=true;
    locked(function(){
      if(document.hidden || !Store.get('session',null)) return;
      var data=getState(), now=Date.now(), inquiryId=null, order=null, changed=false;
      if(now>=data.nextInquiryAt){inquiryId=addInquiry(); data.nextInquiryAt=now+inquiryMs;changed=true;}
      if(now>=data.nextOrderAt){
        for(var i=0;i<ordersPerTick;i++){
          var added=addOrder(data,now);
          if(!added)break;
          order=added;
        }
        // Stay on the one-second cadence without replaying missed batches.
        data.nextOrderAt=now+orderMs-((now-data.nextOrderAt)%orderMs);
        changed=true;
      }
      if(changed){
        Store.set('live',data); sync(data);
      }
      if(inquiryId) refreshInquiries(inquiryId);
      if(order) refreshTradingView();
      if(inquiryId || order) updateBadges();
      updateClock();
    }).catch(function(error){console.error('Practice event failed',error);})
      .finally(function(){busy=false;});
  }
  function start(){
    if(timer!==null || !Store.get('session',null) || document.hidden) return;
    locked(function(){
      if(!Store.get('session',null)) return;
      var data=getState(), now=Date.now();
      // Resume from now; never replay a burst of events accumulated while away.
      if(!data.nextInquiryAt || data.nextInquiryAt<=now) data.nextInquiryAt=now+inquiryMs;
      if(!data.nextOrderAt || data.nextOrderAt<=now || data.nextOrderAt>now+orderMs) data.nextOrderAt=now+orderMs;
      Store.set('live',data); sync(data); updateClock();
    });
    timer=setInterval(tick,250);
  }
  function stop(){if(timer!==null)clearInterval(timer);timer=null;}
  function newInquiry(){
    return locked(function(){
      if(!Store.get('session',null))return;
      var id=addInquiry(), data=getState(); data.nextInquiryAt=Date.now()+inquiryMs;
      Store.set('live',data); refreshInquiries(id); updateBadges(); updateClock();
      toast('새 문의가 1건 도착했습니다.');
    });
  }
  function reply(id,text){
    return locked(function(){
      if(!Store.get('session',null)) return false;
      var list=getInq(), index=list.findIndex(function(q){return q.id===id;});
      if(index<0 || list[index].state==='답변완료')return false;
      var q=list.splice(index,1)[0]; q.answer=text; q.state='답변완료'; q.answeredAt=Date.now();
      list.push(q); Store.set('inq',list);
      pushSent({at:ymdhm(new Date()),kind:'문의 답변',to:q.cust+' 고객님',summary:text});
      refreshInquiries(); updateBadges(); toast('답변을 발송했습니다.');
      return true;
    });
  }
  function reset(){stop();sync({stocks:initialStocks,orders:[],seedOrders:initialOrders});}
  document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else start();});
  window.addEventListener('storage',function(event){
    if(event.key && event.key.indexOf('nanashop_')!==0)return;
    MEM={};
    if(!Store.get('session',null)){stop();sync();show('loginView');return;}
    sync();
    if(event.key===Store.key('inq')) refreshInquiries();
    if(event.key===Store.key('live')) refreshTradingView();
    updateBadges(); updateClock();
  });
  return {inquiryMs:inquiryMs,orderMs:orderMs,ordersPerTick:ordersPerTick,getState:getState,sync:sync,start:start,stop:stop,
    newInquiry:newInquiry,reply:reply,reset:reset,updateClock:updateClock};
}());
