// MI 아카이브 자체완결형 HTML — 데이터(JSON) + 검색 UI를 한 파일에 담아 오프라인 검색 가능.
// 구성: 🧭 주간 AI 브리핑(접이식 + 주차별 히스토리 버튼) / 🔎 기사 검색(테두리 박스, 항상 펼침).
// 필터: 키워드 + 기간 원클릭 버튼(전체/1주/1개월/3개월/올해) + 구분 버튼(전체/국내/글로벌). 페이지네이션 + 맨 위로.
// meta.briefings = [{week, from, to, inner}] 최신순.

import { H2C_B64 } from "./h2c.js";
const KIND_LABEL = { fss_report: "금감원·보도", knia_report: "손보협회·보도", knia_notice: "손보협회·공지", news: "뉴스", global: "글로벌" };
// html2canvas 라이브러리(내장) — 오프라인 이미지 캡처용. </script> 시퀀스만 무해화.
const H2C_LIB = Buffer.from(H2C_B64, "base64").toString("utf8").replace(/<\/script/gi, "<\\/script");

export function buildArchiveHtml(rows = [], meta = {}) {
  const data = rows.map((r) => ({
    d: r.pub_date ? String(r.pub_date).slice(0, 10) : "",
    r: r.region || "", k: r.kind || "", s: r.source || "",
    t: r.title_ko || r.title || "", to: r.title_ko ? (r.title || "") : "",
    m: r.summary || "", p: r.preview || "", l: r.link || "",
  }));
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const briefs = (meta.briefings || []).map((b) => ({ d: `${b.from || ""} ~ ${b.to || ""}`, h: b.inner || "" }));
  const briefsJson = JSON.stringify(briefs).replace(/</g, "\\u003c");
  const gen = meta.generatedAt || "";
  const briefCard = briefs.length ? `
 <div class="box brief collapsed" id="brief">
  <div class="bh" onclick="document.getElementById('brief').classList.toggle('collapsed')">🧭 주간 위험관리 AI 브리핑<span class="bhd" id="bwlab"></span><span class="bchev">▾</span></div>
  <div class="bbody"><div class="wksel" id="wksel"></div><div id="briefContent"></div></div>
 </div>` : "";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MI 아카이브${gen ? ` (${gen})` : ""}</title>
<style>
 :root{--ink:#0b1622;--acc:#14b8a6;--acc2:#5eead4;--mut:#64748b}
 *{box-sizing:border-box}
 html,body{margin:0}
 body{font-family:'Pretendard','Malgun Gothic','맑은 고딕',-apple-system,sans-serif;color:var(--ink);background:#eef1f5;font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%}
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
 .wrap{max-width:1040px;margin:0 auto;padding:0 18px 80px}
 .box{background:#fff;border:1px solid #e5e9f0;border-left:5px solid var(--acc);border-radius:16px;padding:20px 24px;margin:16px 0;box-shadow:0 2px 12px rgba(11,22,34,.06)}
 .bh{font-size:19px;font-weight:800;cursor:pointer;user-select:none}
 .bhd{font-size:12.5px;color:var(--mut);font-weight:500;margin-left:6px}
 .bchev{float:right;color:var(--acc);transition:transform .2s;font-size:16px}
 .brief.collapsed .bchev{transform:rotate(-90deg)}
 .brief.collapsed .bbody{display:none}
 .wksel{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 6px}
 .wk{font-size:12.5px;padding:6px 11px;border:1px solid #d6dce4;border-radius:999px;background:#f8fafc;cursor:pointer;color:#334155}
 .wk .wkd{color:#94a3b8;font-size:11px}
 .wk.on{background:var(--acc);color:#fff;border-color:var(--acc)}
 .wk.on .wkd{color:#d7f5f0}
 .bt{margin:11px 0}.btt{font-size:16px}.btb{font-size:14.5px;color:#334155;line-height:1.85;margin-top:3px}
 .bw{margin-top:14px;padding-top:12px;border-top:1px dashed #e2e8f0}
 .bwh{font-size:13.5px;font-weight:700;color:#b45309;margin-bottom:5px}
 .bwi{font-size:14px;color:#475569;line-height:1.75}
 .bf{font-size:11.5px;color:#94a3b8;margin-top:14px}
 /* 기사 검색 */
 .sh{font-size:19px;font-weight:800;margin-bottom:10px}
 .bar{position:sticky;top:0;z-index:8;background:#fff;padding:8px 0}
 #q{width:100%;padding:13px 16px;border:1.5px solid #d6dce4;border-radius:12px;font-size:16px;background:#fff}
 #q:focus{outline:none;border-color:var(--acc)}
 .filters{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;margin:12px 0 4px}
 .fg{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
 .fl{font-size:13px;color:var(--mut);font-weight:700;margin-right:2px}
 .ff,.fr{font-size:13.5px;padding:7px 13px;border:1.5px solid #d6dce4;border-radius:999px;background:#fff;cursor:pointer;color:#334155}
 .ff:hover,.fr:hover{border-color:var(--acc)}
 .ff.on,.fr.on{background:var(--acc);color:#fff;border-color:var(--acc);font-weight:700}
 .cnt{font-size:14px;color:var(--mut);margin-left:auto;font-weight:600}
 .card{background:#fff;border:1px solid #e5e9f0;border-radius:14px;padding:16px 20px;margin:12px 0;cursor:pointer;box-shadow:0 1px 5px rgba(11,22,34,.04);transition:.15s}
 .card:hover{box-shadow:0 5px 16px rgba(11,22,34,.09)}
 .tag{font-size:12.5px;font-weight:800;margin-right:8px;letter-spacing:.3px}
 .ti{font-size:19px;font-weight:700;line-height:1.5}
 .mt{font-size:14px;color:var(--mut);margin-top:7px}
 .bd{font-size:15.5px;color:#334155;line-height:2;margin-top:14px;white-space:pre-wrap;display:none}
 .card.open .bd{display:block}
 a{color:var(--acc)}
 .fss{color:#2563eb}.knia{color:#ea8207}.news{color:#0d9488}.global{color:#a16207}
 .pager{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:20px}
 .pg{min-width:40px;padding:9px 13px;border:1.5px solid #d6dce4;border-radius:10px;background:#fff;font-size:14px;cursor:pointer;color:#334155}
 .pg:hover:not(:disabled){border-color:var(--acc)}
 .pg.on{background:var(--acc);color:#fff;border-color:var(--acc);font-weight:700}
 .pg:disabled{opacity:.4;cursor:default}
 .pgd{padding:9px 2px;color:#94a3b8}
 #toTop{position:fixed;right:22px;bottom:22px;width:52px;height:52px;border-radius:50%;border:none;background:var(--acc);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 16px rgba(11,22,34,.28);display:none;z-index:40}
 #toTop.show{display:block}
 #toTop:hover{background:#0f9488}
 #capBtn{position:fixed;right:22px;bottom:84px;height:46px;padding:0 18px;border-radius:23px;border:none;background:#0b1622;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(11,22,34,.28);z-index:40}
 #capBtn:hover{background:#1e2a3a}
 #capBtn:disabled{opacity:.6;cursor:wait}
</style></head><body>
<div class="hero"><div class="hin">
 <h1 id="home">MI 아카이브</h1>
 <p class="sub" id="sub"></p>
 <div class="kw" id="kw"><span class="lb">🔑 주요 키워드</span></div>
</div></div>
<div class="wrap">
${briefCard}
 <div class="box" id="searchBox">
  <div class="sh">🔎 기사 검색</div>
  <div class="bar"><input id="q" placeholder="키워드로 검색 (예: 경과조치, 전산장애, 삼성화재)"></div>
  <div class="filters">
   <div class="fg"><span class="fl">기간</span>
    <button class="ff on" data-pd="all">전체</button>
    <button class="ff" data-pd="7">최근 1주</button>
    <button class="ff" data-pd="30">최근 1개월</button>
    <button class="ff" data-pd="90">최근 3개월</button>
    <button class="ff" data-pd="year">올해</button>
   </div>
   <div class="fg"><span class="fl">구분</span>
    <button class="fr on" data-cat="all">전체</button>
    <button class="fr" data-cat="official">금감원·협회</button>
    <button class="fr" data-cat="news">국내뉴스</button>
    <button class="fr" data-cat="global">글로벌</button>
   </div>
   <span class="cnt" id="cnt"></span>
  </div>
  <div id="list"></div>
  <div class="pager" id="pager"></div>
 </div>
</div>
<button id="capBtn" title="현재 화면을 이미지로 저장">📷 이미지 저장</button>
<button id="toTop" title="맨 위로">↑</button>
<script>${H2C_LIB}</script>
<script>
var DATA=${json};
var BRIEFS=${briefsJson};
var KL=${JSON.stringify(KIND_LABEL)};
var CLS={fss_report:'fss',knia_report:'knia',knia_notice:'knia',news:'news',global:'global'};
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
var ds=DATA.map(function(a){return a.d;}).filter(Boolean).sort();
var MIND=ds[0]||'', MAXD=ds[ds.length-1]||'';
var ANCHOR=MAXD||${JSON.stringify(gen)}||'';
document.getElementById('sub').textContent='위험관리 MI 누적 기사 · 오프라인 검색 · 수록 기간 '+(MIND||'-')+' ~ '+(MAXD||'-')+' · 총 '+DATA.length+'건'+(${JSON.stringify(gen)}?' · 생성 '+${JSON.stringify(gen)}:'');
// 주간 브리핑 히스토리 버튼
(function(){
 var sel=document.getElementById('wksel'); if(!sel||!BRIEFS.length)return;
 var cont=document.getElementById('briefContent'), lab=document.getElementById('bwlab'), LB=['이번 주','지난 주','2주 전','3주 전','4주 전'];
 function show(i){ cont.innerHTML=BRIEFS[i].h; lab.textContent=' ('+BRIEFS[i].d+')'; var b=sel.querySelectorAll('.wk'); for(var k=0;k<b.length;k++)b[k].classList.toggle('on',k===i); }
 BRIEFS.forEach(function(b,i){ var el=document.createElement('span'); el.className='wk'; el.innerHTML=(LB[i]||('W-'+i))+' <span class="wkd">'+b.d+'</span>'; el.onclick=function(){show(i);}; sel.appendChild(el); });
 show(0);
})();
var F={q:'',from:'',cat:'all'}, PAGE=1, PER=20;
function pass(a){
 if(F.cat==='news'&&a.k!=='news')return false;
 if(F.cat==='official'&&!(a.k.indexOf('fss_')===0||a.k.indexOf('knia_')===0))return false;
 if(F.cat==='global'&&a.r!=='global')return false;
 if(F.from&&a.d&&a.d<F.from)return false;
 if(F.q){var hay=(a.t+' '+a.to+' '+a.s+' '+a.m+' '+a.p).toLowerCase(); if(hay.indexOf(F.q)<0)return false;}
 return true;
}
function cardHtml(a){
 var body=a.m?a.m:(a.p?a.p+'…':'(요약 없음 — 원문 링크 참조)');
 return '<div class="card" onclick="this.classList.toggle(\\'open\\')">'
  +'<div><span class="tag '+(CLS[a.k]||'news')+'">['+(KL[a.k]||a.k)+']</span><span class="ti">'+esc(a.t)+'</span></div>'
  +'<div class="mt">'+esc(a.d)+' · '+esc(a.s)+(a.l?' · <a href="'+esc(a.l)+'" target="_blank" onclick="event.stopPropagation()">원문 ▶</a>':'')+(a.to?' · <span style="color:#94a3b8">'+esc(a.to)+'</span>':'')+'</div>'
  +'<div class="bd">'+esc(body)+'</div></div>';
}
function render(){
 var filt=[]; for(var i=0;i<DATA.length;i++) if(pass(DATA[i])) filt.push(DATA[i]);
 var total=filt.length, pages=Math.max(1,Math.ceil(total/PER));
 if(PAGE>pages)PAGE=pages; if(PAGE<1)PAGE=1;
 var start=(PAGE-1)*PER, slice=filt.slice(start,start+PER);
 document.getElementById('cnt').textContent=(total<DATA.length?total+'건 (전체 '+DATA.length+')':total+'건');
 document.getElementById('list').innerHTML=slice.map(cardHtml).join('')||'<p style="color:#94a3b8;font-size:16px;padding:20px 0">결과가 없습니다.</p>';
 renderPager(pages);
}
function reFilter(){PAGE=1;render();}
function renderPager(pages){
 var el=document.getElementById('pager'); if(!el)return;
 if(pages<=1){el.innerHTML='';return;}
 var h='<button class="pg" data-p="'+(PAGE-1)+'"'+(PAGE<=1?' disabled':'')+'>‹ 이전</button>';
 var s=Math.max(1,PAGE-2), e=Math.min(pages,PAGE+2);
 if(s>1){h+='<button class="pg" data-p="1">1</button>'; if(s>2)h+='<span class="pgd">…</span>';}
 for(var p=s;p<=e;p++)h+='<button class="pg'+(p===PAGE?' on':'')+'" data-p="'+p+'">'+p+'</button>';
 if(e<pages){if(e<pages-1)h+='<span class="pgd">…</span>'; h+='<button class="pg" data-p="'+pages+'">'+pages+'</button>';}
 h+='<button class="pg" data-p="'+(PAGE+1)+'"'+(PAGE>=pages?' disabled':'')+'>다음 ›</button>';
 el.innerHTML=h;
 var bs=el.querySelectorAll('button.pg');
 for(var i=0;i<bs.length;i++)bs[i].onclick=function(){ if(this.disabled)return; PAGE=+this.getAttribute('data-p'); render(); document.getElementById('searchBox').scrollIntoView({behavior:'smooth',block:'start'}); };
}
function pad2(n){return (n<10?'0':'')+n;}
function daysAgo(a,d){var t=new Date(a+'T12:00:00');t.setDate(t.getDate()-d);return t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());}
// 기간·구분 버튼
(function(){
 var fbs=document.querySelectorAll('.ff'), rbs=document.querySelectorAll('.fr');
 for(var i=0;i<fbs.length;i++)fbs[i].onclick=function(){
  for(var j=0;j<fbs.length;j++)fbs[j].classList.remove('on'); this.classList.add('on');
  var pd=this.getAttribute('data-pd');
  if(pd==='all')F.from='';
  else if(pd==='year')F.from=(ANCHOR?ANCHOR.slice(0,4):'2026')+'-01-01';
  else F.from=ANCHOR?daysAgo(ANCHOR,+pd):'';
  reFilter();
 };
 for(var k=0;k<rbs.length;k++)rbs[k].onclick=function(){
  for(var j=0;j<rbs.length;j++)rbs[j].classList.remove('on'); this.classList.add('on');
  F.cat=this.getAttribute('data-cat'); reFilter();
 };
})();
function resetFilterBtns(){
 var fbs=document.querySelectorAll('.ff'); for(var i=0;i<fbs.length;i++)fbs[i].classList.toggle('on',i===0);
 var rbs=document.querySelectorAll('.fr'); for(var j=0;j<rbs.length;j++)rbs[j].classList.toggle('on',j===0);
}
function clearChips(){var a=document.querySelectorAll('.chip.on');for(var i=0;i<a.length;i++)a[i].classList.remove('on');}
document.getElementById('q').addEventListener('input',function(){F.q=this.value.trim().toLowerCase();clearChips();reFilter();});
document.getElementById('home').onclick=function(){F={q:'',from:'',cat:'all'};document.getElementById('q').value='';clearChips();resetFilterBtns();reFilter();window.scrollTo(0,0);};
var KEYWORDS=['지급여력','K-ICS','경과조치','자본확충','신종자본증권','IFRS17','할인율','내부통제','금감원 검사','업무연속성','전산장애','제3자','위탁','클라우드','재보험','삼성화재','삼성생명','Solvency','ICS'];
(function(){var box=document.getElementById('kw');KEYWORDS.forEach(function(k){var c=document.createElement('span');c.className='chip';c.textContent=k;c.onclick=function(){var on=c.classList.contains('on');clearChips();if(on){document.getElementById('q').value='';F.q='';}else{c.classList.add('on');document.getElementById('q').value=k;F.q=k.toLowerCase();}reFilter();window.scrollTo(0,0);};box.appendChild(c);});})();
var toTop=document.getElementById('toTop');
window.addEventListener('scroll',function(){ if(window.pageYOffset>400)toTop.classList.add('show'); else toTop.classList.remove('show'); });
toTop.onclick=function(){window.scrollTo({top:0,behavior:'smooth'});};
// 화면 이미지 저장(html2canvas 내장) — 현재 페이지 전체를 PNG로
var capBtn=document.getElementById('capBtn');
capBtn.onclick=function(){
 if(typeof html2canvas==='undefined'){alert('캡처 모듈 로드 실패');return;}
 capBtn.disabled=true; var old=capBtn.textContent; capBtn.textContent='캡처 중…';
 var hideT=toTop.style.display, hideC=capBtn.style.visibility; toTop.style.display='none'; capBtn.style.visibility='hidden';
 html2canvas(document.body,{backgroundColor:'#eef1f5',scale:2,useCORS:true,scrollX:0,scrollY:-window.scrollY,windowWidth:document.documentElement.scrollWidth}).then(function(canvas){
  toTop.style.display=hideT; capBtn.style.visibility=hideC; capBtn.disabled=false; capBtn.textContent=old;
  var a=document.createElement('a'); a.download='MI_아카이브_'+(MAXD||'')+'.png'; a.href=canvas.toDataURL('image/png'); a.click();
 }).catch(function(e){ toTop.style.display=hideT; capBtn.style.visibility=hideC; capBtn.disabled=false; capBtn.textContent=old; alert('캡처 실패: '+e.message); });
};
render();
</script></body></html>`;
}
