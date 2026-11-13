import './style.css';
const K='campus-flow-v1',days=['日','一','二','三','四','五','六'];
const places=[{name:'校園餐廳（示範）',kind:'用餐',levels:[2,3,5,5,4,2,3,4]},{name:'圖書館（示範）',kind:'讀書',levels:[1,2,3,4,5,4,3,2]},{name:'公共空間（示範）',kind:'辦事',levels:[1,2,2,3,3,2,2,1]}];
const campusLocations=[
{name:'國立中央大學圖書館',kind:'讀書',description:'閱讀、自習與資料查詢',query:'國立中央大學 總圖書館'},
{name:'國立中央大學志希館',kind:'用餐',description:'校內生活與餐飲區域，請確認實際店家營業狀況',query:'中央大學 志希館'},
{name:'國立中央大學行政大樓',kind:'辦事',description:'行政事務地點，請先確認承辦單位',query:'國立中央大學 行政大樓'},
{name:'國立中央大學教研大樓',kind:'上課',description:'教學與研究空間',query:'國立中央大學 教研大樓'},
{name:'國立中央大學中正圖書館',kind:'讀書',description:'校園圖書館建築，請確認開放空間',query:'國立中央大學 中正圖書館'},
{name:'國立中央大學百花川',kind:'休閒',description:'校園散步與休息地點',query:'國立中央大學 百花川'}
];
const mapUrl=p=>'https://www.openstreetmap.org/search?query='+encodeURIComponent(p.query);
let state;try{state=JSON.parse(localStorage.getItem(K))||{courses:[],tab:'home'}}catch{state={courses:[],tab:'home'}}
const save=()=>localStorage.setItem(K,JSON.stringify(state)),el=s=>document.querySelector(s),min=s=>{let [h,m]=s.split(':').map(Number);return h*60+m},fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),level=(p,h)=>p.levels[Math.max(0,Math.min(7,Math.floor((h-9)/1.5)))],label=n=>n<=2?'低':n===3?'中':'高';
function free(day,a,b){let slots=[],cursor=a;for(const c of state.courses.filter(c=>+c.day===+day).sort((x,y)=>min(x.start)-min(y.start))){let s=min(c.start),e=min(c.end);if(s>cursor)slots.push([cursor,Math.min(s,b)]);cursor=Math.max(cursor,e)}if(cursor<b)slots.push([cursor,b]);return slots.filter(([x,y])=>y>x)}
function page(){let tab=state.tab,body=tab==='home'?home():tab==='schedule'?schedule():tab==='explore'?explore():tab==='planner'?planner():settings();el('#app').innerHTML='<header><strong>↗ Campus Flow</strong><small>SMART CAMPUS · DEMO V1</small></header><main>'+body+'</main><nav>'+[['home','⌂','首頁'],['schedule','▦','課表'],['explore','◎','探索'],['planner','✦','規劃'],['settings','⚙','設定']].map(([id,ic,t])=>'<button data-tab="'+id+'" class="'+(id===tab?'active':'')+'">'+ic+'<small>'+t+'</small></button>').join('')+'</nav>';document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();page()});if(tab==='schedule')bindSchedule();if(tab==='explore')bindExplore();if(tab==='planner')bindPlanner();if(tab==='settings')el('#reset').onclick=()=>{if(confirm('清除本機資料？')){localStorage.removeItem(K);state={courses:[],tab:'home'};page()}}}
function home(){let d=new Date().getDay(),today=state.courses.filter(c=>+c.day===d);return '<section class="hero"><small>YOUR SMART CAMPUS COMPANION</small><h1>把時間留給<br><em>更重要的事。</em></h1><p>結合課表、校園地點與示範人潮，規劃你的理想一天。</p><button class="primary" data-tab="planner">開始規劃行程 →</button></section><h2>今日課程 · 星期'+days[d]+'</h2><section class="card">'+(today.length?today.map(c=>'<p>'+esc(c.start)+'–'+esc(c.end)+'　<b>'+esc(c.name)+'</b></p>').join(''):'今天沒有設定課程，請先到「課表」新增。')+'</section><h2>探索校園</h2>'+places.map(p=>'<section class="card"><b>'+p.name+'</b><p>'+p.kind+' · 示範繁忙度 '+label(level(p,new Date().getHours()))+'</p></section>').join('')+'<p class="note">人潮為人工示範資料，並非中央大學即時資訊。</p>'}
function schedule(){return '<h1>我的課表</h1><p>新增課程，規劃器會自動避開上課時間。</p><section class="card"><form id="course"><label>課程名稱<input name="name" required maxlength="50" placeholder="資料庫管理"></label><label>星期<select name="day">'+days.map((d,i)=>'<option value="'+i+'">星期'+d+'</option>').join('')+'</select></label><div class="two"><label>開始<input type="time" name="start" value="09:00" required></label><label>結束<input type="time" name="end" value="10:00" required></label></div><button class="primary">新增課程</button></form></section><h2>已設定課程</h2>'+state.courses.map(c=>'<section class="card course"><div><small>星期'+days[c.day]+'　'+esc(c.start)+'–'+esc(c.end)+'</small><h3>'+esc(c.name)+'</h3></div><button data-delete="'+c.id+'">刪除</button></section>').join('')}
function explore(){return '<h1>中央大學校園探索</h1><p>依用途尋找校園地點，點選「查看地圖」可在 OpenStreetMap 查詢位置。</p><section class="card"><label>地點類型<select id="category"><option value="全部">全部</option>'+['讀書','用餐','辦事','上課','休閒'].map(k=>'<option value="'+k+'">'+k+'</option>').join('')+'</select></label><div id="locations"></div></section><h2>示範人潮趨勢</h2><section class="card"><label>時間 <input type="range" id="hour" min="9" max="19" value="12"></label><h2 id="time"></h2><div id="crowds"></div></section><p class="note">地點清單為初步整理，名稱、用途與開放狀況仍須實地核對；地圖連結是外部搜尋，不代表已驗證座標。人潮數值為合成示範資料，並非真實或即時預測。</p>'}
function planner(){return '<h1>智慧行程規劃</h1><p>根據課表空堂安排今天的任務。</p><section class="card"><form id="plan"><label>星期<select name="day">'+days.map((d,i)=>'<option value="'+i+'" '+(i===new Date().getDay()?'selected':'')+'>星期'+d+'</option>').join('')+'</select></label><div class="two"><label>開始<input type="time" name="start" value="11:00"></label><label>結束<input type="time" name="end" value="17:00"></label></div><label>想完成的任務</label><label class="check"><input type="checkbox" name="task" value="0" checked> 吃飯（40 分鐘）</label><label class="check"><input type="checkbox" name="task" value="1" checked> 讀書（60 分鐘）</label><label class="check"><input type="checkbox" name="task" value="2"> 校園事務（30 分鐘）</label><label>移動緩衝時間<select name="buffer"><option value="10">10 分鐘（建議）</option><option value="5">5 分鐘</option><option value="15">15 分鐘</option><option value="0">不預留</option></select></label><label>偏好<select name="pref"><option value="crowd">優先避開人潮</option><option value="early">優先提早完成</option></select></label><button class="primary">✦ 產生推薦行程</button></form></section><div id="result"></div>'}
function settings(){return '<h1>設定</h1><section class="card"><h2>關於 Campus Flow</h2><p>課表資料僅儲存於本機瀏覽器。人潮資料為人工示範值，排程為規則式，尚未連接 AI 模型。</p><button id="reset">清除本機資料</button></section>'}
function bindSchedule(){el('#course').onsubmit=e=>{e.preventDefault();let c=Object.fromEntries(new FormData(e.target));if(min(c.end)<=min(c.start))return alert('結束時間必須晚於開始時間');if(state.courses.some(x=>x.day===c.day&&min(c.start)<min(x.end)&&min(c.end)>min(x.start)))return alert('課程時間衝突');state.courses.push({...c,id:Date.now()});save();page()};document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{state.courses=state.courses.filter(c=>c.id!==+b.dataset.delete);save();page()})}
function bindExplore(){
const category=el('#category'),s=el('#hour');
function renderPlaces(){const items=campusLocations.filter(p=>category.value==='全部'||p.kind===category.value);el('#locations').innerHTML=items.map(p=>'<article class="place"><div><small>'+p.kind+'</small><h3>'+p.name+'</h3><p>'+p.description+'</p></div><a href="'+mapUrl(p)+'" target="_blank" rel="noopener noreferrer">查看地圖 ↗</a></article>').join('')}
function update(){let h=+s.value;el('#time').textContent=h+':00';el('#crowds').innerHTML=places.map(p=>'<div class="crowd"><b>'+p.name+'</b><span>'+label(level(p,h))+' · '+level(p,h)+'/5</span></div>').join('')}
category.onchange=renderPlaces;s.oninput=update;renderPlaces();update();
}
function bindPlanner(){
el('#plan').onsubmit=e=>{
e.preventDefault();
const d=new FormData(e.target),a=min(d.get('start')),b=min(d.get('end')),tasks=d.getAll('task').map(Number),buffer=Number(d.get('buffer')??10),dur=[40,60,30];
if(b<=a||!tasks.length)return alert('請確認時間並選擇任務');
const available=free(d.get('day'),a,b),pref=d.get('pref');
let best=null;
// Enumerate possible schedules; reserve a buffer on both sides of each task
function search(remaining,chosen){
 if(!remaining.length){const score=chosen.reduce((sum,x)=>sum+(pref==='crowd'?level(places[x.i],x.t/60)*100:0)+x.t/1000,0);if(!best||chosen.length>best.chosen.length||(chosen.length===best.chosen.length&&score<best.score))best={chosen:[...chosen],score};return}
 const i=remaining[0],rest=remaining.slice(1);
 search(rest,chosen);
 for(const [s,e] of available)for(let t=Math.ceil((s+buffer)/10)*10;t+dur[i]+buffer<=e;t+=10){
  if(chosen.some(x=>t<x.t+dur[x.i]+buffer&&t+dur[i]+buffer>x.t))continue;
  chosen.push({i,t});search(rest,chosen);chosen.pop();
 }
}
search(tasks,[]);
const out=(best?.chosen||[]).sort((x,y)=>x.t-y.t);
el('#result').innerHTML='<h2>推薦行程 · 規則式示範</h2>'+
(out.length?out.map(({i,t})=>'<section class="card"><small>'+fmt(t)+'–'+fmt(t+dur[i])+'</small><h3>'+['吃飯','讀書','校園事務'][i]+'</h3><p>'+places[i].name+' · 示範繁忙度 '+label(level(places[i],t/60))+'</p></section>').join(''):'<section class="card">沒有足夠的空堂安排所選任務。</section>')+
(out.length<tasks.length?'<p class="note">有 '+(tasks.length-out.length)+' 項任務未能安排，請延長時間或減少移動緩衝。</p>':'')+
'<p class="note">已預留每項任務前後 '+buffer+' 分鐘緩衝；這是保守的時間估算，尚未根據真實地點計算步行距離。人潮為示範數據，非 AI 預測。</p>';
};
}
page();