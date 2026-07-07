// 글로벌 위험관리·보험사 자본 MI 수집 — 보험 전문매체 RSS(실제 기사 URL + 본문 제공).
// 구글뉴스는 링크가 암호화 리디렉트라 본문/실제URL을 못 얻어, 전문매체 RSS로 전환.
// 수집 후 enrichGlobal로 본문 추출, translateGlobal로 한글 제목·요약.

const FEEDS = [
  { url: "https://www.reinsurancene.ws/feed/", source: "Reinsurance News" },
  { url: "https://www.artemis.bm/feed/", source: "Artemis" },
];
// 위험관리·자본 관련성 필터(영문) — 전문매체라 대부분 통과하나 보수적으로 적용
const REL = /solvency|capital|ICS|IFRS|reserve|reinsur|prudential|EIOPA|PRA|RBC|risk|rating|catastrophe|\bILS\b|own funds|\bSCR\b|S&P|Fitch|Moody|AM Best|underwrit|operational resilience|\bDORA\b|business continuity|third[- ]party|outsourc|vendor|cyber|\bORSA\b/i;

const strip = (s) =>
  (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
// 잡음 제외: 주간 요약/팟캐스트/웨비나 등
const EXCLUDE = /best of artemis|week ending|podcast|webinar|on-demand/i;
const md = (d) => { const k = new Date(d.getTime() + 9 * 3600 * 1000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

export async function fetchGlobal(limit = 6) {
  const seen = new Set(), out = [];
  for (const f of FEEDS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = await res.text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const title = strip((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        const link = strip((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
        const desc = strip((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1]);
        const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        if (!title || !link || link.endsWith("/feed/")) continue;
        if (EXCLUDE.test(title) || !REL.test(`${title} ${desc}`)) continue;
        const key = title.slice(0, 40).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const d = pub ? new Date(pub) : null;
        const ts = d && !isNaN(d) ? d.getTime() : 0;
        out.push({ title, source: f.source, date: ts ? md(d) : "", link, snippet: desc.slice(0, 400), ts });
      }
    } catch (e) { console.error("[global] 실패:", f.source, e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  // 매체 다양성: 동일 매체 최대 3건
  const perSource = {}, diverse = [];
  for (const n of out) {
    perSource[n.source] = (perSource[n.source] || 0) + 1;
    if (perSource[n.source] <= 3) diverse.push(n);
  }
  return diverse.slice(0, limit);
}

// 글로벌 기사 본문(영문) 추출 — 첨부 워드·요약용. 실패 시 RSS 설명으로 폴백.
export async function enrichGlobal(items) {
  const { fetchArticleText } = await import("./news.js");
  await Promise.all((items || []).map(async (n) => {
    const body = await fetchArticleText(n.link);
    n.text = body && body.length > 150 ? body : (n.snippet || "");
  }));
  return items;
}
