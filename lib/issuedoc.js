// 보험사 위험관리 MI 워드(.docx) — 첨부 템플릿(RM팀 위험관리 MI) 양식 반영.
// 표지(중앙 제목·날짜·키워드) → < Summary >(국내/해외 목록) → 본문(Ⅰ.Ⅱ.… 번호, 출처 병기).
// A4, 여백 상하 2.5cm·좌우 2cm, 줄간격 1.4, 자간 좁게 0.3pt, □/들여쓴- 기호.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType } from "docx";

const FONT = "맑은 고딕";
const MARGIN = { top: 1418, bottom: 1418, left: 1134, right: 1134 };
const LINE = 336;  // 줄간격 1.4
const SZ = 22;     // 본문 11pt
const CSP = -6;    // 자간 좁게 0.3pt
const STEP = 360, HANG = 260;

const R = (text, o = {}) => new TextRun({ text, size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ ...opt, children: Array.isArray(runs) ? runs : [runs] });
const C = (runs, opt = {}) => P(runs, { alignment: AlignmentType.CENTER, ...opt });
const linkP = (link, label) => P([new ExternalHyperlink({ link, children: [new TextRun({ text: label, size: SZ, font: FONT, characterSpacing: CSP, color: "1F5FBF", underline: {} })] })], { spacing: { before: 120, after: 40 } });
const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
const roman = (n) => ROMAN[n] || `${n}`;
const cut = (s, n) => { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

// 본문 줄을 □/- 기호 + 계층 들여쓰기(내어쓰기 포함)로 변환
function bodyParas(text, runOpt = {}) {
  return (text || "").split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    let lvl = 0, out = line, marker = true;
    if (/^[□ㅁ◈■]\s*/.test(line)) { out = "□ " + line.replace(/^[□ㅁ◈■]\s*/, ""); lvl = 0; }
    else if (/^[○ㅇ◦∙·]\s*/.test(line)) { out = "- " + line.replace(/^[○ㅇ◦∙·]\s*/, ""); lvl = 1; }
    else if (/^[-‐–]\s*/.test(line)) { out = "- " + line.replace(/^[-‐–]\s*/, ""); lvl = 1; }
    else if (/^\*\s*/.test(line)) { out = "* " + line.replace(/^\*\s*/, ""); lvl = 2; }
    else if (/^[①-⑮➀-➓❶-❿]\s*/.test(line)) { lvl = 1; }
    else { marker = false; }
    const bracket = !marker && /^<.{1,40}>$/.test(out);
    const isMain = marker && lvl === 0;
    return P([R(out, { ...runOpt, ...(bracket ? { bold: true } : {}) })], {
      spacing: { line: LINE, lineRule: "auto", before: isMain || bracket ? 90 : 0, after: marker ? 50 : 110 },
      indent: marker ? { left: STEP * lvl + HANG, hanging: HANG } : { left: 0 },
    });
  });
}

export async function buildIssuesDocx({ dateLabel, weekText, items, global }) {
  const list = items || [], gl = global || [];
  const ch = [];

  // ── 표지 ──
  ch.push(C([R("RM팀 위험관리 MI", { bold: true, size: 52 })], { spacing: { before: 240, after: 60 } }));
  ch.push(C([R(`(${dateLabel})`, { size: 22 })], { spacing: { after: 80 } }));
  ch.push(C([R("* 주요 키워드 : 지급여력·K-ICS·자본/건전성·IFRS17·금리리스크", { size: 18, color: "BFBFBF" })], { spacing: { after: 140 } }));
  ch.push(C([R("RM AI Native", { size: 28, color: "9AA0AB" })], { spacing: { after: 200 } }));

  // ── < Summary > ──
  ch.push(C([R("< Summary >", { bold: true, size: 30 })], { spacing: { before: 60, after: 140 } }));
  ch.push(P([R("1. 국내", { bold: true, size: 26 })], { spacing: { before: 40, after: 70 } }));
  (list.length ? list : [null]).forEach((n) => ch.push(P([R(n ? `- (${n.source || "-"}) ${cut(n.title, 46)}` : "- (수집 항목 없음)", { size: 22 })], { spacing: { after: 50, line: LINE, lineRule: "auto" }, indent: { left: 360, hanging: 220 } })));
  ch.push(P([R("2. 해외", { bold: true, size: 26 })], { spacing: { before: 140, after: 70 } }));
  (gl.length ? gl : [null]).forEach((n) => ch.push(P([R(n ? `- (${n.source || "-"}) ${cut(n.title_ko || n.title, 46)}` : "- (수집 항목 없음)", { size: 22 })], { spacing: { after: 50, line: LINE, lineRule: "auto" }, indent: { left: 360, hanging: 220 } })));

  // ── 본문(Ⅰ.Ⅱ.… 번호) ──
  let k = 0;
  const titleLine = (n, t) => P([
    R(`${roman(++k)}. ${t}`, { bold: true, size: 24 }),
    R(`   * 출처: ${n.source || "-"}${n.date ? ` · ${n.date}` : ""}`, { size: 18, color: "888888" }),
  ], { pageBreakBefore: true, spacing: { after: 90, line: LINE, lineRule: "auto" } });
  const fallback = P([R("(본문을 불러오지 못했습니다. 아래 링크로 확인하세요.)", { color: "888888" })], { spacing: { line: LINE, lineRule: "auto" } });

  // 국내
  list.forEach((n) => {
    ch.push(titleLine(n, n.title));
    const b = bodyParas(n.text);
    ch.push(...(b.length ? b : [fallback]));
    ch.push(linkP(n.link, "원문 전체 보기 ▶"));
  });
  // 해외 — 번역문(한글) + 원문(영문)
  gl.forEach((n) => {
    ch.push(titleLine(n, n.title_ko || n.title));
    if (n.title_ko) ch.push(P([R(n.title, { color: "888888" })], { spacing: { after: 80 } })); // 영문 원제목
    const ko = bodyParas(n.text_ko);
    if (ko.length) { ch.push(P([R("□ 번역문 (한글)", { bold: true, color: "1F5FBF" })], { spacing: { before: 60, after: 40 } })); ch.push(...ko); }
    ch.push(P([R("□ 원문 (영문)", { bold: true, color: "1F5FBF" })], { spacing: { before: 80, after: 40 } }));
    const en = bodyParas(n.text, { color: "555555" });
    ch.push(...(en.length ? en : [fallback]));
    ch.push(linkP(n.link, "원문 전체 보기 ▶"));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children: ch }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
