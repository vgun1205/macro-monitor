// 규제·이슈 자동 수집. 네이버 뉴스 API(키 있으면, 요약 스니펫 포함) 우선, 없으면 Google News RSS(제목+링크).
// 손보/K-ICS/지급여력/자본규제 키워드. 실패해도 빈 배열.
import * as cheerio from "cheerio";

// 기사 원문(본문) 추출 — 서버렌더 기사에서 본문 텍스트. 실패 시 빈 문자열(best-effort).
const ART_SELECTORS = ["#dic_area", "#newsct_article", "#articleBody", "#article-view-content-div", "#articleBodyContents", "#newsEndContents", ".article_body", ".article-body", ".news_view", ".art_text", "[itemprop=articleBody]", "article"];
function cleanPara(t) {
  return decodeEnt(t || "")
    .replace(/\s+/g, " ")
    .replace(/기사의?\s*본문[^.]*변경됩니다\.?/g, "")
    .replace(/무단\s*전재[^.\n]*/g, "")
    .replace(/저작권자[^.\n]*/g, "")
    .replace(/\[(사진|이미지|자료|그래픽)\s*=[^\]]*\]/g, "")
    // 기자 바이라인·이메일·입력시각 제거(본문에 불필요)
    .replace(/[가-힣]{2,4}\s*기자\s*[\w.\-]*@?[\w.\-]*/g, "")
    .replace(/\b[\w.\-]+@[\w.\-]+\.\w+/g, "")
    .replace(/(입력|등록|수정)\s*:?\s*\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\.?(\s*\d{1,2}:\d{2})?/g, "")
    .replace(/^\s*[ⓒ©][^.\n]*$/g, "")
    .trim();
}
export async function fetchArticleText(url) {
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
    $("script,style,nav,header,footer,aside,figure,.ad,.advertisement,.reporter_area,.copyright,.byline,.art_photo").remove();
    // 본문 컨테이너 선택(텍스트 최다)
    let bestEl = null, bestLen = 0;
    for (const s of ART_SELECTORS) { const el = $(s).first(); if (el.length) { const len = el.text().replace(/\s+/g, " ").trim().length; if (len > bestLen) { bestLen = len; bestEl = el; } } }
    if (!bestEl || bestLen < 150) bestEl = $("body");
    bestEl.find("br").replaceWith("\n");
    // 문단 단위로 추출
    let paras = [];
    const ps = bestEl.find("p");
    if (ps.length >= 2) ps.each((_, p) => { const t = cleanPara($(p).text()); if (t) paras.push(t); });
    else paras = bestEl.text().split(/\n+/).map(cleanPara).filter(Boolean);
    paras = paras.filter((p, i) => p.length > 2 || i === 0); // 짧은 문단도 최대한 보존
    const out = [];
    let total = 0;
    for (const p of paras) { if (total > 20000) break; out.push(p); total += p.length; } // 원문 충실 수록(20K)
    return out.join("\n\n");
  } catch { return ""; }
}
// 완결 문장 요약: 원문 앞부분에서 문장 단위로 maxLen 이내까지(끝을 "…"로 자르지 않음)
function firstSentences(text, maxLen = 230) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const p of parts) {
    if (!out) { out = p; if (out.length >= maxLen) break; continue; }
    if ((out + " " + p).length > maxLen) break;
    out += " " + p;
  }
  return out.trim();
}
// 폴백 스니펫 정리: 끝 말줄임표 제거 후 마지막 완결 문장까지만
function tidySnippet(s) {
  s = (s || "").replace(/\s+/g, " ").trim().replace(/[…·\.]+$/, "").trim();
  if (/[.!?]$/.test(s)) return s;
  const idx = Math.max(s.lastIndexOf("."), s.lastIndexOf("!"), s.lastIndexOf("?"));
  if (idx >= 20) return s.slice(0, idx + 1).trim();
  if (/[다요죠음함됨임니]$/.test(s)) return s + ".";
  return s;
}

