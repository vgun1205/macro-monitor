// MI 아카이브 자체완결형 HTML — 데이터(JSON) + 검색 UI를 한 파일에 담아 오프라인 검색 가능.
// 외부 리소스/네트워크 없이 브라우저에서 바로 열림(회사 내부망·오프라인 대응).

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
  // </script> 안전 처리
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
 .wrap{max-width:960px;margin:0 auto;padding:20px 14px}
 h1{font-size:22px;margin:0 0 2px}
 .sub{color:#6b7280;font-size:12px;margin:0 0 14px}
 .bar{position:sticky;top:0;background:#f4f6f8;padding:8px 0;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #e3e7ec}
 .bar input,.bar select{padding:7px 9px;border:1px solid #d4d8de;border-radius:6px;font-size:13px}
 #q{flex:1;min-width:180px}
 .cnt{font-size:12px;color:#6b7280;margin-left:auto}
 .card{border:1px solid #e3e7ec;border-radius:8px;background:#fff;padding:9px 13px;margin:8px 0;cursor:pointer}
 .tag{font-size:11px;font-weight:700;margin-right:6px}
 .ti{font-size:14px;font-weight:600}
 .mt{font-size:12px;color:#9aa0ab;margin-top:2px}
 .bd{font-size:12.5px;color:#3a3f47;line-height:1.7;margin-top:7px;white-space:pre-wrap;display:none}
 .card.open .bd{display:block}
 a{color:var(--tc)}
 .fss{color:#1d4ed8}.knia{color:#d97706}.news{color:#147b8c}.global{color:#8a5a1f}
</style></head><body><div class="wrap">
<h1>MI 아카이브</h1>
<p class="sub">위험관리 MI 누적 기사 · 오프라인 검색(키워드·기간·구분) · 생성 ${gen}</p>
<div class="bar">
 <input id="q" placeholder="키워드 (예: 경과조치, 전산장애, K-ICS)">
 <input id="from" type="date"><input id="to" type="date">
 <select id="rg"><option value="">전체</option><option value="domestic">국내</option><option value="global">글로벌</option></select>
 <span class="cnt" id="cnt"></span>
</div>
<div id="list"></div>
</div>
<script>
var DATA=${json};
var KL=${JSON.stringify(KIND_LABEL)};
var CLS={fss_report:'fss',knia_report:'knia',knia_notice:'knia',news:'news',global:'global'};
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function render(){
 var q=document.getElementById('q').value.trim().toLowerCase();
 var f=document.getElementById('from').value, t=document.getElementById('to').value, rg=document.getElementById('rg').value;
 var out=[], n=0;
 for(var i=0;i<DATA.length;i++){var a=DATA[i];
  if(rg&&a.r!==rg)continue;
  if(f&&a.d&&a.d<f)continue;
  if(t&&a.d&&a.d>t)continue;
  if(q){var hay=(a.t+' '+a.to+' '+a.s+' '+a.m+' '+a.p).toLowerCase(); if(hay.indexOf(q)<0)continue;}
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
['q','from','to','rg'].forEach(function(id){var e=document.getElementById(id);e.addEventListener('input',render);e.addEventListener('change',render);});
render();
</script></body></html>`;
}
