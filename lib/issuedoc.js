// 보험사 위험관리 MI 워드(.docx) — 첨부 템플릿(RM팀 위험관리 MI) 양식 준용.
// 1p: 표지(단독) → 2p: Summary 국내(네모박스, 요약 포함) → 3p: Summary 해외 → 이후 본문(Ⅰ Ⅱ … 번호).
// A4, 여백 상하 2.5cm·좌우 2cm, 줄간격 1.3, 들여쓰기 없음, 단락 앞 0 + 문단 간격만.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak } from "docx";
import JSZip from "jszip";

const FONT = { ascii: "바탕체", hAnsi: "바탕체", eastAsia: "바탕체", cs: "바탕체" }; // 바탕체
const BLUE = "0070C0"; // * 보충문장 파란색
const MARGIN = { top: 1418, bottom: 1418, left: 1134, right: 1134 };
const LINE = 312;   // 줄간격 1.3
const GAP = 120;    // 문단 간 간격(단락 뒤, ≈6pt)
const SZ = 22;      // 본문 11pt
const CSP = -6;     // 자간 좁게 0.3pt

const SQ = (t) => (typeof t === "string" ? t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"') : t); // 둥근→곧은 따옴표
const R = (text, o = {}) => new TextRun({ text: SQ(text), size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ spacing: { line: LINE, lineRule: "auto", before: 0, after: GAP }, ...opt, children: Array.isArray(runs) ? runs : [runs] });
const C = (runs, opt = {}) => P(runs, { alignment: AlignmentType.CENTER, ...opt });
const kindTag = (k) => /report$/.test(k || "") ? " (보도)" : /notice$/.test(k || "") ? " (공지)" : "";
const src = (n) => `* 출처: ${n.source || "-"}${kindTag(n.kind)}${n.date ? ` · ${n.date}` : ""}`;
// □ 섹션 헤더 — 지훈 스타일(굵게·검정·기본 들여쓰기)
const head = (t) => P([R(t, { bold: true })], { indent: { left: 60 + 330, hanging: 330 }, spacing: { line: LINE, lineRule: "auto", before: 0, after: 60 } });
const linkP = (link, label) => P([new ExternalHyperlink({ link, children: [new TextRun({ text: label, size: SZ, font: FONT, characterSpacing: CSP, color: "1F5FBF", underline: {} })] })]);
const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
const roman = (n) => ROMAN[n] || `${n}`;
const cut = (s, n) => { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

// 글자폭(twips) 추정 — 전각(한글·CJK·전각기호)=글자크기, 반각(영문·숫자·공백)=절반. sz는 half-point.
const charW = (c, sz) => (/[ᄀ-ᇿ⺀-퟿豈-﫿！-｠「」·※①-⑮➊-➓□○◈■◦]/.test(c) ? sz * 10 : sz * 5);
const textW = (s, sz) => [...(s || "")].reduce((a, c) => a + charW(c, sz), 0);
// 줄바꿈 정렬 위치: "라벨: " 뒤(콜론이 앞부분에 있으면), 아니면 마커("□ "/"- "/"* ") 뒤
function hangW(out, sz) {
  const ci = out.indexOf(":");
  if (ci > 1 && ci <= 28) return textW(out.slice(0, ci + 1) + " ", sz);
  const m = out.match(/^([□\-*] )/);
  return m ? textW(m[1], sz) : 0;
}

// 지훈 스타일 계층 첫줄 위치: □=60, -=480(①번호 포함), *=760, 일반=0
function bodyParas(text, runOpt = {}) {
  const lines = (text || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    const isStar = /^\*/.test(line);
    const nextStar = idx + 1 < lines.length && /^\*/.test(lines[idx + 1]);
    let out = line, kind = "plain";
    if (/^[□ㅁ◈■]\s*/.test(line)) { out = "□ " + line.replace(/^[□ㅁ◈■]\s*/, ""); kind = "box"; }
    else if (/^[○ㅇ◦∙·]\s*/.test(line)) { out = "- " + line.replace(/^[○ㅇ◦∙·]\s*/, ""); kind = "dash"; }
    else if (/^[-‐–]\s*/.test(line)) { out = "- " + line.replace(/^[-‐–]\s*/, ""); kind = "dash"; }
    else if (/^[①-⑮➊-➓❶-❿]/.test(line)) { kind = "dash"; }
    else if (isStar) { out = "* " + line.replace(/^\*\s*/, ""); kind = "star"; }
    const bracket = /^<.{1,40}>$/.test(out);
    // □=굵게(지훈 스타일), *=10pt 파랑, <소제목>=굵게
    const ro = isStar ? { size: 20, color: BLUE } : { ...runOpt, ...(kind === "box" || bracket ? { bold: true } : {}) };
    let spLine = LINE, spAfter = GAP;
    if (isStar) { spLine = 240; spAfter = nextStar ? 0 : GAP; }
    else if (nextStar) { spLine = 240; spAfter = 0; }
    // 첫줄 위치(base) + 줄바꿈 정렬(콜론 뒤/마커 뒤 내어쓰기)
    const base = kind === "box" ? 60 : kind === "dash" ? 480 : kind === "star" ? 760 : 0;
    const hw = hangW(out, isStar ? 20 : 22);
    return P([R(out, ro)], {
      spacing: { line: spLine, lineRule: "auto", before: 0, after: spAfter },
      indent: (base || hw) ? { left: base + hw, hanging: hw } : undefined,
    });
  });
}

// Summary 항목: 제목 + 한두 문장 요약
function entryParas(arr, isGlobal) {
  const out = [];
  (arr.length ? arr : [null]).forEach((n) => {
    if (!n) { out.push(P([R("(수집 항목 없음)", { size: 22 })])); return; }
    const title = isGlobal ? (n.title_ko || n.title) : n.title;
    const summ = isGlobal ? (n.summary_ko || n.text_ko) : (n.snippet || n.text);
    const tag = `(${n.source || "-"})${kindTag(n.kind)} `;
    const tw = textW(tag, 22); // 제목 줄바꿈 시 출처 태그 뒤로 정렬
    out.push(P([R(`${tag}${title}`, { size: 22, bold: true })], { indent: { left: tw, hanging: tw }, spacing: { line: LINE, lineRule: "auto", before: 0, after: 30 } }));
    if (summ) out.push(P([R(cut(summ, 300), { size: 20, color: "444444" })], { indent: { left: tw }, spacing: { line: LINE, lineRule: "auto", before: 0, after: GAP } }));
  });
  return out;
}
function box(children) {
  const b = { style: BorderStyle.SINGLE, size: 6, color: "555555" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: b, bottom: b, left: b, right: b, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({ margins: { top: 140, bottom: 140, left: 180, right: 180 }, children })] })],
  });
}

