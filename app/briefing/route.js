// 주간 위험관리 AI 브리핑 — 웹 페이지(메일 본문 버튼에서 열림). 최신 저장본을 표시.
import { getRecentBriefings } from "../../lib/briefing.js";

export const dynamic = "force-dynamic";

const wkLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}월 ${Math.ceil(Number(iso.slice(8, 10)) / 7)}주차` : "");

export async function GET() {
  let list = [];
  try { list = await getRecentBriefings(6); } catch {}
  const cur = list[0];
  const tabs = list.map((b, i) =>
    `<button class="wk${i === 0 ? " on" : ""}" onclick="show(${i})">${["이번 주", "지난 주", "2주 전", "3주 전", "4주 전", "5주 전"][i] || b.week}<br><span>${wkLabel(b.to)}</span></button>`
  ).join("");
  const data = JSON.stringify(list.map((b) => ({ h: b.inner || "", d: `${b.from || ""} ~ ${b.to || ""}`, w: wkLabel(b.to) }))).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주간 위험관리 AI 브리핑</title>
<style>
 body{margin:0;background:#eef1f5;font-family:'Pretendard','Malgun Gothic',sans-serif;color:#0b1622;-webkit-text-size-adjust:100%}
 .hero{background:#0e3a48;background-image:linear-gradient(135deg,#0a1a2e,#0f766e);color:#fff;padding:26px 18px}
 .hin{max-width:760px;margin:0 auto}
 h1{font-size:22px;margin:0}
 .sub{color:#bcd7de;font-size:13px;margin-top:6px}
 .wrap{max-width:760px;margin:0 auto;padding:16px}
 .wks{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
 .wk{font-size:12px;padding:7px 12px;border:1px solid #d6dce4;border-radius:12px;background:#fff;cursor:pointer;color:#334155;text-align:center;line-height:1.3}
 .wk span{color:#94a3b8;font-size:10px}
 .wk.on{background:#0f766e;color:#fff;border-color:#0f766e}
 .wk.on span{color:#cdeee9}
 .card{background:#fff;border:1px solid #e5e9f0;border-left:5px solid #0f766e;border-radius:16px;padding:20px 22px;box-shadow:0 2px 12px rgba(11,22,34,.06)}
 .rg{color:#94a3b8;font-size:12px;margin-bottom:8px}
</style></head><body>
<div class="hero"><div class="hin"><h1>🧭 주간 위험관리 AI 브리핑</h1><div class="sub" id="sub"></div></div></div>
<div class="wrap">
 <div class="wks">${tabs}</div>
 <div class="card"><div class="rg" id="rg"></div><div id="body">${cur ? cur.inner : "브리핑 준비 중입니다."}</div></div>
</div>
<script>
var B=${data};
function show(i){var b=B[i];if(!b)return;document.getElementById('body').innerHTML=b.h;document.getElementById('rg').textContent=b.w+' · '+b.d;document.getElementById('sub').textContent=b.w+' ('+b.d+')';var t=document.querySelectorAll('.wk');for(var k=0;k<t.length;k++)t[k].classList.toggle('on',k===i);}
if(B.length)show(0);
</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