// HTML 엔티티 디코드(이중 인코딩 대응): &#39; &lt; &gt; &quot; &amp; 등
function decodeEnt(s) {
  return (s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
// 인라인 마커(ㅁ/ㅇ/-/*/<...>/①…) 앞에 줄바꿈을 넣어 항목별로 분리. →는 문장 내 유지.
function markerLines(t) {
  return (t || "")
    .replace(/\s*[ㅁ◈□]\s*/g, "\nㅁ ")
    .replace(/\s*[ㅇ◦○]\s*/g, "\nㅇ ")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s+\*\s+/g, "\n* ")
    .replace(/\s*(<[^>\n]{1,40}>)\s*/g, "\n$1\n")
    .replace(/\s*([①-⑮➀-➓❶-❿])\s*/g, "\n$1 ");
}

// 서버리스 안전 PDF 텍스트 추출(unpdf — pdfjs 폴리필 내장)
async function pdfText(buf) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text || "";
}
// 정부·기관 보도자료 PDF 텍스트 정리(페이지번호·머리말·담당부서·꼬리말 제거 + 마커 줄바꿈)
function cleanGovPdf(t, title) {
  let txt = markerLines(t || "");
  const tt = (title || "").replace(/\s+/g, " ").trim();
  const lines = txt.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s
    && !/^[-*\s]*\d{1,3}[-\s]*$/.test(s)                                   // 페이지 번호(- 1, 1 -, - 1 -)
    && !/보도\s*(시점|일시|참고자료|자료)|배포\s*후\s*즉시|보\s*도\s*자\s*료/.test(s)  // 보도자료 헤더 밴드
    && !/^[-*]?\s*(담당|문의|담당부서|담당팀|연락처|전화|작성자|작성부서)/.test(s)
    && !/^[-*\s]*[\d\s.\-():~]{4,}$/.test(s)
    && s !== tt && s !== `- ${tt}`);
  let out = lines.join("\n");
  const ci = out.search(/[※*]?\s*자세한\s*내용은\s*(첨부|붙임)/);
  if (ci > 30) out = out.slice(0, ci);
  // 말미 담당부서·문의·연락처 블록 제거
  const di = out.search(/담당\s?부서|책임자\s*[부국팀]\s*장|문의\s*사항/);
  if (di > 200) out = out.slice(0, di);
  out = out.replace(/([‘’'`])\s+(?=\d)/g, "$1"); // 연도 앞 따옴표 띄어쓰기 정리 ('26 → '26)
  return out.replace(/\n{2,}/g, "\n").trim();
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
async function downloadPdf(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
  clearTimeout(t);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.slice(0, 4).toString() === "%PDF" ? buf : null;
}
// 첨부 파일명 정리(메일 첨부용)
function pdfName(raw, fb, tag) {
  let s = (raw || "")
    .replace(/\s*다운로드\s*$/, "")
    .replace(/\(\s*파일\s*크기[^)]*\)/g, "")          // (파일크기 520KB) 제거
    .replace(/\.(pdf|hwpx?|docx?|xlsx?|zip)/gi, "")   // 내부 확장자 모두 제거
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .replace(/\.{2,}/g, " ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  s = s || fb;
  if (tag) { // 출처 태그를 (보도자료) 옆에 삽입(없으면 앞에)
    s = /\(보도[^)]*\)/.test(s) ? s.replace(/(\(보도[^)]*\))/, `$1(${tag})`) : `(${tag}) ${s}`;
  }
  return `${s.slice(0, 120)}.pdf`;
}

// 금감원 보도자료 본문 — 첨부 PDF 우선(협회와 동일), 실패 시 게시판 인라인(.bd-view) 폴백.
// 받은 PDF 버퍼는 n._pdf에 실어 메일 원본첨부로 사용.
async function fetchFssText(n) {
  const url = n.link, title = n.title, base = "https://www.fss.or.kr";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const $ = cheerio.load(await res.text());
    // 1) 첨부 PDF 우선 추출 + 원본 보관
    let pdfHref = "", pdfLbl = "";
    $('a[href*="fileDown.do"]').each((_, a) => { const lbl = `${$(a).attr("title") || ""} ${$(a).text() || ""}`; if (/\.pdf/i.test(lbl) && !pdfHref) { pdfHref = ($(a).attr("href") || "").replace(/&amp;/g, "&"); pdfLbl = $(a).attr("title") || $(a).text() || ""; } });
    if (pdfHref) {
      try {
        const buf = await downloadPdf(pdfHref.startsWith("http") ? pdfHref : base + pdfHref);
        if (buf) {
          n._pdf = { filename: pdfName(pdfLbl, (title || "금감원자료").slice(0, 40), "금감원"), content: buf };
          const t2 = cleanGovPdf(await pdfText(buf), title);
          if (t2.length > 200) return t2;
        }
      } catch (e) { console.error("[fss-pdf] 실패:", e.message); }
    }
    // 2) 폴백: 게시판 인라인 본문
    const el = $(".bd-view").first();
    if (!el.length) return "";
    el.find("script,style,.file-group,.file-single,[class*=file]").remove();
    el.find("br").replaceWith("\n");
    el.find("p,div,li,tr,h3,h4").each((_, e) => $(e).append("\n"));
    let txt = decodeEnt(el.text()); // 이중 인코딩된 &#39;/&lt; 등 디코드
    const cut = txt.lastIndexOf("문서뷰어");
    if (cut >= 0) txt = txt.slice(cut + 4); // 본문은 문서뷰어 이후
    // 본문 끝의 안내문구·담당부서 이후는 잘라냄(자세한 내용은 첨부…/붙임…)
    const ci = txt.search(/[※*]?\s*자세한\s*내용은\s*(첨부|붙임)/);
    if (ci > 30) txt = txt.slice(0, ci);
    txt = markerLines(txt); // ㅁ/ㅇ/-/*/<>/①… 마커 앞에서 줄바꿈(항목별 분리)
    const tt = (title || "").replace(/\s+/g, " ").trim();
    txt = txt.split("\n").map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s && !/^(등록일|조회수|첨부파일|파일크기|담당부서|담당자|담당팀|문의|연락처|전화)/.test(s)
        && !/^20\d{2}[-.]\d{1,2}[-.]\d{1,2}$/.test(s) && !/^\d{1,7}$/.test(s) && !/^[\d\s.\-()]{4,}$/.test(s) && s !== tt)
      .join("\n");
    return txt.trim();
  } catch (e) { console.error("[news/fss-text] 실패:", e.message); return ""; }
}

