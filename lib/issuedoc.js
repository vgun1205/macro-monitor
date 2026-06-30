// 경제 이슈·규제 동향 워드(.docx).
// 양식: A4, 여백 상하 2.5cm·좌우 2cm, 글씨 11pt 통일, 줄간격 1.3, 자간 좁게 0.3pt.
// 구성: 표지 → 국내 기사(기사별 1장: 요약+본문 연달아) → 글로벌 기사(요약+번역문+원문).
// 본문 기호: □(큰 항목) / 들여쓴 -(하위 항목) — 정부·기관 보도자료 스타일.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink } from "docx";

const FONT = "맑은 고딕";
const MARGIN = { top: 1417, bottom: 1417, left: 1134, right: 1134 }; // 2.5/2cm
const LINE = 336; // 줄간격 1.4 (가독성)
const SZ = 22;    // 11pt
const CSP = -6;   // 자간 좁게 0.3pt
const STEP = 360; // 들여쓰기 단위(0.25in)
const HANG = 260; // 내어쓰기(불릿 폭) — 줄바꿈 시 본문 정렬

const R = (text, o = {}) => new TextRun({ text, size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ ...opt, children: Array.isArray(runs) ? runs : [runs] });
const src = (n) => `출처: ${n.source || "-"}${n.date ? `  ·  ${n.date}` : ""}`;
// 섹션 헤더(□ 요약/본문/원문 등): 위 간격으로 구분
const head = (t) => P([R(t, { bold: true, color: "1F5FBF" })], { spacing: { before: 170, after: 60 } });
const linkP = (link, label) => P([new ExternalHyperlink({ link, children: [new TextRun({ text: label, size: SZ, font: FONT, characterSpacing: CSP, color: "1F5FBF", underline: {} })] })], { spacing: { before: 140 } });

// 본문 줄을 □/- 기호 + 계층 들여쓰기(내어쓰기 포함)로 변환한 문단 배열
function bodyParas(text, runOpt = {}) {
  return (text || "").split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    let lvl = 0, out = line, marker = true;
    if (/^[□ㅁ◈■]\s*/.test(line)) { out = "□ " + line.replace(/^[□ㅁ◈■]\s*/, ""); lvl = 0; }
    else if (/^[○ㅇ◦∙·]\s*/.test(line)) { out = "- " + line.replace(/^[○ㅇ◦∙·]\s*/, ""); lvl = 1; }
    else if (/^[-‐–]\s*/.test(line)) { out = "- " + line.replace(/^[-‐–]\s*/, ""); lvl = 1; }
    else if (/^\*\s*/.test(line)) { out = "* " + line.replace(/^\*\s*/, ""); lvl = 2; } // 보충 설명(*)
    else if (/^[①-⑮]\s*/.test(line)) { lvl = 1; }                                       // 번호 항목
    else { marker = false; }
    const bracket = !marker && /^<.{1,40}>$/.test(out); // < 소비자 유의사항 > 류 소제목
    const isMain = marker && lvl === 0;
    const indent = marker ? { left: STEP * lvl + HANG, hanging: HANG } : { left: 0 };
    return P([R(out, { ...runOpt, ...(bracket ? { bold: true } : {}) })], {
      spacing: { line: LINE, lineRule: "auto", before: isMain || bracket ? 90 : 0, after: marker ? 50 : 110 },
      indent,
    });
  });
}
// 요약/단문 — 한 단계 들여쓰기 + 첫줄 정렬
const para = (text) => P([R(text, { color: "333333" })], { spacing: { line: LINE, lineRule: "auto", after: 120 }, indent: { left: STEP, hanging: 0 } });

export async function buildIssuesDocx({ dateLabel, weekText, items, global }) {
  const list = items || [];
  const gl = global || [];
  const children = [];

  // ── 표지 ──
  children.push(P([R(`보험사 위험관리 MI (${dateLabel})`, { bold: true })], { spacing: { after: 60 } }));
  children.push(P([R(`경제 이슈 및 규제 동향 · ${weekText} · 총 ${list.length + gl.length}건`, { color: "6B7280" })], { spacing: { after: 60 } }));

  // ── 국내 기사: 기사별 1장, 요약 + 본문 연달아 ──
  list.forEach((n, i) => {
    children.push(P([R(`[국내 ${i + 1}] ${n.title}`, { bold: true, color: "147B8C" })], { pageBreakBefore: true, spacing: { after: 30, line: LINE, lineRule: "auto" } }));
    children.push(P([R(src(n), { color: "888888" })], { spacing: { after: 120 } }));
    if (n.snippet) { children.push(head("□ 요약")); children.push(para(n.snippet)); }
    children.push(head("□ 본문"));
    const body = bodyParas(n.text);
    if (body.length) children.push(...body);
    else children.push(P([R("(본문을 불러오지 못했습니다. 아래 링크로 확인하세요.)")], { spacing: { line: LINE, lineRule: "auto" } }));
    children.push(linkP(n.link, "원문 전체 보기 ▶"));
  });

  // ── 🌐 글로벌 기사: 요약 + 번역문(한글) + 원문(영문) ──
  gl.forEach((n, i) => {
    children.push(P([R(`[글로벌 ${i + 1}] ${n.title_ko || n.title}`, { bold: true, color: "B8742A" })], { pageBreakBefore: true, spacing: { after: 30, line: LINE, lineRule: "auto" } }));
    if (n.title_ko) children.push(P([R(n.title, { color: "888888" })], { spacing: { after: 30 } }));
    children.push(P([R(src(n), { color: "888888" })], { spacing: { after: 120 } }));
    if (n.summary_ko) { children.push(head("□ 요약")); children.push(para(n.summary_ko)); }
    if (n.text_ko) { children.push(head("□ 번역문 (한글)")); children.push(...bodyParas(n.text_ko)); }
    children.push(head("□ 원문 (영문)"));
    const eng = bodyParas(n.text, { color: "555555" });
    if (eng.length) children.push(...eng);
    else children.push(P([R("(본문을 불러오지 못했습니다. 아래 링크로 확인하세요.)")], { spacing: { line: LINE, lineRule: "auto" } }));
    children.push(linkP(n.link, "원문 전체 보기 ▶"));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
