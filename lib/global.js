// 글로벌 위험관리·보험사 자본 MI 수집 — Google News RSS(영문).
// Solvency II / ICS / IFRS17 / capital / reinsurance 등 키워드. 위험관리 관련만 필터.
const QUERIES = [
  "Solvency II insurer capital",
  "insurance capital standard ICS IAIS",
  "IFRS 17 insurer capital reserve",
  "insurer interest rate risk OR reinsurance capital",
  "EIOPA OR PRA insurer prudential solvency",
];
// 위험관리·자본 관련성 필터(영문)
const REL = /solvency|capital|ICS|IFRS\s?17|reserve|reinsur|prudential|EIOPA|PRA|RBC|risk|actuar|underwriting|own funds|SCR|rating/i;
// 저품질·자동생성 aggregator 제외
const BLOCK = /ad-hoc-news|marketscreener|simplywall|zacks|stocktitan|insider monkey/i;

function decode(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .trim();
}
const md = (d) => { const k = new Date(d.getTime() + 9 * 3600 * 1000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

export async function fetchGlobal(limit = 6) {
  const seen = new Set(), out = [];
  for (const q of QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:21d")}&hl=en-US&gl=US&ceid=US:en`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = await res.text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const source = decode((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
        let title = decode((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        const link = decode((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
        const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        if (!title || !link) continue;
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        if (!REL.test(title) || BLOCK.test(source)) continue; // 위험관리·자본 관련 & 저품질 제외
        const key = title.slice(0, 40).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const d = pub ? new Date(pub) : null;
        const ts = d && !isNaN(d) ? d.getTime() : 0;
        out.push({ title, source: source || "Google News", date: ts ? md(d) : "", link, ts });
      }
    } catch (e) { console.error("[global] 실패:", e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  // 매체 다양성: 동일 매체 최대 2건
  const perSource = {}, diverse = [];
  for (const n of out) {
    perSource[n.source] = (perSource[n.source] || 0) + 1;
    if (perSource[n.source] <= 2) diverse.push(n);
  }
  return diverse.slice(0, limit);
}
