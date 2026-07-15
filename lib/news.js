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
// 기사 사이트 메뉴·공유·관련뉴스 등 본문 무관 줄(한 줄 통째로 일치 시 제거)
const NAV_JUNK = /^(카카오\s?톡|페이스\s?북|트위터|엑스|네이버|밴드|카카오스토리|텔레그램|라인|URL\s?복사|URL\s?공유|공유하기|공유|스크랩|프린트|인쇄|글자\s?크기|가장\s?작게|작게|보통|크게|가장\s?크게|본문\s?듣기|관련\s?뉴스|관련\s?기사|관련\s?종목|주요\s?뉴스|많이\s?본\s?뉴스|최신\s?뉴스|최신\s?영상|인기\s?뉴스|추천\s?뉴스|자세히\s?보기|더\s?보기|뉴스발전소|한\s?컷|마켓\s?뉴스|오늘의\s?상승종목|실시간\s?암호화폐\s?시세|금융\s?최신\s?뉴스|이전\s?기사|다음\s?기사|이전|다음|목록|맨위로|위로|댓글|구독|좋아요|팔로우|기사\s?제보|프로필\s?보기)$/;
const isNavJunk = (p) => { const t = (p || "").replace(/\s+/g, " ").trim(); return NAV_JUNK.test(t) || /^.{0,12}의\s?주요\s?뉴스$/.test(t) || /^.{0,10}(기자)\s?(구독|페이지)$/.test(t); };
// 본문 끝의 관련기사 링크 목록(다른 기사 제목들) 제거 — 끝에서부터 '짧은 비문장 줄'이 이어지면 통째로 잘라냄
const isSentLine = (p) => /(다|요|까|함|음)\s*[.?!]?["'」”’)\]]*$/.test(p.trim()) || /[.]\s*$/.test(p);
export function trimTailJunk(paras) {
  let k = paras.length;
  while (k > 0 && paras[k - 1].length <= 55 && !isSentLine(paras[k - 1])) k--;
  const nonSent = paras.length - k;
  if (nonSent >= 2) { // 비문장 짧은 줄 2개 이상 연속 → 사이에 낀 짧은 문장형 줄까지 확장 제거
    while (k > 0 && paras[k - 1].length <= 55) k--;
    return paras.slice(0, k);
  }
  if (nonSent === 1) return paras.slice(0, k); // 마지막 한 줄만 잡음이면 그 줄만 제거
  return paras;
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
    // 관련기사·추천·인기 목록 영역 제거(끝에 다른 기사 제목이 딸려오는 원인)
    $('[class*="relat"],[id*="relat"],[class*="recommend"],[id*="recommend"],[class*="popular"],[id*="popular"],[class*="ranking"],[class*="another"],[class*="morenews"],[class*="news_list"],[class*="link_news"]').remove();
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
    paras = paras.filter((p) => !isNavJunk(p)); // 메뉴·공유·관련뉴스 잡음 제거
    paras = trimTailJunk(paras); // 끝에 붙는 관련기사 제목 목록 제거
    const out = [];
    let total = 0;
    for (const p of paras) { if (total > 20000) break; out.push(p); total += p.length; } // 원문 충실 수록(20K)
    return out.join("\n\n");
  } catch { return ""; }
}
// 리드 문단에서 매체태그·바이라인·광고·날짜·불릿 제거
function cleanLead(p) {
  return (p || "")
    .replace(/advertisement/gi, " ")
    .replace(/^\s*\[[^\]]{1,16}\]\s*/, "")                      // [파이낸셜뉴스] [아시아타임즈=]
    .replace(/^\s*\|[^|]{1,30}\|\s*/, "")                       // | 서울=한스경제 |
    .replace(/^\s*\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\.?\s*/, "")     // 2026.07.08
    .replace(/^[ㅁㅇ□○◈◆▶●■◦▲△※·∙•\-\s]+/, "")   // 앞 불릿·마커 제거
    .replace(/\s+/g, " ").trim();
}
// 완결 문장 요약: 앞쪽 부제·토막·잡음을 건너뛰고 첫 '문장다운' 지점부터 maxLen 이내(끝을 "…"로 자르지 않음)
export function firstSentences(text, maxLen = 520) {
  let paras = (text || "").split(/\n+/).map(cleanLead).filter((p) => p && p.length > 1);
  if (!paras.length) return "";
  const sentenceLike = (p) => /[.!?]$/.test(p) || /다[.」”』)\]]*$/.test(p);
  let i = 0;
  while (i < paras.length - 1 && !(sentenceLike(paras[i]) && paras[i].length >= 25)) i++;
  const t = paras.slice(i).join(" ").replace(/\s+/g, " ").trim();
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const p of parts) {
    if (!out) { out = p; if (out.length >= maxLen) break; continue; }
    if ((out + " " + p).length > maxLen) break;
    out += " " + p;
  }
  return fixCompoundVerbSpacing(out.trim());
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
// PDF 추출 시 '증가 하면서·구축 하기'처럼 복합동사가 띄어써진 것 교정(안전 화이트리스트 어간만).
const CVERB = "증가|감소|구축|제고|강화|완화|개선|지원|운영|추진|확대|축소|마련|실시|발생|적용|관리|제공|가입|체결|판단|결정|확인|검토|분석|평가|조정|반영|도입|시행|공개|발표|추가|제한|완료|진행|참여|대응|예방|점검|개편|정비|해소|기여|활용|구성|설정|선정|지급|산정|부과|납부|우려|증대|위반|준수|이행|공유|협력|판매|검사|감독|보완|충족|권고|제재|접수|처리|안내|홍보|운용|투자|손실|증권|공시|출시|확보|해지|보장|청구|지연|축적|연계|구현|복잡|다양|중요|필요|가능|동일|명확|신속|정확|편리|안전|원활|투명|공정|적절|충분|과도|미흡|우수|양호|심각|단순|유사|상이|적합|부합|타당|엄격|철저|신중|성실|활발|긴밀|면밀|저조|풍부|취약|열악|증빙|입증";
const CVERB_RE = new RegExp("(" + CVERB + ")\\s+(하[가-힣]|했|한다|할(?=\\s)|함(?![가-힣]))", "g");
function fixCompoundVerbSpacing(t) { return (t || "").replace(CVERB_RE, "$1$2"); }

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
  out = fixCompoundVerbSpacing(out); // PDF 추출 시 '증가 하면서' 같은 복합동사 띄어쓰기 교정
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

