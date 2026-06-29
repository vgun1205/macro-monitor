// 규제·이슈 자동 수집 (Google News RSS, 무료·키 불필요). 제목+매체+날짜+링크.
// 손보/K-ICS/지급여력/자본규제 키워드. 요약 없음(헤드라인+원문링크). 실패해도 빈 배열 반환.
const QUERIES = [
  "(지급여력 OR K-ICS OR 킥스) 보험",
  "보험사 (자본 OR 건전성 OR 규제) (금융위 OR 금융감독원)",
];

function decode(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

export async function fetchIssues(limit = 6) {
  const seen = new Set();
  const out = [];
  for (const q of QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:14d")}&hl=ko&gl=KR&ceid=KR:ko`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const xml = await res.text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const source = decode((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
        let title = decode((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        const link = decode((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
        const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        if (!title || !link) continue;
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const key = title.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        const d = pub ? new Date(pub) : null;
        const ts = d && !isNaN(d) ? d.getTime() : 0;
        const date = ts ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : "";
        out.push({ title, source, date, link, ts });
      }
    } catch (e) { console.error("[news] 실패:", e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}