// 손해보험협회 보도자료 본문 — 게시판 본문이 비어 있어 첨부 PDF를 받아 텍스트 추출 + 원본 보관.
async function fetchKniaText(n) {
  const url = n.link, title = n.title, base = "https://www.knia.or.kr";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return "";
    const $ = cheerio.load(await res.text());
    let href = "", lbl = "";
    $('a[href*="/file/download/"]').each((_, a) => { if (/\.pdf/i.test($(a).text()) && !href) { href = $(a).attr("href"); lbl = $(a).text() || ""; } });
    if (!href) return "";
    const buf = await downloadPdf(href.startsWith("http") ? href : base + href);
    if (!buf) return "";
    n._pdf = { filename: pdfName(lbl, (title || "협회자료").slice(0, 40), "손보협회"), content: buf };
    return cleanGovPdf(await pdfText(buf), title);
  } catch (e) { console.error("[news/knia-pdf] 실패:", e.message); return ""; }
}

// 진단: 서버(Vercel)에서 PDF 파싱 단계별 결과/에러 확인용(unpdf)
export async function debugPdf() {
  const out = { node: process.version, steps: [] };
  try {
    const base = "https://www.knia.or.kr";
    const list = await (await fetch(base + "/data/news", { headers: { "User-Agent": UA } })).text();
    const idx = (list.match(/content\?index=(\d+)/) || [])[1]; out.idx = idx; out.steps.push("list ok");
    const html = await (await fetch(base + "/data/news/content?index=" + idx, { headers: { "User-Agent": UA } })).text();
    const $ = cheerio.load(html); let href = "";
    $('a[href*="/file/download/"]').each((_, a) => { if (/\.pdf/i.test($(a).text()) && !href) href = $(a).attr("href"); });
    out.pdfHref = href; out.steps.push("href ok");
    if (!href) return out;
    const buf = await downloadPdf(base + href);
    out.pdfBytes = buf ? buf.length : 0; out.steps.push("download ok");
    const txt = await pdfText(buf);
    out.textLen = (txt || "").length; out.sample = (txt || "").replace(/\s+/g, " ").slice(0, 100); out.steps.push("unpdf ok");
  } catch (e) { out.error = e.message; out.stack = (e.stack || "").split("\n").slice(0, 4).join(" | "); }
  return out;
}