// 금융위 보도자료 본문 — 게시판 본문이 빈약해 목록에서 확보한 첨부 PDF를 받아 텍스트 추출 + 원본 보관.
async function fetchFscText(n) {
  try {
    if (!n._pdfHref) return "";
    const buf = await downloadPdf(n._pdfHref);
    if (!buf) return "";
    n._pdf = { filename: pdfName(n._pdfName || "", (n.title || "금융위자료").slice(0, 40), "금융위"), content: buf };
    return cleanGovPdf(await pdfText(buf), n.title);
  } catch (e) { console.error("[news/fsc-pdf] 실패:", e.message); return ""; }
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
      : n.source === "금융위원회" ? await fetchFscText(n)
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

// 보험사 위험관리 키워드 — 팀 업무범위(자본·지급여력 / 회계·부채 / 위험관리·감독 / BCM / 제3자 리스크)
const QUERIES = [
  // 자본·지급여력(핵심)
  "보험사 지급여력비율", "보험사 K-ICS 자본", "보험사 K-ICS 경과조치",
  "보험사 자본확충", "보험사 신종자본증권",
  // 회계·부채
  "보험 IFRS17 계리가정", "보험부채 할인율",
  // 위험관리·감독
  "보험사 리스크관리", "금감원 보험 검사", "보험사 내부통제",
  // BCM·운영리스크
  "금융 업무연속성", "금융권 전산장애", "보험사 사업연속성 BCM", "보험사 위험관리위원회",
  // 제3자 리스크
  "금융 IT 위탁", "금융 클라우드 장애",
];
// 보험사 위험관리 관련 보도자료 필터(금감원은 전 금융권을 다루므로 팀 관련 키워드만)
const INS_KEYS = /보험|지급여력|K-?ICS|킥스|건전성|책임준비금|계리|손해보험|생명보험|할인율|자본확충|후순위|신종자본|내부통제|전산장애|업무연속성|사업연속성|위험관리위원회|위탁|소비자보호|분쟁조정|불완전판매|판매수수료|리베이트|모집질서|\bGA\b|약관|보험금|손해율|재보험|IFRS|경과조치|지배구조|리스크|위험관리|정상화계획|부실정리|금융복합기업집단|스트레스\s?테스트|유동성/i;
// 뉴스 관련성 필터(무관 기사 제거) — BCM·제3자 리스크 포함
const NEWS_REL = /보험|생명|손보|지급여력|K-?ICS|킥스|건전성|책임준비금|계리|CSM|할인율|자본|후순위|금융당국|금융위|감독원|손해율|BCP|업무연속성|재해복구|전산장애|위탁|외주|제3자|공급망|사이버/i;
// 유명 매체 화이트리스트(도메인 → 매체명). 여기 있으면 '메이저'로 우선 선별, 없으면 마이너(채움용).
const MEDIA = {
  // 통신사
  "yna.co.kr": "연합뉴스", "einfomax.co.kr": "연합인포맥스", "newsis.com": "뉴시스", "news1.kr": "뉴스1",
  // 경제지
  "hankyung.com": "한국경제", "mk.co.kr": "매일경제", "sedaily.com": "서울경제", "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리", "fnnews.com": "파이낸셜뉴스", "asiae.co.kr": "아시아경제",
  "heraldcorp.com": "헤럴드경제", "etoday.co.kr": "이투데이", "biz.chosun.com": "조선비즈", "mediapen.com": "미디어펜",
  // 종합 일간지
  "chosun.com": "조선일보", "joongang.co.kr": "중앙일보", "donga.com": "동아일보",
  "hankookilbo.com": "한국일보", "hani.co.kr": "한겨레", "khan.co.kr": "경향신문",
  // 금융·보험 전문지
  "thebell.co.kr": "더벨", "bizwatch.co.kr": "비즈워치", "newspim.com": "뉴스핌",
  "insnews.co.kr": "보험신보", "insurancetimes.co.kr": "한국보험신문",
  "kbanker.co.kr": "대한금융신문", "fntimes.com": "한국금융신문",
};
// 서브도메인(biz.hankyung.com 등)도 매칭
function matchDomain(domain, table) {
  if (!domain) return null;
  if (table[domain]) return table[domain];
  for (const k in table) if (domain.endsWith("." + k)) return table[k];
  return null;
}
const mediaName = (domain) => matchDomain(domain, MEDIA) || domain;
const isMajor = (domain) => matchDomain(domain, MEDIA) !== null;
const MAJOR_NAMES = new Set(Object.values(MEDIA)); // Google 폴백: 매체명 기준 판별

// 네이버 뉴스 검색(요약 스니펫 포함) — 쿼리 14개 병렬 호출
async function fetchNaver(id, secret, limit) {
  const results = await Promise.all(QUERIES.map(async (q) => {
    try {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=10&sort=date`;
      const res = await fetch(url, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } });
      const j = await res.json();
      return j.items || [];
    } catch (e) { console.error("[news/naver] 실패:", q, e.message); return []; }
  }));
  const all = [];
  for (const it of results.flat()) {
    const title = decode(it.title);
    const link = it.originallink || it.link;
    if (!title || !link) continue;
    const d = it.pubDate ? new Date(it.pubDate) : null;
    const ts = d && !isNaN(d) ? d.getTime() : 0;
    const domain = domainOf(link);
    all.push({ title, source: mediaName(domain), date: ts ? md(d) : "", link, snippet: decode(it.description), ts, kind: "news", major: isMajor(domain) });
  }
  // 메이저(유명 매체) 우선, 그다음 최신순으로 먼저 정렬한 뒤 중복 제거 → 같은 기사면 메이저 매체 버전이 남음
  all.sort((a, b) => (a.major ? 0 : 1) - (b.major ? 0 : 1) || b.ts - a.ts);
  const seen = new Set(), out = [];
  for (const n of all) {
    const key = n.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
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
        out.push({ title, source, date: ts ? md(d) : "", link, snippet: "", ts, kind: "news", major: MAJOR_NAMES.has(source) });
      }
    } catch (e) { console.error("[news/google] 실패:", e.message); }
  }
  out.sort((a, b) => (a.major ? 0 : 1) - (b.major ? 0 : 1) || b.ts - a.ts);
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

// 금융위원회 보도자료 수집(위험관리 관련만). 목록에 날짜(.day)·첨부 PDF 링크가 함께 있음.
async function fetchFSC(limit = 5) {
  const base = "https://www.fsc.go.kr";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${base}/no010101`, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    const seen = new Set(), out = [];
    $('.subject a[href*="no010101/"]').each((_, a) => {
      const href = ($(a).attr("href") || "").split("?")[0];
      const id = (href.match(/no010101\/(\d+)/) || [])[1];
      if (!id || seen.has(id)) return;
      const title = $(a).clone().children("span").remove().end().text().replace(/\s+/g, " ").trim();
      if (!title || title.length < 6 || !INS_KEYS.test(title)) return; // 팀 관련만
      seen.add(id);
      const li = $(a).closest("li");
      const dm = li.find(".day").text().match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/);
      const ts = dm ? Date.parse(`${dm[1]}-${dm[2]}-${dm[3]}`) : Date.now();
      // 목록에서 첨부 PDF 링크 확보(상세 페이지 열 필요 없음)
      let pdfHref = "", pdfName_ = "";
      li.find(".file-list a").each((_, f) => {
        const ttl = $(f).attr("title") || $(f).text() || "";
        if (/\.pdf\s*$/i.test(ttl.trim()) && !pdfHref) { pdfHref = ($(f).attr("href") || "").replace(/&amp;/g, "&"); pdfName_ = ttl.trim(); }
      });
      out.push({
        title, source: "금융위원회", date: dm ? `${+dm[2]}/${+dm[3]}` : "", link: base + href,
        snippet: "", ts, official: true, kind: "fsc_report",
        _pdfHref: pdfHref ? (pdfHref.startsWith("http") ? pdfHref : base + pdfHref) : "", _pdfName: pdfName_,
      });
    });
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, limit);
  } catch (e) { console.error("[news/fsc] 실패:", e.message); return []; }
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

// 공식 소스(금감원·금융위 보도 + 손보협회 보도/공지) 전체 — 증분·뉴스 제외. 아카이브 축적용.
export async function fetchOfficials() {
  const [fss, fsc, kn, no] = await Promise.all([
    fetchFSS(8),
    fetchFSC(8),
    fetchKniaBoard("/data/news", 8, "knia_report"),
    fetchKniaBoard("/data/notice", 8, "knia_notice"),
  ]);
  const seen = new Set(), out = [];
  for (const it of [...fss, ...fsc, ...kn, ...no]) {
    const key = it.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

// sinceTs(ms) 지정 시 그 시각 이후 발행분만(증분 수집). 미지정 시 최신 limit건.
export async function fetchIssues(limit = 10, sinceTs = 0) {
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  const [fss, fsc, kniaNews, kniaNotice, news] = await Promise.all([
    fetchFSS(6),
    fetchFSC(5),
    fetchKniaBoard("/data/news", 4, "knia_report"),
    fetchKniaBoard("/data/notice", 4, "knia_notice"),
    (id && secret) ? fetchNaver(id, secret, limit) : fetchGoogle(limit),
  ]);
  const seen = new Set(), merged = [];
  for (const it of [...fss, ...fsc, ...kniaNews, ...kniaNotice, ...news.filter((n) => NEWS_REL.test(n.title))]) {
    const key = it.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(it);
  }
  // 국내 순서: 1)금감원 보도 2)금융위 보도 3)손보협회 보도 4)국내 뉴스 5)금감원 공지 6)손보협회 공지
  // 각 그룹 내: 뉴스는 메이저(유명 매체) 우선 후 최신순, 그 외는 최신순
  const ORDER = { fss_report: 1, fsc_report: 2, knia_report: 3, news: 4, fss_notice: 5, knia_notice: 6 };
  merged.sort((a, b) =>
    (ORDER[a.kind] || 9) - (ORDER[b.kind] || 9)
    || (a.major ? 0 : 1) - (b.major ? 0 : 1)
    || b.ts - a.ts);
  if (sinceTs) {
    // 뉴스는 발행 시각(정밀)으로, 금감원·협회 보도/공지는 발행 날짜 단위로 비교(자정 ts로 당일자 누락 방지)
    const fromDate = new Date(sinceTs + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const kstDate = (ts) => new Date((ts || 0) + 9 * 3600 * 1000).toISOString().slice(0, 10);
    return merged.filter((n) => (n.kind === "news" ? (n.ts || 0) > sinceTs : kstDate(n.ts) >= fromDate)).slice(0, 30);
  }
  return merged.slice(0, limit);
}
