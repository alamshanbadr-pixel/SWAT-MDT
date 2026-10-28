import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import{getFirestore,collection,doc,addDoc,setDoc,updateDoc,deleteDoc,onSnapshot,query,orderBy,limit,where}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===== الإعدادات: الصق بيانات Firebase هنا ===== */
const firebaseConfig={apiKey:"",authDomain:"",projectId:"",appId:""};
/* رابط وسيط للذكاء الاصطناعي (يستقبل {prompt} ويرجع {text}). اتركه فارغاً لتعطيل المساعد */
const AI_URL="";
/* ============================================== */

const R=['جندي','جندي أول','عريف','رقيب','رقيب أول','ملازم','نقيب','وكيل الشؤون','مسؤول الشؤون','قيادي','نائب القائد','القائد'];
const LEAD=['قيادي','نائب القائد','القائد'],AFF=['وكيل الشؤون','مسؤول الشؤون'];
const DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>t?new Date(t).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'}):'';
const ls={g(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},s(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

let auth,db,uid=null,authReady=false,mode='login',err='',ready={},T=null,hl=null,noKeep=false,busy=false,chat=[],lastAff=null,draft=null,draftShown=false;
let tab=ls.g('swat_tab','home');
let S={members:[],complaints:[],logs:[],orders:[],sched:{}};
const unsub={};
const meRec=()=>S.members.find(m=>m.id===uid);
const myName=()=>(meRec()||{}).name||'';
const rank=()=>(meRec()||{}).rank||'جندي';
const isLead=()=>LEAD.includes(rank());
const isAff=()=>isLead()||AFF.includes(rank());
const list=s=>s.docs.map(d=>({id:d.id,...d.data()}));

function notify(text,t,id){
  T={text,t,id};render();clearTimeout(notify.h);notify.h=setTimeout(()=>{T=null;render()},9000);
  try{navigator.vibrate&&navigator.vibrate(200)}catch(e){}
}
async function w(fn){try{await fn();return true}catch(e){notify('تعذر الحفظ: '+(e&&e.code==='permission-denied'?'ما عندك صلاحية':(e&&(e.message||e.code))||'خطأ'));return false}}
const addLog=(t,d,by)=>w(()=>addDoc(collection(db,'logs'),{t,d,by:by||myName()||'-',ts:Date.now()}));
function go(t,id){tab=t;ls.s('swat_tab',t);if(id){hl=id;setTimeout(()=>{hl=null;render()},8000)}T=null;render();if(id)setTimeout(()=>{const e=document.querySelector('.hl');e&&e.scrollIntoView({block:'center'})},50)}
function stopAll(){Object.values(unsub).forEach(f=>f&&f());Object.keys(unsub).forEach(k=>delete unsub[k]);lastAff=null}
const fail=e=>{err='خطأ مزامنة: '+(e.code||e.message);render()};

function init(){
  if(!firebaseConfig.apiKey){err='لازم تلصق إعدادات Firebase في أول ملف script.js';render();return}
  const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,a=>{
    stopAll();uid=a?a.uid:null;authReady=true;ready={};S={members:[],complaints:[],logs:[],orders:[],sched:{}};
    if(a){draft=ls.g('swat_draft_'+uid,null);draftShown=false;start()}
    render();
  });
  render();
}
function start(){
  unsub.m=onSnapshot(collection(db,'members'),snap=>{
    const first=!ready.members;ready.members=1;S.members=list(snap);
    if(!first)snap.docChanges().forEach(c=>{if(c.type==='modified'&&c.doc.id===uid)notify('تم تحديث رتبتك: '+c.doc.data().rank)});
    if(lastAff!==isAff())subComplaints();
    render();
  },fail);
  let fl=true;
  unsub.l=onSnapshot(query(collection(db,'logs'),orderBy('ts','desc'),limit(100)),s=>{S.logs=list(s);render()},fail);
  unsub.o=onSnapshot(query(collection(db,'orders'),orderBy('ts','desc'),limit(50)),s=>{
    S.orders=list(s);
    if(!fl)s.docChanges().forEach(c=>{const d=c.doc.data();if(c.type==='added'&&d.byId!==uid){go('orders',c.doc.id);notify('🚨 أمر جديد: '+d.title,'orders',c.doc.id)}});
    fl=false;render();
  },fail);
  unsub.s=onSnapshot(doc(db,'cfg','schedule'),s=>{S.sched=s.exists()?s.data():{};render()},()=>{});
}
function subComplaints(){
  unsub.c&&unsub.c();lastAff=isAff();
  const q=lastAff?query(collection(db,'complaints'),orderBy('ts','desc'),limit(200)):query(collection(db,'complaints'),where('byId','==',uid));
  let first=true;
  unsub.c=onSnapshot(q,s=>{
    S.complaints=list(s).sort((a,b)=>b.ts-a.ts);
    if(!first)s.docChanges().forEach(c=>{const d=c.doc.data();
      if(c.type==='added'&&d.byId!==uid&&isAff())notify('شكوى جديدة ضد '+d.against,'complaints');
      if(c.type==='modified'&&d.byId===uid)notify('تحديث على شكواك: '+d.status,'complaints')});
    first=false;render();
  },e=>notify('تعذر تحميل الشكاوى: '+(e.code||'')));
}

const authMsg=c=>({'auth/email-already-in-use':'هذا البريد مسجل من قبل','auth/weak-password':'كلمة المرور ضعيفة (6 أحرف على الأقل)','auth/invalid-email':'البريد غير صحيح','auth/invalid-credential':'بيانات الدخول غير صحيحة','auth/wrong-password':'بيانات الدخول غير صحيحة','auth/user-not-found':'بيانات الدخول غير صحيحة'}[c]||('خطأ: '+c));
async function authGo(){
  const e=$('le').value.trim(),p=$('lp').value,n=mode==='reg'?$('ln').value.trim():'';
  if(!e||!p||(mode==='reg'&&!n))return alert('عبّ كل الحقول');
  try{
    if(mode==='reg'){const c=await createUserWithEmailAndPassword(auth,e,p);await setDoc(doc(db,'members',c.user.uid),{name:n,rank:'جندي',ts:Date.now()});addLog('دخول','تسجيل عضو جديد: '+n,n)}
    else await signInWithEmailAndPassword(auth,e,p);
  }catch(x){alert(authMsg(x.code))}
}
function draftSave(){draft={against:$('ca').value,type:$('ct').value,details:$('cd').value,ts:Date.now()};ls.s('swat_draft_'+uid,draft);const s=$('ds');if(s)s.textContent='تم حفظ المسودة تلقائياً '+fmt(draft.ts)}
async function sendComplaint(){
  const a=$('ca').value.trim(),d=$('cd').value.trim();if(!a||!d)return alert('عبّ كل الحقول');
  const ok=await w(()=>addDoc(collection(db,'complaints'),{byId:uid,by:myName(),against:a,type:$('ct').value,details:d,ts:Date.now(),status:'بانتظار مسؤول الشؤون',to:'مسؤول الشؤون + وكيل الشؤون'}));
  if(!ok)return;draft=null;ls.s('swat_draft_'+uid,null);noKeep=true;addLog('شكوى','شكوى جديدة ضد '+a);notify('تم إرسال الشكوى لمسؤول ووكيل الشؤون');
}
async function setStatus(id,st){const c=S.complaints.find(c=>c.id===id);if(await w(()=>updateDoc(doc(db,'complaints',id),{status:st,to:st==='محالة للقيادة'?'القيادة':c.to})))addLog('شكوى','شكوى ضد '+c.against+': '+st)}
async function delComplaint(id){if(confirm('حذف الشكوى؟')&&await w(()=>deleteDoc(doc(db,'complaints',id))))addLog('حذف','حذف شكوى')}
async function setRank(card,id){
  const m=S.members.find(m=>m.id===id),nr=card.querySelector('select').value,why=card.querySelector('input').value.trim();
  if(nr===m.rank)return alert('الرتبة نفسها');if(!why)return alert('اكتب السبب');
  const t=R.indexOf(nr)>R.indexOf(m.rank)?'ترقية':'تنزيل';
  if(await w(()=>updateDoc(doc(db,'members',id),{rank:nr})))addLog(t,m.name+': '+m.rank+' ← '+nr+' ('+why+')');
}
async function delMember(id){const m=S.members.find(m=>m.id===id);if(confirm('حذف العضو؟')&&await w(()=>deleteDoc(doc(db,'members',id))))addLog('فصل','حذف '+m.name)}
async function issueOrder(){
  const title=$('oh').value.trim(),text=$('ot').value.trim();if(!title||!text)return alert('اكتب عنوان ونص الأمر');
  if(await w(()=>addDoc(collection(db,'orders'),{title,text,prio:$('op').value,by:myName(),byId:uid,ts:Date.now()}))){noKeep=true;addLog('أمر','أمر جديد: '+title);render()}
}
const ack=id=>w(()=>updateDoc(doc(db,'orders',id),{['ack_'+uid]:{n:myName(),t:Date.now()}}));
const delOrder=id=>{if(confirm('حذف الأمر؟'))w(()=>deleteDoc(doc(db,'orders',id)))};
let sh;function schedSave(el){clearTimeout(sh);const d=el.dataset.d,v=el.value;sh=setTimeout(()=>w(()=>setDoc(doc(db,'cfg','schedule'),{[d]:v},{merge:true})),500)}
async function clearLogs(){if(!confirm('مسح كل السجلات؟'))return;w(async()=>{for(const l of S.logs)await deleteDoc(doc(db,'logs',l.id))})}

async function ask(){
  const q=$('aq').value.trim();if(!q||busy)return;
  chat.push({role:'user',content:q});chat.push({role:'assistant',content:'...'});busy=true;noKeep=true;render();
  try{
    const sys='أنت مساعد ذكاء اصطناعي داخل نظام MDT لقطاع SWAT في لعبة واقع حياة (رول بلاي). أجب بالعربية بأسلوب رسمي ومختصر ومهني. ساعد في صياغة الشكاوى والتقارير والبلاغات والإجراءات والأوامر. المستخدم: '+myName()+' الرتبة: '+rank()+'.\n\nالمحادثة:\n';
    const hist=chat.slice(0,-1).map(m=>(m.role==='user'?'المستخدم: ':'المساعد: ')+m.content).join('\n');
    const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:sys+hist})});
    chat[chat.length-1].content=(await r.json()).text||'لا يوجد رد';
  }catch(e){chat[chat.length-1].content='⚠ تعذر الرد'}
  busy=false;render();
}
const chatHtml=()=>chat.map(m=>'<div class="msg '+(m.role==='user'?'u':'a')+'">'+esc(m.content)+'</div>').join('')||'<span class="dim">&gt; اسأل المساعد: صياغة شكوى، تقرير عملية، إجراءات...</span>';
const logList=n=>S.logs.slice(0,n).map(l=>'<div>&gt; <span class="tag">'+esc(l.t)+'</span> '+esc(l.d)+' <span class="dim">— '+esc(l.by)+' | '+fmt(l.ts)+'</span></div>').join('')||'<div class="dim">لا توجد أحداث</div>';
const B=(a,t,x='',cls='')=>'<button class="'+cls+'" data-a="'+a+'" '+x+'>'+t+'</button>';
const opts=(arr,sel)=>arr.map(r=>'<option'+(r===sel?' selected':'')+'>'+r+'</option>').join('');

