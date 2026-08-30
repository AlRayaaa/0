const baseCfg=window.AL_RAYA_CONFIG||{};
const savedCfg=(()=>{try{return JSON.parse(localStorage.getItem("alraya_supabase_config")||"{}")}catch{return {}}})();
const cfg={...baseCfg,...savedCfg};
const hasCloud=!!(window.supabase&&cfg.supabaseUrl&&cfg.supabaseAnonKey&&!cfg.supabaseUrl.includes("YOUR-")&&!cfg.supabaseUrl.includes("xxxxx")&&!cfg.supabaseAnonKey.includes("YOUR_")&&cfg.supabaseAnonKey.length>20);
const sb=hasCloud?window.supabase.createClient(cfg.supabaseUrl.trim(),cfg.supabaseAnonKey.trim(),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:"alraya-auth",flowType:"pkce"}}):null;
const K="alraya_local_cache";
let db={products:[],sales:[],purchases:[],notes:[],shortages:[],debts:[],mixes:[],activity:[],theme:localStorage.getItem(K+"_theme")||"light"},user=null,authMode="login",selectedMixId="";
let shortagesCloudAvailable=null, mixesCloudAvailable=null, authLoading=false, authListenerReady=false;
const $=x=>document.getElementById(x),money=n=>Number(n||0).toLocaleString("en-US"),uid=()=>crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nameOf=()=>user?.user_metadata?.display_name||user?.email?.split("@")[0]||"مستخدم";
function toast(t){$("toast").textContent=t;$("toast").style.display="block";clearTimeout(window.__toast);window.__toast=setTimeout(()=>$("toast").style.display="none",2200)}
function placeholder(){return"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='100%' height='100%' fill='#eceff2'/><text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle' font-size='32' fill='#777'>لا توجد صورة</text></svg>")}
function productImg(p){return p?.photo||placeholder()}
function normalize(p){return {...p,aliases:Array.isArray(p.aliases)?p.aliases:[]}}
function cache(){localStorage.setItem(K,JSON.stringify(db))}
function cloudError(e){console.error(e);let m=e?.message||e?.error_description||"تحقق من إعداد Supabase";if(/invalid login credentials/i.test(m))m="البريد أو كلمة المرور غير صحيحة";if(/email not confirmed/i.test(m))m="الحساب موجود لكن البريد الإلكتروني غير مؤكد";if(/row-level security|permission denied/i.test(m))m="صلاحيات قاعدة البيانات غير مكتملة — شغّل ملف supabase-setup.sql كاملاً";if(/Could not find the table .?public\.debts|relation .?public\.debts|schema cache/i.test(m)&&/debts/i.test(m))m="جدول الديون غير موجود في Supabase. شغّل ملف supabase-fix-debts.sql من SQL Editor ثم حدّث الصفحة.";if(/Could not find the table .?public\.mixes|relation .?public\.mixes|mixes.*schema cache/i.test(m))m="جدول خلطات العطور (mixes) غير موجود أو لم يتم تحديثه. شغّل supabase-update-v13-mixes.sql ثم حدّث الصفحة.";if(/Could not find the table .?public\.mix_items|relation .?public\.mix_items|mix_items.*schema cache/i.test(m))m="جدول مكونات الخلطات (mix_items) غير موجود أو لم يتم تحديثه. شغّل supabase-update-v13-mixes.sql ثم حدّث الصفحة.";if(/Could not find the function .*save_mixture|function .*save_mixture.*does not exist/i.test(m))m="دالة حفظ خلطات العطور (save_mixture) غير موجودة. شغّل supabase-update-v13-mixes.sql ثم حدّث الصفحة.";if(/column .*gender.*does not exist/i.test(m)&&/mix/i.test(m))m="عمود نوع الخلطة (gender) غير موجود في جدول mixes. شغّل supabase-update-v13-mixes.sql.";if(/photo_path/i.test(m)&&(/schema cache|column|products/i.test(m)))m="تم اكتشاف مشكلة قديمة في عمود photo_path. هذه النسخة لا ترسله عند حفظ المنتج؛ ارفع ملفات الموقع الجديدة ثم حدّث الصفحة وأعد المحاولة.";if(/mix_items.*foreign key|violates foreign key.*mix_items/i.test(m))m="لا يمكن حذف عطر مستخدم داخل خلطة. عدّل الخلطة أولاً ثم احذف العطر إذا لزم.";if(/record_sale.*does not exist|record_purchase.*does not exist|Could not find the function/i.test(m)&&!/save_mixture/i.test(m))m="قاعدة البيانات ناقصة: شغّل ملف supabase-setup.sql ثم حدّث الصفحة";toast("⚠️ "+m)}
async function load(){
 if(!sb){
  $("cloudStatus").textContent="⚠️ تعذر الاتصال بخدمة الدخول السحابية.";
  showAuth(true);
  render();
  return;
 }
 try{
  const {data:{session},error}=await sb.auth.getSession();
  if(error)throw error;
  user=session?.user||null;
  if(user){
    showAuth(false);
    await reloadCloud();
    startRealtime();
  }else{
    showAuth(true);
    render();
  }
  if(!authListenerReady){
   authListenerReady=true;
   sb.auth.onAuthStateChange((_e,s)=>{
    user=s?.user||null;
    if(user){
     showAuth(false);
     setTimeout(async()=>{try{await reloadCloud();startRealtime()}catch(err){cloudError(err)}},0);
    }else{
     showAuth(true);
     render();
    }
   });
  }
 }catch(err){cloudError(err);showAuth(true);render()}
}
async function reloadCloud(){
 const required=["products","sales","purchases","notes","activity_log"];
 const results=await Promise.all(required.map(t=>sb.from(t).select("*").order("created_at",{ascending:false}).limit(1000)));
 const requiredBad=results.findIndex(x=>x.error);
 if(requiredBad>=0){
   const table=required[requiredBad];
   const err=results[requiredBad].error;
   const msg=err?.message||"";
   if(/relation|schema cache|Could not find the table/i.test(msg)) toast("⚠️ جدول "+table+" غير موجود في Supabase. شغّل supabase-setup.sql ثم حدّث الصفحة.");
   else cloudError(err);
   return false;
 }
 const optional=await Promise.all(["shortages","debts","mixes"].map(t=>sb.from(t).select("*").order("created_at",{ascending:false}).limit(1000)));
 const shortagesResult=optional[0];
 const shortagesMsg=shortagesResult.error?.message||shortagesResult.error?.details||"";
 shortagesCloudAvailable=!shortagesResult.error;
 if(shortagesResult.error && !/public\.shortages|shortages.*schema cache|schema cache.*shortages|relation .*shortages.*does not exist/i.test(shortagesMsg)){cloudError(shortagesResult.error)}
 const prof=await sb.from("profiles").select("id,display_name");
 if(prof.error){cloudError(prof.error);return false}
 const names=Object.fromEntries((prof.data||[]).map(x=>[x.id,x.display_name]));
 db.products=(results[0].data||[]).map(x=>normalize({...x,created_by_name:names[x.created_by]||"مستخدم",updated_by_name:names[x.updated_by]||"مستخدم"}));
 db.sales=(results[1].data||[]).map(x=>({...x,user_name:names[x.created_by]||"مستخدم"}));
 db.purchases=(results[2].data||[]).map(x=>({...x,user_name:names[x.created_by]||"مستخدم"}));
 db.notes=results[3].data||[];
 const cloudShortages=shortagesResult.error?[]:(shortagesResult.data||[]).map(x=>({...x,created_by_name:names[x.created_by]||"مستخدم"}));
 const pendingShortages=(db.shortages||[]).filter(x=>x._localOnly&&!cloudShortages.some(c=>c.id===x.id));
 db.shortages=[...pendingShortages,...cloudShortages];
 const cloudDebts=optional[1].error?[]:(optional[1].data||[]).map(x=>({...x,created_by_name:names[x.created_by]||"مستخدم"}));
 const pendingDebts=(db.debts||[]).filter(x=>x._localOnly&&!cloudDebts.some(c=>c.id===x.id));
 db.debts=[...pendingDebts,...cloudDebts];
 const mixesResult=optional[2];
 const mixesMsg=mixesResult.error?.message||mixesResult.error?.details||"";
 mixesCloudAvailable=!mixesResult.error;
 if(mixesResult.error){
   if(/public\.mixes|mixes.*schema cache|schema cache.*mixes|relation .*mixes.*does not exist|Could not find the table/i.test(mixesMsg)){
     toast("⚠️ جدول خلطات العطور غير جاهز. شغّل supabase-update-v13-mixes.sql ثم حدّث الصفحة.");
   }else cloudError(mixesResult.error);
 }
 const cloudMixes=mixesResult.error?[]:(mixesResult.data||[]).map(x=>({...x,created_by_name:names[x.created_by]||"مستخدم"}));
 if(!mixesResult.error){
   const ids=cloudMixes.map(x=>x.id);
   if(ids.length){
     const itemsResult=await sb.from("mix_items").select("id,mix_id,perfume_name,position").in("mix_id",ids).order("position",{ascending:true});
     if(itemsResult.error){cloudError(itemsResult.error);return false}
     const itemMap=Object.fromEntries(ids.map(id=>[id,[]]));
     (itemsResult.data||[]).forEach(it=>{if(itemMap[it.mix_id])itemMap[it.mix_id].push(it)});
     db.mixes=cloudMixes.map(x=>({...x,items:itemMap[x.id]||[]}));
   }else db.mixes=[];
 }else db.mixes=(db.mixes||[]).filter(x=>x._localOnly);
 db.activity=results[4].data||[];cache();render();return true
}
let realtimeChannel=null;
function startRealtime(){if(!sb||realtimeChannel)return;realtimeChannel=sb.channel("alraya-live").on("postgres_changes",{event:"*",schema:"public",table:"products"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"mixes"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"mix_items"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"sales"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"purchases"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"notes"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"shortages"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"debts"},()=>reloadCloud()).on("postgres_changes",{event:"*",schema:"public",table:"activity_log"},()=>reloadCloud()).subscribe()}
function showAuth(open){
 const modal=$("auth");
 if(modal)modal.classList.toggle("show",!!open);
 const n=nameOf();
 const badge=$("userBadge");
 if(badge){const ubn=badge.querySelector(".userbadge-name");if(ubn)ubn.textContent=user?n:"غير مسجل";else badge.textContent=user?`👤 ${n}`:"غير مسجل";badge.title=user?`الحساب: ${n} — اضغط لإدارة الحساب`:"غير مسجل";}
 const status=$("cloudStatus");if(status)status.textContent="";
}
async function saveProduct(p){
 if(!sb)return localSaveProduct(p);
 let err;
 const now=new Date().toISOString();
 if(p.id&&db.products.some(x=>x.id===p.id)){
   const {error}=await sb.from("products").update({...p,updated_by:user.id,updated_at:now}).eq("id",p.id);err=error
 } else {
   p.created_by=user.id;p.updated_by=user.id;p.created_at=now;p.updated_at=now;
   const {data,error}=await sb.from("products").insert(p).select().single();if(data)p.id=data.id;err=error
 }
 if(err){cloudError(err);return false}
 await reloadCloud();toast("تم حفظ الصنف سحابياً");return true
}
function localSaveProduct(p){let i=db.products.findIndex(x=>x.id===p.id);if(i<0){p.created_by_name=nameOf();p.updated_by_name=nameOf();p.created_at=new Date().toISOString()}else{p.created_by_name=db.products[i].created_by_name;p.updated_by_name=nameOf()}p.updated_at=new Date().toISOString();i<0?db.products.push(p):db.products[i]=p;db.activity.unshift({id:uid(),user_name:nameOf(),action:i<0?"INSERT":"UPDATE",entity_type:"products",entity_name:p.name,created_at:new Date().toISOString(),details:{changes:{}}});cache();render();toast("تم الحفظ محلياً");return true}
async function removeProduct(id){if(!confirm("حذف الصنف؟ لا يمكن التراجع عن الحذف."))return;if(sb){const {error}=await sb.from("products").delete().eq("id",id);if(error)return cloudError(error);await reloadCloud();toast("تم حذف الصنف")}else{const p=db.products.find(x=>x.id===id);db.products=db.products.filter(x=>x.id!==id);db.activity.unshift({id:uid(),user_name:nameOf(),action:"DELETE",entity_type:"products",entity_name:p?.name||"",created_at:new Date().toISOString(),details:{}});cache();render();toast("تم الحذف")}}
function sortProducts(list){const by=$("sortBy")?.value||"newest",dir=$("sortDir")?.dataset.dir||"desc";const mul=dir==="asc"?1:-1;return list.sort((a,b)=>{let av,bv;switch(by){case"name":av=(a.name||"").toLocaleLowerCase();bv=(b.name||"").toLocaleLowerCase();return av.localeCompare(bv,"ar")*mul;case"cat":av=a.cat||"";bv=b.cat||"";return av.localeCompare(bv,"ar")*mul;case"retail":return (Number(a.retail)-Number(b.retail))*mul;case"buy":return (Number(a.buy)-Number(b.buy))*mul;case"qty":return (Number(a.qty)-Number(b.qty))*mul;case"updated":return (new Date(a.updated_at||0)-new Date(b.updated_at||0))*mul;default:return (new Date(a.created_at||0)-new Date(b.created_at||0))*mul}})}
function render(){
 const p=db.products||[];$(("cnt")).textContent=p.length;$("units").textContent=money(p.reduce((a,x)=>a+Number(x.qty||0),0));$("stock").textContent=money(p.reduce((a,x)=>a+Number(x.qty||0)*Number(x.buy||0),0));$("low").textContent=p.filter(x=>Number(x.qty||0)<=Number(x.min||0)).length;
 const q=($(("search"))?.value||"").trim().toLowerCase(),cat=$(("category"))?.value||"",stock=$(("stockFilter"))?.value||"";
 let list=p.filter(x=>(!cat||x.cat===cat)&&(!stock||(stock==="out"?Number(x.qty)<=0:stock==="low"?Number(x.qty)>0&&Number(x.qty)<=Number(x.min||0):stock==="available"?Number(x.qty)>0:true))&&[x.name,x.brand,x.barcode,x.code,x.gender,x.size,x.conc,x.country,x.supplier,x.cat,...(x.aliases||[])].join(" ").toLowerCase().includes(q));
 list=sortProducts(list);$("resultCount").textContent=`${list.length} صنف`;$("grid").innerHTML=list.length?list.map(card).join(""):"<div class='empty'><div>📦</div><b>لا توجد نتائج</b><span>جرّب تغيير البحث أو الفلاتر.</span></div>";
 const newest=[...p].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));$("recent").innerHTML=newest.slice(0,6).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><small class="muted"> · ${esc(x.created_by_name||"مستخدم")}</small></span><b>${money(x.qty)}</b></div>`).join("")||"<p class='muted'>لا توجد أصناف.</p>";
 $("alerts").innerHTML=p.filter(x=>Number(x.qty)<=Number(x.min||0)).sort((a,b)=>Number(a.qty)-Number(b.qty)).slice(0,8).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><small class="muted"> · ${esc(x.cat||"")}</small></span><b class="${Number(x.qty)>0?"warn":"out"}">${money(x.qty)}</b></div>`).join("")||"<p class='muted'>المخزون ممتاز.</p>";
 const shortages=db.shortages||[];const debts=db.debts||[];
 $("shortagesList").innerHTML=shortages.length?shortages.map(x=>{const pr={normal:["عادية",""],high:["مهمة","warn"],urgent:["عاجلة","out"]}[x.priority||"normal"];return `<div class="row shortage-row"><span class="shortage-main">${x.photo?`<img class="shortage-thumb" src="${esc(x.photo)}" alt="">`:``}<span><b>${esc(x.name)}</b> × ${money(x.qty||1)} <span class="tag">${pr[0]}</span>${x.note?`<div class="shortage-details"><b>تفاصيل النقص</b><span>${esc(x.note).replace(/\n/g,"<br>")}</span></div>`:""}<small class="muted shortage-meta"><br>📅 ${fmt(x.created_at)} · 👤 تمت الإضافة بواسطة <b>${esc(x.created_by_name||"مستخدم")}</b></small></span></span><span class="cardactions"><button class="detailsBtn" onclick="toggleShortage('${x.id}')">${x.purchased?"إرجاع للنقص":"تم الشراء"}</button><button class="editBtn" onclick="editShortage('${x.id}')">تعديل</button><button class="delBtn" onclick="delShortage('${x.id}')">حذف</button></span></div>`}).join(""):"<p class='muted'>لا توجد نقوصات حالياً.</p>";
 $("debtsList").innerHTML=debts.length?debts.map(x=>`<div class="row debt-row"><span class="debt-main">${x.photo?`<img class="debt-thumb" src="${esc(x.photo)}" alt="صورة الدين">`:``}<span><b>${esc(x.person)}</b>${x.note?`<div class="shortage-details"><b>تفاصيل الدين</b><span>${esc(x.note).replace(/\n/g,"<br>")}</span></div>`:`<div class="shortage-details"><b>تفاصيل الدين</b><span class="muted">لم تتم إضافة تفاصيل.</span></div>`}<small class="muted shortage-meta"><br>📅 ${fmt(x.created_at)} · 👤 تمت الإضافة بواسطة <b>${esc(x.created_by_name||"مستخدم")}</b></small></span><span class="cardactions"><button class="editBtn" onclick="editDebt('${x.id}')">تعديل</button><button class="delBtn" onclick="delDebt('${x.id}')">حذف</button></span></div>`).join(""):"<p class='muted'>لا توجد ديون حالياً.</p>";
 const mixSearch=( $("mixSearch")?.value||"" ).trim().toLowerCase(),mixGender=$("mixGender")?.value||"";
 let mixes=(db.mixes||[]).filter(x=>!mixGender||x.gender===mixGender).filter(x=>{const names=(x.items||[]).map(it=>it.perfume_name||"").join(" ");return !mixSearch||[x.name,x.gender,names].join(" ").toLowerCase().includes(mixSearch)});
 $("mixResultCount").textContent=`${mixes.length} خلطة`;
 $("mixGrid").innerHTML=mixes.length?mixes.map(mix=>mixCard(mix,mixSearch)).join(""):"<div class='empty'><div>🧴</div><b>لا توجد خلطات مطابقة</b><span>اكتب اسم عطر للعثور على كل الخلطات التي تحتويه، ثم اختر الخلطة المطلوبة.</span></div>";
 $("notesList").innerHTML=db.notes.map(x=>`<div class="row"><span><b>${esc(x.title)}</b><br><span class="muted">${esc(x.text)} · ${fmt(x.created_at||x.date)}</span></span><button onclick="removeNote('${x.id}')">حذف</button></div>`).join("")||"<p class='muted'>لا توجد ملاحظات.</p>";
 const actFilter=($(("activityAction"))?.value||"");const entFilter=($(("activityEntity"))?.value||"");let acts=db.activity.filter(a=>(!actFilter||a.action===actFilter)&&(!entFilter||a.entity_type===entFilter));
 $("activityList").innerHTML=acts.slice(0,150).map(activityCard).join("")||"<div class='empty'><div>🕘</div><b>لا يوجد نشاط مطابق</b></div>";$("homeActivity").innerHTML=db.activity.slice(0,5).map(a=>`<div class="row"><span><b>${esc(a.user_name||"مستخدم")}</b> ${actionAr(a.action)} ${entityAr(a.entity_type)}: ${esc(a.entity_name||"")} ${changeSummary(a)}</span><small>${fmt(a.created_at)}</small></div>`).join("")||"<p class='muted'>لا يوجد نشاط.</p>";
}
function fmt(d){return d?new Date(d).toLocaleString("en-US",{dateStyle:"short",timeStyle:"short"}):""}
function actionAr(a){return({INSERT:"أضاف",UPDATE:"عدّل",DELETE:"حذف"})[a]||a}
function entityAr(a){return({products:"الصنف",notes:"الملاحظة",shortages:"النقوصات",debts:"الدين",mixes:"خلطة العطور"})[a]||a}
function prettyField(k){return({name:"الاسم",brand:"الماركة",cat:"الفئة",gender:"الجنس",size:"الحجم",conc:"التركيز",barcode:"الباركود",code:"الكود",country:"بلد الصنع",qty:"الكمية",min:"حد التنبيه",buy:"سعر شراء التاجر : بغداد",wholesale:"سعر الجملة : داخل المحل",retail:"سعر المفرد : في المحل",supplier:"المورد",desc:"الوصف",note:"الملاحظات",photo:"الصورة"})[k]||k}
function changeSummary(a){let c=a?.details?.changes||{};let keys=Object.keys(c).filter(k=>!['updated_at','updated_by'].includes(k));if(!keys.length)return"";return `<small class="changeSummary"> · تغيّر: ${keys.slice(0,3).map(prettyField).join("، ")}${keys.length>3?` +${keys.length-3}`:""}</small>`}
function activityCard(a){let c=a?.details?.changes||{};let keys=Object.keys(c).filter(k=>!['updated_at','updated_by'].includes(k));return `<div class="activity"><div class="avatar">${esc((a.user_name||"م").trim().charAt(0))}</div><div><b>${esc(a.user_name||"مستخدم")}</b> <span>${actionAr(a.action)} ${entityAr(a.entity_type)}</span><strong>${esc(a.entity_name||"")}</strong>${keys.length?`<div class="changes">${keys.slice(0,8).map(k=>{const ch=c[k]||{};return `<span><b>${esc(prettyField(k))}</b>: ${esc(displayChange(ch.from))} ← ${esc(displayChange(ch.to))}</span>`}).join("")}</div>`:""}<small>${fmt(a.created_at)}</small></div></div>`}
function displayChange(v){if(v===null||v===undefined||v==="")return"فارغ";if(Array.isArray(v))return v.join("، ");if(typeof v==="object")return JSON.stringify(v);return String(v)}
function mixImg(m){return m?.photo||placeholder()}
function mixProducts(m){return (m?.items||[]).sort((a,b)=>Number(a.position||0)-Number(b.position||0)).map(it=>it.perfume_name||"").filter(Boolean)}
function mixCard(m,query=""){const ps=mixProducts(m);const q=String(query||"").trim().toLowerCase();const matched=ps.filter(p=>p.toLowerCase().includes(q));const desc=String(m.desc||"").trim();return `<article class="card mix-card ${selectedMixId===m.id?"mix-selected-card":""}"><img src="${esc(mixImg(m))}" alt="${esc(m.name)}"><div class="cardbody"><div class="who">🧴 <b>خلطة عطور</b><span class="tag">${esc(m.gender||"")}</span></div><h3>${esc(m.name)}</h3>${desc?`<div class="mix-description"><small>وصف الخلطة</small><p>${esc(desc)}</p></div>`:""}${q&&matched.length?`<div class="mix-match">🔎 العطر المطابق: <b>${esc(matched.join("، "))}</b></div>`:""}<div class="muted">${ps.length} عطور داخل الخلطة</div><div class="mix-perfumes">${ps.map(p=>`<span class="tag">${esc(p)}</span>`).join("")}</div><div class="updated">تمت الإضافة بواسطة <b>${esc(m.created_by_name||"مستخدم")}</b> · ${fmt(m.created_at)}</div><div class="cardactions"><button class="detailsBtn" onclick="mixDetails('${m.id}')">التفاصيل</button><button class="primary" type="button" onclick="selectMix('${m.id}')">${selectedMixId===m.id?"✓ تم الاختيار":"اختيار الخلطة"}</button><button class="editBtn" onclick="editMix('${m.id}')">تعديل</button><button class="delBtn" onclick="delMix('${m.id}')">حذف</button></div></div></article>`}
function openMix(m){$("mixModal").classList.add("show");$("mixTitle").textContent=m?"تعديل خلطة العطور":"إضافة خلطة عطور";$("mixForm").dataset.id=m?.id||"";$("mixForm").dataset.photo=m?.photo||"";$("mixName").value=m?.name||"";$("mixDesc").value=m?.desc||"";$("mixType").value=m?.gender||"";$("mixPhoto").value="";$("mixPhotoPreview").src=m?.photo||placeholder();$("removeMixPhoto").style.display=m?.photo?"inline-block":"none";const names=(m?.items||[]).sort((a,b)=>a.position-b.position).map(x=>x.perfume_name||"");while(names.length<2)names.push("");$("mixForm").dataset.names=JSON.stringify(names);renderMixNameInputs()}
function getMixNames(){try{return JSON.parse($("mixForm").dataset.names||"[]")}catch{return[]}}
function renderMixNameInputs(){const names=getMixNames();$("mixSelectedCount").textContent=`${names.filter(x=>x.trim()).length} / 10`;$("mixNameInputs").innerHTML=names.map((name,i)=>`<div class="mix-name-row"><span class="tag">${i+1}</span><input class="mix-name-input" data-index="${i}" value="${esc(name)}" placeholder="اكتب اسم العطر ${i+1}"><button type="button" class="remove-mix-name" onclick="removeMixName(${i})" aria-label="إزالة العطر">×</button></div>`).join("");document.querySelectorAll(".mix-name-input").forEach(el=>el.oninput=()=>{const n=getMixNames();n[Number(el.dataset.index)]=el.value;$("mixForm").dataset.names=JSON.stringify(n);$("mixSelectedCount").textContent=`${n.filter(x=>x.trim()).length} / 10`})}
window.addMixName=()=>{const n=getMixNames();if(n.length>=10)return toast("⚠️ الحد الأقصى 10 عطور");n.push("");$("mixForm").dataset.names=JSON.stringify(n);renderMixNameInputs();setTimeout(()=>document.querySelectorAll(".mix-name-input")[n.length-1]?.focus(),0)};window.removeMixName=i=>{const n=getMixNames();if(n.length<=2)return toast("⚠️ الخلطة يجب أن تحتوي على عطرين على الأقل");n.splice(i,1);$("mixForm").dataset.names=JSON.stringify(n);renderMixNameInputs()};
function selectMix(id){selectedMixId=id;render();toast("✓ تم اختيار هذه الخلطة");}
window.selectMix=selectMix;
function mixDetails(id){const m=db.mixes.find(x=>x.id===id);if(!m)return;const ps=mixProducts(m),desc=String(m.desc||"").trim();$("details").innerHTML=`<img class="detailimg" src="${esc(mixImg(m))}" alt="${esc(m.name)}"><div class="who big">🧴 خلطة عطور · <b>${esc(m.gender||"")}</b><br><small>تمت الإضافة بواسطة: ${esc(m.created_by_name||"مستخدم")} · ${fmt(m.created_at)}</small></div><h2>${esc(m.name)}</h2>${desc?`<div class="mix-description mix-detail-description"><small>وصف الخلطة</small><p>${esc(desc)}</p></div>`:""}<div class="mix-detail-list">${ps.map((p,i)=>`<div class="detailitem"><small>العطر ${i+1}</small><b>${esc(p)}</b></div>`).join("")}</div><div class="actions"><button type="button" class="primary" onclick="selectMix('${m.id}');$('dm').classList.remove('show')">${selectedMixId===m.id?"✓ تم اختيار هذه الخلطة":"اختيار هذه الخلطة"}</button></div>`;$("dm").classList.add("show")}
async function saveMix(x){const names=(x.perfume_names||[]).map(v=>String(v||"").trim()).filter(Boolean);if(names.length<2||names.length>10)return toast("⚠️ الخلطة يجب أن تحتوي من 2 إلى 10 عطور");if(new Set(names.map(v=>v.toLowerCase())).size!==names.length)return toast("⚠️ لا يمكن تكرار اسم العطر داخل الخلطة");if(!x.name)return toast("⚠️ اسم الخلطة مطلوب");if(!x.gender)return toast("⚠️ اختر نوع الخلطة");if(!sb){toast("⚠️ Supabase غير متصل. لم يتم حفظ الخلطة على الجهاز حتى لا تُفقد من السحابة.");return false}if(mixesCloudAvailable===false){toast("⚠️ الخلطات السحابية غير جاهزة. شغّل ملف supabase-update-v13-mixes.sql في Supabase ثم حدّث الصفحة.");return false}try{const{data,error}=await sb.rpc("save_mixture",{p_id:x.id||null,p_name:x.name,p_desc:x.desc||"",p_gender:x.gender,p_photo:x.photo||"",p_perfume_names:names});if(error)throw error;await reloadCloud();toast("تم حفظ الخلطة سحابياً");return true}catch(err){cloudError(err);return false}}
window.editMix=id=>openMix(db.mixes.find(x=>x.id===id));window.mixDetails=mixDetails;window.delMix=async id=>{if(!confirm("حذف الخلطة؟ لا يمكن التراجع عن الحذف."))return;const m=db.mixes.find(x=>x.id===id);if(!sb||m?._localOnly){db.mixes=db.mixes.filter(x=>x.id!==id);cache();render();toast("تم حذف الخلطة");return}const{error}=await sb.from("mixes").delete().eq("id",id);if(error)return cloudError(error);await reloadCloud();toast("تم حذف الخلطة")};
function card(p){const info=[["الحجم",p.size],["التركيز",p.conc],["بلد الصنع",p.country],["المورد",p.supplier],["الكود",p.code],["الباركود",p.barcode]].filter(a=>String(a[1]??"").trim());const desc=String(p.desc||p.note||"").trim();return `<article class="card"><img src="${productImg(p)}" alt="${esc(p.name)}"><div class="cardbody"><div class="who">👤 <b>تم إضافة المنتج بواسطة: ${esc(p.created_by_name||"مستخدم")}</b></div><h3>${esc(p.name)}</h3><div class="muted">${esc(p.brand||"بدون ماركة")} • ${esc(p.cat||"بدون فئة")} • ${esc(p.gender||"بدون تحديد")} ${p.size?`• ${esc(p.size)}`:""}</div><div class="tags">${(p.aliases||[]).slice(0,5).map(a=>`<span class="tag">${esc(a)}</span>`).join("")}</div>${info.length?`<div class="cardinfo">${info.map(a=>`<span><small>${a[0]}</small><b>${esc(a[1])}</b></span>`).join("")}</div>`:""}${desc?`<div class="carddesc"><small>وصف المنتج</small><p>${esc(desc)}</p></div>`:""}<div class="prices"><div>شراء<b>${money(p.buy)}</b></div><div>جملة<b>${money(p.wholesale)}</b></div><div>مفرد<b>${money(p.retail)}</b></div></div><div class="stockline"><span>المخزون</span><b class="${Number(p.qty)<=0?"out":Number(p.qty)<=Number(p.min||0)?"warn":"ok"}">${money(p.qty)}</b></div><div class="updated">آخر تعديل بواسطة <b>${esc(p.updated_by_name||"مستخدم")}</b> · ${fmt(p.updated_at)}</div><div class="cardactions"><button class="detailsBtn" onclick="details('${p.id}')">التفاصيل</button><button class="editBtn" onclick="edit('${p.id}')">تعديل</button><button class="delBtn" onclick="del('${p.id}')">حذف</button></div></div></article>`}
function openProduct(p){$("pm").classList.add("show");$("pt").textContent=p?"تعديل الصنف":"إضافة منتج";$("pf").dataset.id=p?.id||"";const fields=[["name","name"],["brand","brand"],["cat","cat"],["gender","gender"],["size","size"],["conc","conc"],["barcode","barcode"],["code","code"],["country","country"],["qty","qty"],["min","min"],["buy0","buy"],["whole","wholesale"],["retail","retail"],["supplier","supplier"],["desc","desc"],["pnote","note"]];for(const[id,key]of fields)$(id).value=p?.[key]??"";$("aliases").innerHTML="";(p?.aliases?.length?p.aliases:[""]).forEach(addAlias);$("photoPreview").src=p?.photo||placeholder();$("photoPreview").dataset.data=p?.photo||"";$("photoPreview").dataset.path="";$("photo").value=""}
function addAlias(v=""){let d=document.createElement("div");d.className="aliasrow";d.innerHTML=`<input class="aliasInput" value="${esc(v)}" placeholder="اسم آخر"><button type="button">×</button>`;d.querySelector("button").onclick=()=>d.remove();$("aliases").appendChild(d)}
function details(id){let p=db.products.find(x=>x.id===id);if(!p)return;$("details").innerHTML=`<img class="detailimg" src="${productImg(p)}" alt="${esc(p.name)}"><div class="who big">👤 تم إضافة المنتج بواسطة: <b>${esc(p.created_by_name||"مستخدم")}</b><br><small>آخر تعديل بواسطة: ${esc(p.updated_by_name||"مستخدم")} · ${fmt(p.updated_at)}</small></div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.brand||"بدون ماركة")} • ${esc(p.cat||"بدون فئة")} • ${esc(p.gender||"بدون تحديد")}</p><div class="detailgrid">${[["الحجم",p.size],["التركيز",p.conc],["الباركود",p.barcode],["الكود",p.code],["بلد الصنع",p.country],["الكمية",money(p.qty)],["حد التنبيه",money(p.min)],["سعر شراء التاجر : بغداد",money(p.buy)], ["سعر الجملة : داخل المحل",money(p.wholesale)],["سعر المفرد : في المحل",money(p.retail)],["المورد",p.supplier]].map(a=>`<div class="detailitem"><small>${a[0]}</small><b>${esc(a[1]??"-")}</b></div>`).join("")}</div><h3>الأسماء البديلة</h3><p>${esc((p.aliases||[]).join("، ")||"لا يوجد")}</p><div class="desc"><b>الوصف</b><br>${esc(p.desc||"لا يوجد")}</div><div class="desc"><b>ملاحظات الصنف</b><br>${esc(p.note||"لا توجد")}</div>`;$("dm").classList.add("show")}
window.edit=id=>openProduct(db.products.find(p=>p.id===id));window.details=details;window.del=removeProduct;
async function removeNote(id){if(!confirm("حذف الملاحظة؟"))return;if(sb){let {error}=await sb.from("notes").delete().eq("id",id);if(error)return cloudError(error);await reloadCloud()}else{let n=db.notes.find(x=>x.id===id);db.notes=db.notes.filter(x=>x.id!==id);db.activity.unshift({id:uid(),user_name:nameOf(),action:"DELETE",entity_type:"notes",entity_name:n?.title||"",created_at:new Date().toISOString(),details:{}});cache();render()}}
function go(p){document.querySelectorAll(".page").forEach(x=>x.classList.add("hide"));$(p).classList.remove("hide");document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x.dataset.page===p));render()}
async function uploadPhoto(file){
 if(!file)return{url:"",path:""};
 const allowed=["image/jpeg","image/png","image/webp","image/gif"];
 if(!allowed.includes(file.type))throw new Error("نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF");
 if(file.size>5*1024*1024)throw new Error("حجم الصورة كبير جداً. الحد الأقصى 5 ميغابايت");
 if(!sb)return new Promise(r=>{let fr=new FileReader();fr.onload=()=>r({url:fr.result,path:""});fr.readAsDataURL(file)});
 let ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`${user.id}/${uid()}.${ext}`;
 let {error}=await sb.storage.from(cfg.storageBucket).upload(path,file,{upsert:false,contentType:file.type||"image/jpeg"});
 if(error)throw error;
 let {data}=sb.storage.from(cfg.storageBucket).getPublicUrl(path);
 return{url:data.publicUrl,path}
}
$("headerSearch").onclick=()=>{go("inventory");setTimeout(()=>$("search").focus(),0)};
$("newBtn").onclick=$("addBtn").onclick=()=>{if(sb&&!user){$("auth").classList.add("show");return}openProduct()};$("addAlias").onclick=()=>addAlias();$("pc").onclick=$("cancel").onclick=()=>$("pm").classList.remove("show");$("dc").onclick=()=>$("dm").classList.remove("show");$("search").oninput=render;$("category").onchange=render;$("stockFilter").onchange=render;$("sortBy").onchange=render;$("sortDir").onclick=()=>{$("sortDir").dataset.dir=$("sortDir").dataset.dir==="asc"?"desc":"asc";$("sortDir").textContent=$("sortDir").dataset.dir==="asc"?"↑ تصاعدي":"↓ تنازلي";render()};$("shortageBtn").onclick=()=>openShortage();$("debtBtn").onclick=()=>openDebt();$("activityAction").onchange=render;$("activityEntity").onchange=render;document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>go(b.dataset.page));document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$("mixAddBtn").onclick=()=>{if(sb&&!user){$("auth").classList.add("show");return}openMix()};$("mixClose").onclick=$("mixCancel").onclick=()=>$("mixModal").classList.remove("show");$("mixSearch").oninput=render;$("mixGender").onchange=render;$("addMixPerfume").onclick=()=>addMixName();$("mixPhoto").onchange=e=>{const f=e.target.files[0];if(!f)return;const allowed=["image/jpeg","image/png","image/webp","image/gif"];if(!allowed.includes(f.type)){e.target.value="";return toast("⚠️ اختر JPG أو PNG أو WEBP أو GIF")}if(f.size>5*1024*1024){e.target.value="";return toast("⚠️ الحد الأقصى لحجم الصورة 5 ميغابايت")}const r=new FileReader();r.onload=()=>{$("mixPhotoPreview").src=r.result;$('mixForm').dataset.preview=r.result};r.readAsDataURL(f)};$("removeMixPhoto").onclick=()=>{$("mixForm").dataset.photo="";$('mixForm').dataset.preview="";$('mixPhoto').value="";$('mixPhotoPreview').src=placeholder();$('removeMixPhoto').style.display="none"};$("mixForm").onsubmit=async e=>{e.preventDefault();if(e.target.dataset.saving)return;e.target.dataset.saving="1";const btn=e.target.querySelector("button.primary");if(btn){btn.disabled=true;btn.textContent="جارٍ الحفظ..."}try{const names=getMixNames().map(v=>v.trim()).filter(Boolean);if(names.length<2||names.length>10)return toast("⚠️ اكتب من 2 إلى 10 أسماء عطور");let photo=e.target.dataset.photo||"";if($("mixPhoto").files[0])photo=(await uploadPhoto($("mixPhoto").files[0])).url;else if(e.target.dataset.preview)photo=e.target.dataset.preview;const ok=await saveMix({id:e.target.dataset.id||"",name:$('mixName').value.trim(),desc:$('mixDesc').value.trim(),gender:$('mixType').value,photo,perfume_names:names});if(ok)$('mixModal').classList.remove("show")}catch(err){cloudError(err)}finally{e.target.dataset.saving="";if(btn){btn.disabled=false;btn.textContent="حفظ الخلطة"}}};
$("photo").onchange=e=>{let f=e.target.files[0];if(!f)return;const allowed=["image/jpeg","image/png","image/webp","image/gif"];if(!allowed.includes(f.type)){e.target.value="";return toast("⚠️ اختر صورة بصيغة JPG أو PNG أو WEBP أو GIF")}if(f.size>5*1024*1024){e.target.value="";return toast("⚠️ الحد الأقصى لحجم الصورة هو 5 ميغابايت")}let r=new FileReader();r.onload=()=>{$("photoPreview").src=r.result;$("photoPreview").dataset.data=r.result};r.readAsDataURL(f)};
$("pf").onsubmit=async e=>{e.preventDefault();if(e.target.dataset.saving==="1")return;e.target.dataset.saving="1";const saveBtn=e.target.querySelector("button.primary");if(saveBtn){saveBtn.disabled=true;saveBtn.dataset.originalText=saveBtn.textContent;saveBtn.textContent="جارٍ الحفظ..."}if(sb&&!user){e.target.dataset.saving="";if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=saveBtn.dataset.originalText||"حفظ الصنف"}$("auth").classList.add("show");return}let old=db.products.find(x=>x.id===e.target.dataset.id),photo={url:old?.photo||"",path:""};try{let barcode=$("barcode").value.trim(),code=$("code").value.trim();if(barcode&&db.products.some(x=>x.id!==e.target.dataset.id&&String(x.barcode||"").trim()===barcode))return toast("⚠️ هذا الباركود مستخدم في صنف آخر");if(code&&db.products.some(x=>x.id!==e.target.dataset.id&&String(x.code||"").trim()===code))return toast("⚠️ كود الصنف مستخدم في صنف آخر");if($("photo").files[0])photo=await uploadPhoto($("photo").files[0]);let num=id=>$(id).value.trim()===""?0:Number($(id).value);const numericIds=["qty","min","buy0","whole","retail"];if(numericIds.some(id=>!Number.isFinite(num(id))||num(id)<0))return toast("⚠️ تحقق من القيم الرقمية والأسعار");let p={id:e.target.dataset.id||uid(),name:$("name").value.trim(),brand:$("brand").value.trim(),cat:$("cat").value,gender:$("gender").value,size:$("size").value.trim(),conc:$("conc").value.trim(),barcode:$("barcode").value.trim(),code:$("code").value.trim(),country:$("country").value.trim(),qty:num("qty"),min:num("min"),buy:num("buy0"),wholesale:num("whole"),retail:num("retail"),supplier:$("supplier").value.trim(),desc:$("desc").value.trim(),note:$("pnote").value.trim(),aliases:[...document.querySelectorAll(".aliasInput")].map(x=>x.value.trim()).filter(Boolean),photo:photo.url};if(!p.name)return toast("اسم المنتج مطلوب");if(!sb){p.created_by_name=nameOf();p.updated_by_name=nameOf();localSaveProduct(p);$("pm").classList.remove("show")}else{const ok=await saveProduct(p);if(ok)$("pm").classList.remove("show")}}catch(err){cloudError(err)}finally{e.target.dataset.saving="";if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=saveBtn.dataset.originalText||"حفظ الصنف"}}};
$("noteBtn").onclick=()=>$("nm").classList.add("show");$("nc").onclick=$("nc2").onclick=()=>$("nm").classList.remove("show");
$("nf").onsubmit=async e=>{e.preventDefault();let n={title:$("nt").value.trim(),text:$("nx").value.trim(),created_by:user?.id};if(!n.title||!n.text)return;if(sb){let{error}=await sb.from("notes").insert(n);if(error)return cloudError(error);await reloadCloud()}else{n.id=uid();n.date=new Date().toISOString();db.notes.unshift(n);db.activity.unshift({id:uid(),user_name:nameOf(),action:"INSERT",entity_type:"notes",entity_name:n.title,created_at:new Date().toISOString(),details:{}});cache();render()}e.target.reset();$("nm").classList.remove("show");toast("تم حفظ الملاحظة")};
function openShortage(x){$("shortageModal").classList.add("show");$("shortageTitle").textContent=x?"تعديل النقوص":"إضافة نقوص";$("shortageForm").dataset.id=x?.id||"";$("shortageForm").dataset.photo=x?.photo||"";$("shortageName").value=x?.name||"";$("shortageQty").value=x?.qty??1;$("shortagePriority").value=x?.priority||"normal";$("shortageNote").value=x?.note||"";$("shortagePhoto").value="";$("shortagePhotoPreview").src=x?.photo||placeholder();$("removeShortagePhoto").style.display=x?.photo?"inline-block":"none"}
async function saveShortage(x){
 const localSave=(reason)=>{
  const i=db.shortages.findIndex(a=>a.id===x.id);
  if(i<0){x.id=uid();x.created_at=new Date().toISOString();x.created_by_name=x.created_by_name||nameOf();x._localOnly=!!reason;db.shortages.unshift(x)}
  else{db.shortages[i]={...db.shortages[i],...x,updated_at:new Date().toISOString(),_localOnly:!!reason}}
  cache();render();
 };
 if(sb&&shortagesCloudAvailable!==false){
  const payload={name:x.name,qty:x.qty,priority:x.priority,note:x.note,photo:x.photo||"",purchased:!!x.purchased,updated_at:new Date().toISOString()};
  let r=x.id?await sb.from("shortages").update(payload).eq("id",x.id):await sb.from("shortages").insert({...payload,created_by:user.id}).select().single();
  if(r.error){
   const m=r.error.message||r.error.details||"";
   if(/public\.shortages|shortages.*schema cache|schema cache.*shortages|relation .*shortages.*does not exist|row-level security|permission denied|violates row-level security policy|42501/i.test(m)){
     localSave();
     toast("⚠️ النقوص محفوظ على الجهاز. شغّل supabase-fix-shortages.sql ليتم حفظه سحابياً");
     return true;
   }
   if(/column .*photo.*does not exist|photo.*schema cache|could not find the .*photo/i.test(m)){
     const legacyPayload={name:x.name,qty:x.qty,priority:x.priority,note:x.note,purchased:!!x.purchased,updated_at:new Date().toISOString()};
     const rr=x.id?await sb.from("shortages").update(legacyPayload).eq("id",x.id):await sb.from("shortages").insert({...legacyPayload,created_by:user.id});
     if(!rr.error){ await reloadCloud(); toast(x.id?"تم تعديل النقوص":"تمت إضافة النقوص"); return true }
   }
   localSave();
   cloudError(r.error);
   return true;
  }
  await reloadCloud();
  toast(x.id?"تم تعديل النقوص":"تمت إضافة النقوص");return true;
 }
 localSave();toast(x.id?"تم تعديل النقوص":"تمت إضافة النقوص");return true;
}
window.editShortage=id=>openShortage(db.shortages.find(x=>x.id===id));window.toggleShortage=async id=>{const x=db.shortages.find(a=>a.id===id);if(!x)return;await saveShortage({...x,purchased:!x.purchased})};window.delShortage=async id=>{if(!confirm("حذف النقوص؟"))return;const x=db.shortages.find(a=>a.id===id);if(x?._localOnly||!sb){db.shortages=db.shortages.filter(a=>a.id!==id);cache();render();toast("تم حذف النقوص");return}const{error}=await sb.from("shortages").delete().eq("id",id);if(error)return cloudError(error);await reloadCloud();toast("تم حذف النقوص")}
$("shortagePhoto").onchange=e=>{const f=e.target.files[0];if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type)){e.target.value="";return toast("⚠️ اختر JPG أو PNG أو WEBP")}if(f.size>5*1024*1024){e.target.value="";return toast("⚠️ الحد الأقصى للصورة 5 ميغابايت")}const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const max=900,scale=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));c.getContext("2d").drawImage(im,0,0,c.width,c.height);$("shortageForm").dataset.photo=c.toDataURL("image/jpeg",.78);$("shortagePhotoPreview").src=$("shortageForm").dataset.photo;$("removeShortagePhoto").style.display="inline-block"};im.src=r.result};r.readAsDataURL(f)};
$("removeShortagePhoto").onclick=()=>{$("shortageForm").dataset.photo="";$("shortagePhoto").value="";$("shortagePhotoPreview").src=placeholder();$("removeShortagePhoto").style.display="none"};
$("shortageForm").onsubmit=async e=>{e.preventDefault();if(e.target.dataset.saving)return;e.target.dataset.saving="1";const name=$("shortageName").value.trim(),qty=Number($("shortageQty").value),priority=$("shortagePriority").value,note=$("shortageNote").value.trim();if(!name||!Number.isInteger(qty)||qty<1){e.target.dataset.saving="";return toast("أدخل اسم وكمية صحيحة")}const old=db.shortages.find(x=>x.id===e.target.dataset.id);let ok=false;try{ok=await saveShortage({id:e.target.dataset.id||"",name,qty,priority,note,photo:e.target.dataset.photo||"",purchased:old?.purchased||false,created_by_name:old?.created_by_name||nameOf()})}finally{e.target.dataset.saving=""}if(ok)$("shortageModal").classList.remove("show")};$("shortageClose").onclick=$("shortageCancel").onclick=()=>$("shortageModal").classList.remove("show");
function openDebt(x){$("debtModal").classList.add("show");$("debtTitle").textContent=x?"تعديل الدين":"إضافة دين";$("debtForm").dataset.id=x?.id||"";$("debtForm").dataset.photo=x?.photo||"";$("debtPerson").value=x?.person||"";$("debtNote").value=x?.note||"";$("debtPhoto").value="";$("debtPhotoPreview").src=x?.photo||placeholder();$("removeDebtPhoto").style.display=x?.photo?"inline-block":"none"}
async function saveDebt(x){
 const now=new Date().toISOString();
 const originalId=(x.id||"").trim();
 const i=originalId?db.debts.findIndex(a=>a.id===originalId):-1;
 const existing=i>=0?db.debts[i]:null;
 const localId=originalId||uid();
 const localItem={...(existing||{}),...x,id:localId,created_at:existing?.created_at||now,updated_at:now,created_by:existing?.created_by||user?.id||null,created_by_name:existing?.created_by_name||x.created_by_name||nameOf()};
 if(i<0) db.debts.unshift(localItem); else db.debts[i]=localItem;
 cache(); render();
 if(sb&&user){
   const payload={person:x.person,note:x.note||'',photo:x.photo||'',updated_at:now,created_by:existing?.created_by||user.id};
   let r=originalId
     ?await sb.from("debts").update(payload).eq("id",originalId).select().single()
     :await sb.from("debts").insert(payload).select().single();
   if(!r.error){
     const saved=r.data||localItem;
     const idx=db.debts.findIndex(a=>a.id===localId||a.id===saved.id);
     if(idx>=0) db.debts[idx]={...db.debts[idx],...saved,_localOnly:false,created_by_name:db.debts[idx].created_by_name||nameOf()};
     cache(); await reloadCloud(); toast(originalId?"تم تعديل الدين":"تمت إضافة الدين"); return true;
   }
   console.error("saveDebt Supabase error",r.error);
   db.debts=db.debts.map(a=>a.id===localId?{...a,_localOnly:true}:a);
   cache(); render();
   cloudError(r.error);
   return false;
 }
 toast(originalId?"تم تعديل الدين":"تمت إضافة الدين"); return true;
}
window.editDebt=id=>openDebt(db.debts.find(x=>x.id===id));window.delDebt=async id=>{if(!confirm("حذف الدين؟"))return;const x=db.debts.find(a=>a.id===id);if(x?._localOnly||!sb){db.debts=db.debts.filter(a=>a.id!==id);cache();render();toast("تم حذف الدين");return}const{error}=await sb.from("debts").delete().eq("id",id);if(error){cloudError(error);return}db.debts=db.debts.filter(a=>a.id!==id);cache();render();await reloadCloud();toast("تم حذف الدين")}
$("debtPhoto").onchange=e=>{const f=e.target.files[0];if(!f)return;if(!["image/jpeg","image/png","image/webp","image/gif"].includes(f.type)){e.target.value="";return toast("⚠️ اختر JPG أو PNG أو WEBP أو GIF")}if(f.size>5*1024*1024){e.target.value="";return toast("⚠️ الحد الأقصى لحجم الصورة هو 5 ميغابايت")}const r=new FileReader();r.onload=()=>{$("debtForm").dataset.photo=r.result;$("debtPhotoPreview").src=r.result;$("removeDebtPhoto").style.display="inline-block"};r.readAsDataURL(f)};$("removeDebtPhoto").onclick=()=>{$("debtForm").dataset.photo="";$("debtPhoto").value="";$("debtPhotoPreview").src=placeholder();$("removeDebtPhoto").style.display="none"};$("debtForm").onsubmit=async e=>{e.preventDefault();if(e.target.dataset.saving)return;e.target.dataset.saving="1";const id=e.target.dataset.id||"",person=$("debtPerson").value.trim(),note=$("debtNote").value.trim(),photo=e.target.dataset.photo||"";if(!person){e.target.dataset.saving="";return toast("⚠️ أدخل اسم الشخص أو الجهة")}try{const ok=await saveDebt({id,person,note,photo});if(ok)$("debtModal").classList.remove("show")}catch(err){console.error(err);cloudError(err)}finally{e.target.dataset.saving=""}};$("debtClose").onclick=$("debtCancel").onclick=()=>$("debtModal").classList.remove("show");
$("theme").onclick=()=>{db.theme=db.theme==="dark"?"light":"dark";apply();localStorage.setItem(K+"_theme",db.theme)};function apply(){const dark=db.theme==="dark";document.body.classList.toggle("dark",dark);const t=$("theme");if(t){t.textContent=dark?"☀️":"🌙";t.title=dark?"التبديل إلى الوضع الفاتح":"التبديل إلى الوضع الليلي";t.setAttribute("aria-label",t.title)}}
function openAccount(){if(!user)return;const n=nameOf();$("accountName").textContent=n;$("accountEmail").textContent=user.email||"—";$("accountAvatar").textContent=(n||"م").trim().charAt(0).toUpperCase()||"م";$("newName").value=n==="مستخدم"?"":n;$("newEmail").value="";$("newPassword").value="";$("account").classList.add("show")}
$("userBadge").onclick=openAccount;$("accountClose").onclick=$("accountCancel").onclick=()=>$("account").classList.remove("show");async function signOut(){if(realtimeChannel&&sb){await sb.removeChannel(realtimeChannel);realtimeChannel=null}if(sb)await sb.auth.signOut();user=null;showAuth(true);render()}$("accountSignOut").onclick=async()=>{await signOut();$("account").classList.remove("show")};
$("accountForm").onsubmit=async e=>{e.preventDefault();if(!sb||!user)return;const newName=$("newName").value.trim(),email=$("newEmail").value.trim(),password=$("newPassword").value,oldEmail=user.email||"";if(!newName&&!email&&!password)return toast("اكتب التغيير الذي تريده أولاً");if(newName&&newName.length<2)return toast("اسم الحساب يجب أن يكون حرفين على الأقل");if(password&&password.length<6)return toast("كلمة المرور يجب أن تكون 6 أحرف على الأقل");try{let changed=[];if(newName&&newName!==nameOf()){const{error:pe}=await sb.from("profiles").update({display_name:newName}).eq("id",user.id);if(pe)return cloudError(pe);const{data,error:ae}=await sb.auth.updateUser({data:{display_name:newName}});if(error) return cloudError(error);if(ae?.user)user=ae.user;changed.push("الاسم")}const patch={};if(email&&email!==user.email)patch.email=email;if(password)patch.password=password;if(Object.keys(patch).length){const{data,error}=await sb.auth.updateUser(patch);if(error)return cloudError(error);if(data?.user)user=data.user;if(email&&email!==oldEmail)changed.push("البريد الإلكتروني");if(password)changed.push("كلمة المرور")}await reloadCloud();const n=nameOf();$("accountName").textContent=n;$("accountEmail").textContent=user.email||"—";$("accountAvatar").textContent=(n||"م").trim().charAt(0).toUpperCase()||"م";$("newName").value=n;$("newEmail").value="";$("newPassword").value="";showAuth(false);toast("✅ تم تحديث: "+changed.join("، "));}catch(err){cloudError(err)}};
$("authForm").onsubmit=async e=>{
 e.preventDefault();
 if(authLoading)return;
 if(!sb)return toast("⚠️ خدمة تسجيل الدخول غير متصلة");
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!email||!password)return;
 authLoading=true;
 const btn=$("authSubmit"),status=$("loginStatus");
 btn.disabled=true;btn.textContent="جارٍ الدخول...";
 if(status)status.textContent="";
 try{
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error)throw error;
  user=data?.user||null;
  if(user){
   showAuth(false);
   toast("✅ تم تسجيل الدخول");
   await reloadCloud();
   startRealtime();
  }
 }catch(err){
  if(status)status.textContent="البريد الإلكتروني أو كلمة السر غير صحيحة";
  cloudError(err);
 }finally{
  authLoading=false;btn.disabled=false;btn.textContent="دخول";
 }
};
async function checkSetup(){const url=$("setupUrl").value.trim().replace(/\/$/,""),key=$("setupKey").value.trim(),box=$("setupCheck");box.className="checkbox";box.textContent="";if(!/^https:\/\/[^\s]+\.supabase\.co$/.test(url))return toast("Project URL غير صحيح");if(key.length<20)return toast("مفتاح anon/publishable غير صحيح");try{const client=window.supabase.createClient(url,key,{auth:{persistSession:false}});const{error}=await client.from("profiles").select("id").limit(1);if(error){box.className="checkbox bad";box.textContent="❌ الاتصال موجود لكن قاعدة البيانات غير جاهزة. شغّل supabase-setup.sql ثم supabase-fix-photo-path.sql عند الحاجة.";return false}box.className="checkbox ok";box.textContent="✅ الاتصال وقاعدة البيانات جاهزان.";return true}catch(e){box.className="checkbox bad";box.textContent="❌ تعذر الاتصال. تأكد من الرابط والمفتاح.";return false}}
function openSetup(){$("setupUrl").value=cfg.supabaseUrl||"";$("setupKey").value=cfg.supabaseAnonKey||"";$("setup").classList.add("show")}
$("setupClose").onclick=$("setupCancel").onclick=()=>$("setup").classList.remove("show");$("testSetup").onclick=checkSetup;$("copySql").onclick=async()=>{try{await navigator.clipboard.writeText($("setupSql").textContent);toast("✅ تم نسخ كود قاعدة البيانات")}catch{toast("افتح ملف supabase-setup.sql وانسخه يدوياً")}};$("setupForm").onsubmit=async e=>{e.preventDefault();let url=$("setupUrl").value.trim().replace(/\/$/,""),key=$("setupKey").value.trim();if(!/^https:\/\/[^\s]+\.supabase\.co$/.test(url))return toast("Project URL غير صحيح");if(key.length<20)return toast("مفتاح anon/publishable غير صحيح");let ok=await checkSetup();if(!ok)return;localStorage.setItem("alraya_supabase_config",JSON.stringify({supabaseUrl:url,supabaseAnonKey:key,storageBucket:"product-images"}));toast("✅ تم الحفظ — سيتم فتح تسجيل الدخول");setTimeout(()=>location.reload(),500)};
apply();load();