export async function buildIssuesDocx({ dateLabel, weekText, items, global }) {
  const list = items || [], gl = global || [];
  const ch = [];

  // ── 1페이지: 표지(단독) ──
  ch.push(C([R("RM팀 위험관리 MI", { bold: true, size: 52 })], { spacing: { before: 1600, after: 120 } }));
  ch.push(C([R(`(${dateLabel})`, { size: 26 })], { spacing: { before: 0, after: 140 } }));
  ch.push(C([R("* 주요 키워드 : 지급여력·K-ICS·자본/건전성·IFRS17·금리리스크", { size: 18, color: "BFBFBF" })], { spacing: { before: 0, after: 0 } }));

  // ── 2페이지: Summary 국내 ── (페이지 나눔은 단락속성 대신 PageBreak로 → 좌측 ■ 표시 없음)
  ch.push(C([new PageBreak(), R("< Summary >", { bold: true, size: 30 })], { spacing: { line: LINE, lineRule: "auto", before: 0, after: GAP } }));
  ch.push(P([R("1. 국내", { bold: true, size: 24 })], { spacing: { line: LINE, lineRule: "auto", before: 0, after: 80 } }));
  ch.push(box(entryParas(list, false)));
  // ── 3페이지: Summary 해외 ──
  ch.push(P([new PageBreak(), R("2. 해외", { bold: true, size: 24 })], { spacing: { line: LINE, lineRule: "auto", before: 0, after: 80 } }));
  ch.push(box(entryParas(gl, true)));

  // ── 본문(Ⅰ Ⅱ … 번호, 로마자 뒤 점 없음) ──
  let k = 0;
  const titleLine = (n, t) => P([
    new PageBreak(),
    R(`${++k}. ${t}`, { bold: true, size: 24 }),
    R(`   ${src(n)}`, { size: 18, color: "888888" }),
  ], { spacing: { line: LINE, lineRule: "auto", before: 0, after: GAP } });
  const fallback = P([R("(본문을 불러오지 못했습니다. 아래 링크로 확인하세요.)", { color: "888888" })]);

  list.forEach((n) => {
    ch.push(titleLine(n, n.title));
    const b = bodyParas(n.text);
    ch.push(...(b.length ? b : [fallback]));
    ch.push(linkP(n.link, "원문 전체 보기 ▶"));
  });
  gl.forEach((n) => {
    ch.push(titleLine(n, n.title_ko || n.title));
    if (n.title_ko) ch.push(P([R(n.title, { color: "888888" })]));
    const ko = bodyParas(n.text_ko);
    if (ko.length) { ch.push(head("□ 번역문 (한글)")); ch.push(...ko); }
    ch.push(head("□ 원문 (영문)"));
    const en = bodyParas(n.text, { color: "555555" });
    ch.push(...(en.length ? en : [fallback]));
    ch.push(linkP(n.link, "원문 전체 보기 ▶"));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children: ch }],
  });
  const out = Buffer.from(await Packer.toBuffer(doc));
  // 후처리: 한글 단어 잘림 방지(wordWrap=0, 어절 단위 줄바꿈) + 한글-영문/숫자 자동 간격 해제
  try {
    const zip = await JSZip.loadAsync(out);
    let dx = await zip.file("word/document.xml").async("string");
    dx = dx.replace(/<w:spacing (?!w:val=")/g, '<w:wordWrap w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing ');
    zip.file("word/document.xml", dx);
    return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  } catch (e) { console.error("[docx] 후처리 실패:", e.message); return out; }
}