export async function enrichFullText(items) {
  await Promise.all(items.map(async (n) => {
    n.text = n.source === "금융감독원" ? await fetchFssText(n)
      : (n.source === "손해보험협회" && n.kind !== "knia_notice") ? await fetchKniaText(n) // 공지사항은 본문 생략(속도)
      : n.source === "손해보험협회" ? ""
      : await fetchArticleText(n.link);
    if (/전체메뉴|소비자포털 오시는길|본문 바로가기/.test(n.text)) n.text = ""; // nav 오추출 방지
    const s = firstSentences(n.text);
    n.snippet = s && s.length >= 30 ? s : (n.snippet ? tidySnippet(n.snippet) : ""); // 요약을 완결 문장으로
  }));
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

// 보험사 위험관리 관련 키워드 (지급여력·자본·건전성·부채·금리/신용리스크 등)
const QUERIES = [
  "보험사 지급여력비율", "보험사 K-ICS 자본", "보험사 건전성 규제",
  "보험 IFRS17 책임준비금", "보험사 후순위채 자본확충", "보험사 금리리스크 자산운용",
  "손해보험협회 보험", "생명보험협회 지급여력", // 협회 관련 보도(원본 사이트가 동적이라 뉴스로 보완)
];
// 보험사 위험관리 관련 보도자료 필터(금감원은 전 금융권을 다루므로 보험 키워드만)
const INS_KEYS = /보험|지급여력|K-?ICS|킥스|건전성|책임준비금|계리|손해보험|생명보험|할인율|자본확충|후순위|신종자본/i;
// 뉴스 관련성 필터(협회 쿼리 등에서 들어오는 무관 기사 제거)
const NEWS_REL = /보험|생명|손보|지급여력|K-?ICS|킥스|건전성|책임준비금|계리|CSM|할인율|자본|후순위|금융당국|금융위|감독원|손해율/i;
// 도메인 → 매체명(출처 명시용)
const MEDIA = {
  "hankyung.com": "한국경제", "mk.co.kr": "매일경제", "sedaily.com": "서울경제", "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리", "fnnews.com": "파이낸셜뉴스", "yna.co.kr": "연합뉴스", "einfomax.co.kr": "연합인포맥스",
  "insnews.co.kr": "보험신보", "insurancetimes.co.kr": "한국보험신문", "biz.chosun.com": "조선비즈",
  "newsis.com": "뉴시스", "news1.kr": "뉴스1", "asiae.co.kr": "아시아경제", "etoday.co.kr": "이투데이",
  "imaeil.com": "매일신문", "newsfreezone.co.kr": "뉴스프리존", "theguru.co.kr": "더구루", "dailian.co.kr": "데일리안",
};
const mediaName = (domain) => MEDIA[domain] || domain;

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
        out.push({ title, source: domainOf(link), date: ts ? md(d) : "", link, snippet: decode(it.description), ts, kind: "news" });
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
        out.push({ title, source, date: ts ? md(d) : "", link, snippet: "", ts, kind: "news" });
      }
    } catch (e) { console.error("[news/google] 실패:", e.message); }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

