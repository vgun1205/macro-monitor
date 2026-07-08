// MI 아카이브 자체완결형 HTML — 데이터(JSON) + 검색 UI를 한 파일에 담아 오프라인 검색 가능.
// 외부 리소스/네트워크 없이 브라우저에서 바로 열림(회사 내부망·오프라인 대응).
// 기능: 제목 클릭=홈(초기화), 날짜=아이폰식 휠 스크롤, 수록 기간 표기.

const KIND_LABEL = { fss_report: "금감원·보도", knia_report: "손보협회·보도", knia_notice: "손보협회·공지", news: "뉴스", global: "글로벌" };

export function buildArchiveHtml(rows = [], meta = {}) {
  const data = rows.map((r) => ({
    d: r.pub_date ? String(r.pub_date).slice(0, 10) : "",
    r: r.region || "",
    k: r.kind || "",
    s: r.source || "",
    t: r.title_ko || r.title || "",
    to: r.title_ko ? (r.title || "") : "",
    m: r.summary || "",
    p: r.preview || "",
    l: r.link || "",
  }));
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const gen = meta.generatedAt || "";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MI 아카이브${gen ? ` (${gen})` : ""}</title>
<style>
 :root{--tc:#147b8c}
 *{box-sizing:border-box}
 body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#1a1d23;margin:0;background:#f4f6f8}
 .wrap{max-width:960px;margin:0 auto;padding:18px 14px 60px}
 h1{font-size:22px;margin:0 0 2px;cursor:pointer;display:inline-block}
 h1:hover{color:var(--tc)}
 .sub{color:#6b7280;font-size:12px;margin:0 0 12px}
 .bar{position:sticky;top:0;z-index:5;background:#f4f6f8;padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #e3e7ec}
 .bar input#q,.bar select{padding:7px 9px;border:1px solid #d4d8de;border-radius:6px;font-size:13px;background:#fff}
 #q{flex:1;min-width:170px}
 .datebtn{padding:7px 10px;border:1px solid #d4d8de;border-radius:6px;font-size:13px;background:#fff;cursor:pointer;white-space:nowrap}
 .cnt{font-size:12px;color:#6b7280;margin-left:auto}
 .card{border:1px solid #e3e7ec;border-radius:8px;background:#fff;padding:9px 13px;margin:8px 0;cursor:pointer}
 .tag{font-size:11px;font-weight:700;margin-right:6px}
 .ti{font-size:14px;font-weight:600}
 .mt{font-size:12px;color:#9aa0ab;margin-top:2px}
 .bd{font-size:12.5px;color:#3a3f47;line-height:1.7;margin-top:7px;white-space:pre-wrap;display:none}
 .card.open .bd{display:block}
 a{color:var(--tc)}
 .fss{color:#1d4ed8}.knia{color:#d97706}.news{color:#147b8c}.global{color:#8a5a1f}
 /* iOS 휠 데이트피커 */
 .ov{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:flex-end;justify-content:center;z-index:20}
 .ov.on{display:flex}
 .sheet{background:#fff;width:100%;max-width:420px;border-radius:16px 16px 0 0;padding:12px 14px 16px}
 .sheet h3{margin:2px 0 4px;font-size:15px;text-align:center}
 .whead{display:flex;gap:6px;color:#9aa0ab;font-size:11px;text-align:center}
 .whead div{flex:1}
 .wheels{position:relative;display:flex;gap:6px;touch-action:pan-y}
 .wcol{height:180px;overflow-y:scroll;scroll-snap-type:y mandatory;flex:1;text-align:center;-webkit-overflow-scrolling:touch;scrollbar-width:none}
 .wcol::-webkit-scrollbar{display:none}
 .witem{height:36px;line-height:36px;scroll-snap-align:start;font-size:17px}
 .witem.sp{scroll-snap-align:none}
 .band{position:absolute;left:0;right:0;top:72px;height:36px;border-top:1px solid var(--tc);border-bottom:1px solid var(--tc);pointer-events:none;background:rgba(20,123,140,.07)}
 .sbtns{display:flex;gap:8px;margin-top:12px}
 .sbtns button{flex:1;padding:11px;border-radius:9px;border:1px solid #d4d8de;background:#fff;font-size:14px;cursor:pointer}
 .sbtns .ok{background:var(--tc);color:#fff;border-color:var(--tc);font-weight:700}
</style></head><body><div class="wrap">
<h1 id="home">MI 아카이브</h1>
<p class="sub" id="sub"></p>
<div class="bar">
 <input id="q" placeholder="키워드 (예: 경과조치, 전산장애, K-ICS)">
 <button class="datebtn" id="bFrom">부터: 전체</button>
 <button class="datebtn" id="bTo">까지: 전체</button>
 <select id="rg"><option value="">전체</option><option value="domestic">국내</option><option value="global">글로벌</option></select>
 <span class="cnt" id="cnt"></span>
</div>
<div id="list"></div>
</div>
<div class="ov" id="ov"><div class="sheet">
 <h3 id="shTitle">시작일</h3>
 <div class="whead"><div>년</div><div>월</div><div>일</div></div>
 <div class="wheels"><div class="wcol" id="cy"></div><div class="wcol" id="cm"></div><div class="wcol" id="cd"></div><div class="band"></div></div>
 <div class="sbtns"><button id="wClear">전체(비움)</button><button id="wCancel">취소</button><button class="ok" id="wOk">확인</button></div>
</div></div>
<script>
var DATA=${json};
var KL=${JSON.stringify(KIND_LABEL)};
var CLS={fss_report:'fss',knia_report:'knia',knia_notice:'knia',news:'news',global:'global'};
var IH=36;
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function pad2(n){return (n<10?'0':'')+n;}
// 수록 기간
var ds=DATA.map(function(a){return a.d;}).filter(Boolean).sort();
var MIND=ds[0]||'', MAXD=ds[ds.length-1]||'';
var minY=MIND?+MIND.slice(0,4):2026, maxY=MAXD?+MAXD.slice(0,4):2026;
document.getElementById('sub').textContent='위험관리 MI 누적 기사 · 오프라인 검색 · 수록 기간 '+(MIND||'-')+' ~ '+(MAXD||'-')+' · 총 '+DATA.length+'건'+(${JSON.stringify(gen)}?' · 생성 '+${JSON.stringify(gen)}:'');
// 필터 상태
var F={q:'',from:'',to:'',rg:''};
function render(){
 var out=[], n=0;
 for(var i=0;i<DATA.length;i++){var a=DATA[i];
  if(F.rg&&a.r!==F.rg)continue;
  if(F.from&&a.d&&a.d<F.from)continue;
  if(F.to&&a.d&&a.d>F.to)continue;
  if(F.q){var hay=(a.t+' '+a.to+' '+a.s+' '+a.m+' '+a.p).toLowerCase(); if(hay.indexOf(F.q)<0)continue;}
  n++;
  var body=(a.m?('■ 요약: '+a.m+'\\n\\n'):'')+(a.p||'')+(a.p?'…':'');
  out.push('<div class="card" onclick="this.classList.toggle(\\'open\\')">'
   +'<div><span class="tag '+(CLS[a.k]||'news')+'">['+(KL[a.k]||a.k)+']</span><span class="ti">'+esc(a.t)+'</span></div>'
   +'<div class="mt">'+esc(a.d)+' · '+esc(a.s)+(a.l?' · <a href="'+esc(a.l)+'" target="_blank" onclick="event.stopPropagation()">원문 ▶</a>':'')+(a.to?' · <span style="color:#aeb3bb">'+esc(a.to)+'</span>':'')+'</div>'
   +'<div class="bd">'+esc(body)+'</div></div>');
 }
 document.getElementById('cnt').textContent=n+' / '+DATA.length+' 건';
 document.getElementById('list').innerHTML=out.join('')||'<p style="color:#9aa0ab">결과가 없습니다.</p>';
}
function updateBtns(){document.getElementById('bFrom').textContent='부터: '+(F.from||'전체');document.getElementById('bTo').textContent='까지: '+(F.to||'전체');}
// ── 휠 데이트피커 ──
var ov=document.getElementById('ov'), cy=document.getElementById('cy'), cm=document.getElementById('cm'), cd=document.getElementById('cd'), curField=null;
function fillCol(col,vals,selIdx){
 var h=''; h+='<div class="witem sp"></div><div class="witem sp"></div>';
 for(var i=0;i<vals.length;i++)h+='<div class="witem">'+vals[i]+'</div>';
 h+='<div class="witem sp"></div><div class="witem sp"></div>';
 col.innerHTML=h; col._vals=vals;
 setTimeout(function(){col.scrollTop=Math.max(0,selIdx)*IH;},0);
}
function readCol(col){return Math.max(0,Math.min((col._vals||[]).length-1,Math.round(col.scrollTop/IH)));}
function rangeArr(a,b){var r=[];for(var i=a;i<=b;i++)r.push(i);return r;}
function openWheel(field){
 curField=field; var cur=F[field];
 var y=cur?+cur.slice(0,4):maxY, m=cur?+cur.slice(5,7):1, dd=cur?+cur.slice(8,10):1;
 var Y=rangeArr(minY,maxY);
 fillCol(cy,Y,Y.indexOf(y)<0?Y.length-1:Y.indexOf(y));
 fillCol(cm,rangeArr(1,12),m-1);
 fillCol(cd,rangeArr(1,31),dd-1);
 document.getElementById('shTitle').textContent=(field==='from'?'시작일':'종료일');
 ov.classList.add('on');
}
document.getElementById('wOk').onclick=function(){
 var y=cy._vals[readCol(cy)], m=cm._vals[readCol(cm)], d=cd._vals[readCol(cd)];
 var dim=new Date(y,m,0).getDate(); if(d>dim)d=dim;
 F[curField]=y+'-'+pad2(m)+'-'+pad2(d); updateBtns(); ov.classList.remove('on'); render();
};
document.getElementById('wClear').onclick=function(){F[curField]=''; updateBtns(); ov.classList.remove('on'); render();};
document.getElementById('wCancel').onclick=function(){ov.classList.remove('on');};
ov.onclick=function(e){if(e.target===ov)ov.classList.remove('on');};
document.getElementById('bFrom').onclick=function(){openWheel('from');};
document.getElementById('bTo').onclick=function(){openWheel('to');};
// 입력·필터
document.getElementById('q').addEventListener('input',function(){F.q=this.value.trim().toLowerCase();render();});
document.getElementById('rg').addEventListener('change',function(){F.rg=this.value;render();});
// 제목 클릭 = 홈(초기화)
document.getElementById('home').onclick=function(){F={q:'',from:'',to:'',rg:''};document.getElementById('q').value='';document.getElementById('rg').value='';updateBtns();render();window.scrollTo(0,0);};
render();
</script></body></html>`;
}