function orderCard(o){
  const acks=Object.keys(o).filter(k=>k.startsWith('ack_')).map(k=>o[k]);
  return '<div class="card'+(hl===o.id?' hl':'')+(o.prio==='عاجل'?' urgent':'')+'"><span class="tag'+(o.prio==='عاجل'?' er':'')+'">'+esc(o.prio)+'</span> <b>'+esc(o.title)+'</b><div>'+esc(o.text)+'</div><div class="dim">'+esc(o.by)+' | '+fmt(o.ts)+'</div>'+
  '<div class="dim">استلم ('+acks.length+'): '+esc(acks.map(a=>a.n).join('، '))+'</div><div class="row">'+(o['ack_'+uid]?'<span class="ok">✔ تم الاستلام</span>':B('ack','استلمت','data-id="'+esc(o.id)+'"'))+(isLead()?B('delo','حذف','data-id="'+esc(o.id)+'"','er'):'')+'</div></div>';
}
function view(){
  if(tab==='home'){
    const last=S.orders[0];
    return '<div class="card">&gt; مرحباً '+esc(myName())+'<br><span class="dim">الرتبة: '+esc(rank())+' | الأعضاء: '+S.members.length+' | الشكاوى: '+S.complaints.length+'</span></div>'+(last?'<div class="card"><b>آخر أمر</b></div>'+orderCard(last):'')+'<div class="card"><b>آخر الأحداث</b>'+logList(6)+'</div>';
  }
  if(tab==='orders'){
    let h='';
    if(isLead())h+='<div class="card"><b>إصدار أمر (يصل للجميع فوراً)</b><input id="oh" placeholder="عنوان الأمر"><textarea id="ot" placeholder="نص الأمر..."></textarea><select id="op"><option>عادي</option><option>عاجل</option></select>'+B('order','إصدار الأمر')+'</div>';
    return h+(S.orders.map(orderCard).join('')||'<div class="card dim">لا توجد أوامر</div>');
  }
  if(tab==='complaints'){
    const d=draft,restore=d&&!draftShown;draftShown=true;
    const h='<div class="card"><b>تقديم شكوى</b>'+(restore?'<div class="note">تم استرجاع مسودتك المحفوظة ('+fmt(d.ts)+')</div>':'')+
    '<input id="ca" placeholder="الشكوى ضد (اسم / رقم)" value="'+esc(d?d.against:'')+'" data-i="draft">'+
    '<select id="ct" data-i="draft">'+opts(['سوء سلوك','تجاوز صلاحيات','غياب','أخرى'],d&&d.type)+'</select>'+
    '<textarea id="cd" placeholder="تفاصيل الشكوى..." data-i="draft">'+esc(d?d.details:'')+'</textarea>'+
    '<div id="ds" class="dim" style="font-size:12px;margin-bottom:6px">'+(d?'مسودة محفوظة':'')+'</div>'+B('send','إرسال لمسؤول ووكيل الشؤون')+'</div>';
    return h+'<div class="card"><b>'+(isAff()?'صندوق الشؤون':'شكاواي')+'</b></div>'+(S.complaints.map(c=>'<div class="card"><span class="tag">'+esc(c.status)+'</span> '+esc(c.type)+'<br>ضد: '+esc(c.against)+' | من: '+esc(c.by)+'<br><span class="dim">'+fmt(c.ts)+' ← '+esc(c.to)+'</span><div>'+esc(c.details)+'</div>'+
      (isAff()?'<div class="row">'+['قيد المراجعة','مقبولة','مرفوضة','محالة للقيادة'].map(s=>B('st',s,'data-id="'+esc(c.id)+'" data-s="'+s+'"')).join('')+'</div>':'')+'</div>').join('')||'<div class="card dim">لا توجد شكاوى</div>');
  }
  if(tab==='logs')return '<div class="card"><b>سجلات الأحداث</b>'+logList(100)+'</div>';
  if(tab==='ranks')return '<div class="card"><b>الأعضاء والرتب</b><div class="dim">العضو الجديد يسجل برتبة جندي والقيادة تعطيه رتبته</div></div>'+S.members.map((m,i)=>'<div class="card">'+esc(m.name)+' <span class="tag">'+esc(m.rank)+'</span>'+(isLead()?'<select id="rk'+i+'">'+opts(R,m.rank)+'</select><input id="rs'+i+'" placeholder="السبب"><div class="row">'+B('rank','تنفيذ ترقية / تنزيل / تعيين','data-id="'+esc(m.id)+'"')+B('delm','حذف','data-id="'+esc(m.id)+'"','er')+'</div>':'')+'</div>').join('');
  if(tab==='sched'){
    const td=new Date().getDay();
    return '<div class="card"><b>الجدول الأسبوعي</b></div>'+DAYS.map((d,i)=>'<div class="card day'+(i===td?' today':'')+'"><b>'+d+'</b>'+(isLead()?'<input id="sc'+i+'" data-i="sch" data-d="'+d+'" value="'+esc(S.sched[d]||'')+'" placeholder="المهمة / الوقت" style="margin:0">':'<span>'+esc(S.sched[d]||'—')+'</span>')+'</div>').join('');
  }
  if(tab==='ai'){
    if(!AI_URL)return '<div class="card dim">المساعد الذكي غير مفعل: حط رابط AI_URL في script.js</div>';
    return '<div class="card"><b>المساعد الذكي</b><div id="chat" style="max-height:50vh;overflow:auto">'+chatHtml()+'</div><input id="aq" placeholder="اكتب سؤالك..." data-i="aq">'+B('ask','إرسال',busy?'disabled':'')+'</div>';
  }
  if(tab==='lead'){
    if(!isLead())return '<div class="card lock">🔒 MDT القيادة — للرتب القيادية فقط</div>';
    return '<div class="card"><b>MDT القيادة (صلاحيات كاملة)</b><br><span class="dim">أعضاء: '+S.members.length+' | شكاوى: '+S.complaints.length+' | محالة للقيادة: '+S.complaints.filter(c=>c.to==='القيادة').length+' | أوامر: '+S.orders.length+'</span></div>'+
    '<div class="card"><b>كل الشكاوى</b></div>'+(S.complaints.map(c=>'<div class="card"><span class="tag">'+esc(c.status)+'</span> ضد '+esc(c.against)+' من '+esc(c.by)+'<div>'+esc(c.details)+'</div><div class="row">'+B('st','قبول','data-id="'+esc(c.id)+'" data-s="مقبولة"')+B('st','رفض','data-id="'+esc(c.id)+'" data-s="مرفوضة"')+B('delc','حذف','data-id="'+esc(c.id)+'"','er')+'</div></div>').join('')||'<div class="card dim">لا يوجد</div>')+
    '<div class="card">'+B('clearlogs','مسح السجلات','','er')+'</div>';
  }
  return '';
}
function render(){
  const a=$('app');
  const keep=noKeep?[]:[...a.querySelectorAll('input[id],textarea[id],select[id]')].map(e=>({id:e.id,v:e.value,f:document.activeElement===e,s:e.selectionStart,e:e.selectionEnd}));noKeep=false;
  let h;
  if(err)h='<main><div class="card er">'+esc(err)+'</div></main>';
  else if(!authReady)h='<main><div class="card dim">&gt; جاري الاتصال...</div></main>';
  else if(!uid)h='<main><div class="card"><h1>&gt; SWAT MDT — '+(mode==='reg'?'تسجيل جديد':'تسجيل الدخول')+'</h1><br>'+(mode==='reg'?'<input id="ln" placeholder="الاسم">':'')+'<input id="le" type="email" placeholder="البريد الإلكتروني" dir="ltr"><input id="lp" type="password" placeholder="كلمة المرور" dir="ltr">'+B('auth',mode==='reg'?'تسجيل':'دخول')+'<br><br><a href="#" data-a="mode">'+(mode==='reg'?'عندي حساب؟ دخول':'عضو جديد؟ سجّل')+'</a></div></main>';
  else if(!ready.members)h='<main><div class="card dim">&gt; جاري الاتصال...</div></main>';
  else if(!meRec())h='<main><div class="card dim">&gt; جاري تجهيز الحساب... (لو طولت يمكن انحذف حسابك) <a href="#" data-a="logout">خروج</a></div></main>';
  else{
    const tabs=[['home','الرئيسية'],['orders','الأوامر'],['complaints','الشكاوى'],['logs','السجلات'],['ranks','الرتب'],['sched','الجدول'],['ai','الذكاء الاصطناعي']];
    if(isLead())tabs.push(['lead','MDT القيادة']);
    h='<header><h1>SWAT MDT</h1><div class="prof"><div class="av">'+esc(myName().charAt(0))+'</div><div>'+esc(myName())+'<small>'+esc(rank())+' · <a href="#" data-a="logout">خروج</a></small></div></div></header><nav>'+tabs.map(x=>'<button class="'+(tab===x[0]?'on':'')+'" data-a="tab" data-t="'+x[0]+'">'+x[1]+'</button>').join('')+'</nav><main>'+view()+'</main>';
  }
  if(T)h+='<div class="toast" data-a="toast"><span>'+esc(T.text)+'</span>'+(T.t?'<b>عرض ←</b>':'')+'</div>';
  a.innerHTML=h;
  keep.forEach(k=>{const e=$(k.id);if(!e)return;e.value=k.v;if(k.f){e.focus();try{e.setSelectionRange(k.s,k.e)}catch(x){}}});
  const c=$('chat');if(c)c.scrollTop=c.scrollHeight;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;e.preventDefault();
  const a=b.dataset.a,id=b.dataset.id;
  if(a==='tab')go(b.dataset.t);else if(a==='auth')authGo();else if(a==='mode'){mode=mode==='reg'?'login':'reg';noKeep=true;render()}
  else if(a==='logout')signOut(auth);
  else if(a==='send')sendComplaint();else if(a==='st')setStatus(id,b.dataset.s);else if(a==='delc')delComplaint(id);
  else if(a==='rank')setRank(b.closest('.card'),id);else if(a==='delm')delMember(id);
  else if(a==='order')issueOrder();else if(a==='ack')ack(id);else if(a==='delo')delOrder(id);
  else if(a==='ask')ask();else if(a==='clearlogs')clearLogs();
  else if(a==='toast'){if(T&&T.t)go(T.t,T.id);else{T=null;render()}}
});
document.addEventListener('input',e=>{const i=e.target.dataset&&e.target.dataset.i;if(i==='draft')draftSave();else if(i==='sch')schedSave(e.target)});
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.i==='draft')draftSave()});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.i==='aq')ask()});
init();