// 금융감독원 보도자료 직접 수집(보험 관련만). 제목·링크·날짜 추출.
async function fetchFSS(limit = 5) {
  const base = "https://www.fss.or.kr";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${base}/fss/bbs/B0000188/list.do?menuNo=200218`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    const seen = new Set(), out = [];
    $('a[href*="/fss/bbs/B0000188/view.do"]').each((_, a) => {
      const href = ($(a).attr("href") || "").replace(/&amp;/g, "&");
      const m = href.match(/nttId=(\d+)/);
      if (!m || seen.has(m[1])) return;
      let title = $(a).text().replace(/\s+/g, " ").trim();
      if (!title || title.length < 6 || !INS_KEYS.test(title)) return; // 보험 관련만
      seen.add(m[1]);
      const dm = $(a).closest("li,tr,div").text().match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/);
      const date = dm ? `${+dm[2]}/${+dm[3]}` : "";
      const ts = dm ? Date.parse(`${dm[1]}-${dm[2]}-${dm[3]}`) : Date.now();
      out.push({ title, source: "금융감독원", date, link: base + href, snippet: "", ts, official: true, kind: "fss_report" });
    });
    return out.slice(0, limit);
  } catch (e) { console.error("[news/fss] 실패:", e.message); return []; }
}

// 손해보험협회 게시판 수집(보도자료 /data/news · 공지사항 /data/notice). 제목·링크·날짜.
async function fetchKniaBoard(listPath, limit = 3, kind = "knia_report") {
  const base = "https://www.knia.or.kr";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${base}${listPath}`, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    const seen = new Set(), out = [];
    const cutoff = Date.now() - 90 * 86400 * 1000;
    $('a[href*="content?index="]').each((_, a) => {
      const href = $(a).attr("href") || "";
      const id = (href.match(/index=(\d+)/) || [])[1];
      if (!id || seen.has(id)) return;
      const title = $(a).text().replace(/\s+/g, " ").trim();
      if (!title || title.length < 6) return;
      seen.add(id);
      const dm = $(a).closest("li,tr").text().match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
      const ts = dm ? Date.parse(`${dm[1]}-${dm[2]}-${dm[3]}`) : Date.now();
      if (dm && ts < cutoff) return;
      out.push({ title, source: "손해보험협회", date: dm ? `${+dm[2]}/${+dm[3]}` : "", link: base + (href.startsWith("/") ? href : "/" + href), snippet: "", ts, official: true, kind });
    });
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, limit);
  } catch (e) { console.error("[news/knia]", listPath, e.message); return []; }
}

// sinceTs(ms) 지정 시 그 시각 이후 발행분만(증분 수집). 미지정 시 최신 limit건.
export async function fetchIssues(limit = 10, sinceTs = 0) {
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  const [fss, kniaNews, kniaNotice, news] = await Promise.all([
    fetchFSS(6),
    fetchKniaBoard("/data/news", 4, "knia_report"),
    fetchKniaBoard("/data/notice", 4, "knia_notice"),
    (id && secret) ? fetchNaver(id, secret, limit) : fetchGoogle(limit),
  ]);
  const seen = new Set(), merged = [];
  for (const it of [...fss, ...kniaNews, ...kniaNotice, ...news.filter((n) => NEWS_REL.test(n.title))]) {
    const key = it.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(it);
  }
  // 국내 순서: 1)금감원 보도 2)손보협회 보도 3)국내 뉴스 4)금감원 공지 5)손보협회 공지, 각 그룹 내 최신순
  const ORDER = { fss_report: 1, knia_report: 2, news: 3, fss_notice: 4, knia_notice: 5 };
  merged.sort((a, b) => (ORDER[a.kind] || 9) - (ORDER[b.kind] || 9) || b.ts - a.ts);
  if (sinceTs) return merged.filter((n) => (n.ts || 0) > sinceTs).slice(0, 30); // 증분
  return merged.slice(0, limit);
}
