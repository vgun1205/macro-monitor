// MI 아카이브 자체완결형 HTML — 데이터(JSON) + 검색 UI를 한 파일에 담아 오프라인 검색 가능.
// 외부 리소스/네트워크 없이 브라우저에서 바로 열림(회사 내부망·오프라인 대응).
// 스타일: 대형 타이포·넉넉한 여백·다크 히어로 밴드. 기능: 홈복귀·아이폰식 날짜 휠·키워드 칩·수록기간.

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
 :root{--ink:#0b1622;--acc:#14b8a6;--acc2:#5eead4;--mut:#64748b}
 *{box-sizing:border-box}
 html,body{margin:0}
 body{font-family:'Pretendard','Malgun Gothic','맑은 고딕',-apple-system,sans-serif;color:var(--ink);background:#eef1f5;font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%}
 /* 히어로 밴드 */
 .hero{background:linear-gradient(135deg,#0a1a2e 0%,#103d4c 55%,#0f766e 130%);color:#fff;padding:38px 22px 26px}
 .hin{max-width:1040px;margin:0 auto}
 h1{font-size:34px;font-weight:800;letter-spacing:-.8px;margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:10px}
 h1:before{content:"";width:12px;height:30px;border-radius:4px;background:linear-gradient(var(--acc2),var(--acc))}
 .sub{color:#bcd7de;font-size:14px;margin:12px 0 18px;letter-spacing:.2px}
 .kw{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
 .kw .lb{font-size:13px;color:#8fc3cd;margin-right:4px;font-weight:600}
 .chip{font-size:14px;padding:7px 14px;border-radius:999px;cursor:pointer;user-select:none;background:rgba(255,255,255,.11);color:#eafcff;border:1px solid rgba(255,255,255,.2);transition:.15s}
 .chip:hover{background:rgba(255,255,255,.2)}
 .chip.on{background:var(--acc2);color:#053b37;border-color:var(--acc2);font-weight:700}
 /* 본문 */
 .wrap{max-width:1040px;margin:0 auto;padding:0 18px 80px}
 .bar{position:sticky;top:0;z-index:8;background:#eef1f5;padding:16px 0 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 #q{flex:1;min-width:220px;padding:13px 16px;border:1.5px solid #d6dce4;border-radius:12px;font-size:16px;background:#fff}
 #q:focus{outline:none;border-color:var(--acc)}
 .datebtn,#rg{padding:12px 15px;border:1.5px solid #d6dce4;border-radius:12px;font-size:15px;background:#fff;cursor:pointer;white-space:nowrap}
 .cnt{font-size:14px;color:var(--mut);margin-left:auto;font-weight:600}
 .card{background:#fff;border:1px solid #e5e9f0;border-radius:18px;padding:20px 24px;margin:14px 0;cursor:pointer;box-shadow:0 2px 10px rgba(11,22,34,.05);transition:.15s}
 .card:hover{box-shadow:0 6px 20px rgba(11,22,34,.1);transform:translateY(-1px)}
 .tag{font-size:12.5px;font-weight:800;margin-right:8px;letter-spacing:.3px}
 .ti{font-size:19px;font-weight:700;line-height:1.5}
 .mt{font-size:14px;color:var(--mut);margin-top:7px}
 .bd{font-size:15.5px;color:#334155;line-height:2;margin-top:14px;white-space:pre-wrap;display:none}
 .card.open .bd{display:block}
 a{color:var(--acc)}
 /* 주간 AI 브리핑 */
 .brief{background:#fff;border:1px solid #e5e9f0;border-left:5px solid var(--acc);border-radius:16px;padding:20px 24px;margin:18px 0 6px;box-shadow:0 2px 12px rgba(11,22,34,.06)}
 .brief .bh{cursor:pointer;user-select:none}
 .bchev{float:right;color:var(--acc);transition:transform .2s;font-size:16px}
 .brief.collapsed .bchev{transform:rotate(-90deg)}
 .brief.collapsed{padding-bottom:18px}
 .brief.collapsed .bbody{display:none}
 .bh{font-size:19px;font-weight:800}
 .bhd{font-size:12.5px;color:var(--mut);font-weight:500}
 .bt{margin:11px 0}
 .btt{font-size:16px}
 .btb{font-size:14.5px;color:#334155;line-height:1.85;margin-top:3px}
 .bw{margin-top:14px;padding-top:12px;border-top:1px dashed #e2e8f0}
 .bwh{font-size:13.5px;font-weight:700;color:#b45309;margin-bottom:5px}
 .bwi{font-size:14px;color:#475569;line-height:1.75}
 .bf{font-size:11.5px;color:#94a3b8;margin-top:14px}
 .fss{color:#2563eb}.knia{color:#ea8207}.news{color:#0d9488}.global{color:#a16207}
 /* iOS 휠 데이트피커 */
 .ov{position:fixed;inset:0;background:rgba(6,12,20,.45);display:none;align-items:flex-end;justify-content:center;z-index:30}
 .ov.on{display:flex}
 .sheet{background:#fff;width:100%;max-width:440px;border-radius:22px 22px 0 0;padding:16px 18px 22px}
 .sheet h3{margin:2px 0 6px;font-size:17px;text-align:center;font-weight:800}
 .whead{display:flex;gap:8px;color:var(--mut);font-size:12px;text-align:center;font-weight:600}
 .whead div{flex:1}
 .wheels{position:relative;display:flex;gap:8px;touch-action:pan-y}
 .wcol{height:220px;overflow-y:scroll;scroll-snap-type:y mandatory;flex:1;text-align:center;-webkit-overflow-scrolling:touch;scrollbar-width:none}
 .wcol::-webkit-scrollbar{display:none}
 .witem{height:44px;line-height:44px;scroll-snap-align:start;font-size:20px}
 .witem.sp{scroll-snap-align:none}
 .band{position:absolute;left:0;right:0;top:88px;height:44px;border-top:2px solid var(--acc);border-bottom:2px solid var(--acc);pointer-events:none;background:rgba(20,184,166,.08);border-radius:8px}
 .sbtns{display:flex;gap:10px;margin-top:16px}
 .sbtns button{flex:1;padding:14px;border-radius:12px;border:1.5px solid #d6dce4;background:#fff;font-size:15px;cursor:pointer;font-weight:600}
 .sbtns .ok{background:var(--acc);color:#fff;border-color:var(--acc)}
</style></head><body>
<div class="hero"><div class="hin">
 <h1 id="home">MI 아카이브</h1>
 <p class="sub" id="sub"></p>
 <div class="kw" id="kw"><span class="lb">🔑 주요 키워드</span></div>
</div></div>
<div class="wrap">
 ${meta.briefingHtml || ""}
 <div class="bar">
  <input id="q" placeholder="키워드로 검색 (예: 경과조치, 전산장애, K-ICS)">
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
var IH=44;
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function pad2(n){return (n<10?'0':'')+n;}
var ds=DATA.map(function(a){return a.d;}).filter(Boolean).sort();
var MIND=ds[0]||'', MAXD=ds[ds.length-1]||'';
var minY=MIND?+MIND.slice(0,4):2026, maxY=MAXD?+MAXD.slice(0,4):2026;
document.getElementById('sub').textContent='위험관리 MI 누적 기사 · 오프라인 검색 · 수록 기간 '+(MIND||'-')+' ~ '+(MAXD||'-')+' · 총 '+DATA.length+'건'+(${JSON.stringify(gen)}?' · 생성 '+${JSON.stringify(gen)}:'');
var F={q:'',from:'',to:'',rg:''};
function render(){
 var out=[], n=0;
 for(var i=0;i<DATA.length;i++){var a=DATA[i];
  if(F.rg&&a.r!==F.rg)continue;
  if(F.from&&a.d&&a.d<F.from)continue;
  if(F.to&&a.d&&a.d>F.to)continue;
  if(F.q){var hay=(a.t+' '+a.to+' '+a.s+' '+a.m+' '+a.p).toLowerCase(); if(hay.indexOf(F.q)<0)continue;}
  n++;
  var body=a.m?a.m:(a.p?a.p+'…':'(요약 없음 — 원문 링크 참조)');
  out.push('<div class="card" onclick="this.classList.toggle(\\'open\\')">'
   +'<div><span class="tag '+(CLS[a.k]||'news')+'">['+(KL[a.k]||a.k)+']</span><span class="ti">'+esc(a.t)+'</span></div>'
   +'<div class="mt">'+esc(a.d)+' · '+esc(a.s)+(a.l?' · <a href="'+esc(a.l)+'" target="_blank" onclick="event.stopPropagation()">원문 ▶</a>':'')+(a.to?' · <span style="color:#94a3b8">'+esc(a.to)+'</span>':'')+'</div>'
   +'<div class="bd">'+esc(body)+'</div></div>');
 }
 document.getElementById('cnt').textContent=n+' / '+DATA.length+' 건';
 document.getElementById('list').innerHTML=out.join('')||'<p style="color:#94a3b8;font-size:16px;padding:20px 0">결과가 없습니다.</p>';
}
function updateBtns(){document.getElementById('bFrom').textContent='부터: '+(F.from||'전체');document.getElementById('bTo').textContent='까지: '+(F.to||'전체');}
var ov=document.getElementById('ov'), cy=document.getElementById('cy'), cm=document.getElementById('cm'), cd=document.getElementById('cd'), curField=null;
function fillCol(col,vals,selIdx){
 var h='<div class="witem sp"></div><div class="witem sp"></div>';
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
function clearChips(){var a=document.querySelectorAll('.chip.on');for(var i=0;i<a.length;i++)a[i].classList.remove('on');}
document.getElementById('q').addEventListener('input',function(){F.q=this.value.trim().toLowerCase();clearChips();render();});
document.getElementById('rg').addEventListener('change',function(){F.rg=this.value;render();});
document.getElementById('home').onclick=function(){F={q:'',from:'',to:'',rg:''};document.getElementById('q').value='';document.getElementById('rg').value='';clearChips();updateBtns();render();window.scrollTo(0,0);};
var KEYWORDS=['지급여력','K-ICS','경과조치','자본확충','신종자본증권','IFRS17','할인율','내부통제','금감원 검사','업무연속성','전산장애','제3자','위탁','클라우드','재보험','Solvency','ICS'];
(function(){var box=document.getElementById('kw');KEYWORDS.forEach(function(k){var c=document.createElement('span');c.className='chip';c.textContent=k;c.onclick=function(){var on=c.classList.contains('on');clearChips();if(on){document.getElementById('q').value='';F.q='';}else{c.classList.add('on');document.getElementById('q').value=k;F.q=k.toLowerCase();}render();window.scrollTo(0,0);};box.appendChild(c);});})();
render();
</script></body></html>`;
}
