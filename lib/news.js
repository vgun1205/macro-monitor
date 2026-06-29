// 규제·이슈 자동 수집. 네이버 뉴스 API(키 있으면, 요약 스니펫 포함) 우선, 없으면 Google News RSS(제목+링크).
// 손보/K-ICS/지급여력/자본규제 키워드. 실패해도 빈 배열.
import * as cheerio from "cheerio";

// 기사 원문(본문) 추출 — 서버렌더 기사에서 본문 텍스트. 실패 시 빈 문자열(best-effort).
const ART_SELECTORS = ["#dic_area", "#newsct_article", "#articleBody", "#article-view-content-div", "#articleBodyContents", "#newsEndContents", ".article_body", ".article-body", ".news_view", ".art_text", "[itemprop=articleBody]", "article"];
async function fetchArticleText(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    // 인코딩 감지(한국 언론사는 EUC-KR/CP949 다수) → 올바르게 디코드
    const buf = Buffer.from(await res.arrayBuffer());
    let html = buf.toString("utf8");
    let cs = ((res.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || [])[1];
    if (!cs) cs = (html.match(/charset=["']?([\w-]+)/i) || [])[1];
    if (cs) {
      cs = cs.toLowerCase();
      if (["cp949", "ms949", "ksc5601", "ks_c_5601-1987"].includes(cs)) cs = "euc-kr";
      if (cs !== "utf-8" && cs !== "utf8") { try { html = new TextDecoder(cs).decode(buf); } catch {} }
    }
    const $ = cheerio.load(html);
    $("script,style,nav,header,footer,aside,figure,.ad,.advertisement,.reporter_area,.copyright").remove();
    let best = "";
    for (const s of ART_SELECTORS) { const el = $(s); if (el.length) { const txt = el.text().replace(/\s+/g, " ").trim(); if (txt.length > best.length) best = txt; } }
    if (best.length < 150) best = $("body").text().replace(/\s+/g, " ").trim();
    return best.slice(0, 2000);
  } catch { return ""; }
}
export async function enrichFullText(items) {
  await Promise.all(items.map(async (n) => { n.text = await fetchArticleText(n.link); }));
  return items;
}

function decode(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .trim();
}
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const md = (d) => { const k = new Date(d.getTime() + 9 * 3600 * 1000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

const QUERIES = ["지급여력 보험", "K-ICS 보험", "보험사 자본 규제"];

// 네이버 뉴스 검색(요약 스니펫 포함)
async function fetchNaver(id, secret, limit) {
  const seen = new Set(), out = [];
  for (const q of QUERIES) {
    try {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=10&sort=date`;
      const res = await fetch(url, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } });
      const j = await res.json();
      for (const it of j.items || []) {
        const title = decode(it.title);
        const link = it.originallink || it.link;
        if (!title || !link) continue;
        const key = title.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        const d = it.pubDate ? new Date(it.pubDate) : null;
        const ts = d && !isNaN(d) ? d.getTime() : 0;
        out.push({ title, source: domainOf(link), date: ts ? md(d) : "", link, snippet: decode(it.description), ts });
      }
    } catch (e) { console.error("[news/naver] 실패:", e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

// Google News RSS 폴백(제목+링크만)
async function fetchGoogle(limit) {
  const seen = new Set(), out = [];
  for (const q of ["(지급여력 OR K-ICS OR 킥스) 보험", "보험사 (자본 OR 건전성 OR 규제) (금융위 OR 금융감독원)"]) {
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
        out.push({ title, source, date: ts ? md(d) : "", link, snippet: "", ts });
      }
    } catch (e) { console.error("[news/google] 실패:", e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

export async function fetchIssues(limit = 8) {
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  if (id && secret) {
    const r = await fetchNaver(id, secret, limit);
    if (r.length) return r;
  }
  return fetchGoogle(limit);
}
