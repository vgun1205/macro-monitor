// 경제 이슈·규제 동향 워드(.docx).
// 양식: A4, 여백 상하 2.5cm·좌우 2cm, 글씨 11pt 통일, 줄간격 1.3, 자간 좁게 0.3pt.
// 1) 첫 1~2장 = 기사 제목·요약·출처 모음(목차)  2) 이후 기사 1개당 1장 = 원문 전문.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink } from "docx";

const FONT = "맑은 고딕";
// twips: 1cm ≈ 567. 상하 2.5cm=1417, 좌우 2cm=1134
const MARGIN = { top: 1417, bottom: 1417, left: 1134, right: 1134 };
const LINE = 312; // 줄간격 1.3 (240 * 1.3), lineRule auto
const SZ = 22;    // 글씨 11pt 통일 (half-points)
const CSP = -6;   // 자간: 좁게 0.3pt (20/pt → 6, 좁게=음수)

const R = (text, o = {}) => new TextRun({ text, size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ ...opt, children: Array.isArray(runs) ? runs : [runs] });
const src = (n) => `출처: ${n.source || "-"}${n.date ? `  ·  ${n.date}` : ""}`;

export async function buildIssuesDocx({ dateLabel, weekText, items, global }) {
  const list = items || [];
  const gl = global || [];
  const children = [];

  // ── 표지/요약 모음(첫 1~2장) ──
  children.push(P([R(`보험사 위험관리 MI (${dateLabel})`, { bold: true })], { spacing: { after: 60 } }));
  children.push(P([R(`경제 이슈 및 규제 동향 · ${weekText} · 키워드: 지급여력·K-ICS·자본/건전성·IFRS17·금리리스크`, { color: "6B7280" })], { spacing: { after: 160 } }));
  children.push(P([R(`■ 기사 요약 (총 ${list.length}건)`, { bold: true, color: "1F5FBF" })], { spacing: { after: 100 } }));

  list.forEach((n, i) => {
    children.push(P([R(`${i + 1}. ${n.title}`, { bold: true })], { spacing: { before: 140, after: 30, line: LINE, lineRule: "auto" } }));
    children.push(P([R(src(n), { color: "888888" })], { spacing: { after: 30 } }));
    if (n.snippet) children.push(P([R(n.snippet, { color: "333333" })], { spacing: { line: LINE, lineRule: "auto", after: 40 } }));
  });

  // ── 기사 원문(기사 1개당 1장) ──
  list.forEach((n, i) => {
    children.push(P([R(`${i + 1}. ${n.title}`, { bold: true })], { pageBreakBefore: true, spacing: { after: 50, line: LINE, lineRule: "auto" } }));
    children.push(P([R(src(n), { color: "888888" })], { spacing: { after: 140 } }));

    const paras = (n.text || "").split(/\n{1,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (paras.length) {
      paras.forEach((pa) => children.push(P([R(pa)], { spacing: { line: LINE, lineRule: "auto", before: 0, after: 60 } }))); // 문단내 0pt, 문단 사이 3pt
    } else {
      children.push(P([R(n.snippet || "(원문을 불러오지 못했습니다. 아래 링크로 확인하세요.)")], { spacing: { line: LINE, lineRule: "auto" } }));
    }

    children.push(P([new ExternalHyperlink({ link: n.link, children: [new TextRun({ text: "원문 전체 보기 ▶", size: SZ, font: FONT, characterSpacing: CSP, color: "1F5FBF", underline: {} })] })], { spacing: { before: 160 } }));
  });

  // ── 🌐 글로벌 위험관리 MI (해외 자본·규제 동향) — 기사 1개당 1장 ──
  gl.forEach((n, i) => {
    children.push(P([R(`[글로벌 ${i + 1}] ${n.title_ko || n.title}`, { bold: true, color: "B8742A" })], { pageBreakBefore: true, spacing: { after: 30, line: LINE, lineRule: "auto" } }));
    if (n.title_ko) children.push(P([R(n.title, { color: "888888" })], { spacing: { after: 30 } })); // 영문 원제목
    children.push(P([R(`출처: ${n.source || "-"}${n.date ? `  ·  ${n.date}` : ""}`, { color: "888888" })], { spacing: { after: 120 } }));
    if (n.summary_ko) {
      children.push(P([R("■ 요약", { bold: true, color: "1F5FBF" })], { spacing: { after: 30 } }));
      children.push(P([R(n.summary_ko, { color: "333333" })], { spacing: { line: LINE, lineRule: "auto", after: 120 } }));
    }
    children.push(P([R("■ 원문 (영문)", { bold: true, color: "1F5FBF" })], { spacing: { after: 30 } }));
    const paras = (n.text || "").split(/\n{1,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (paras.length) {
      paras.forEach((pa) => children.push(P([R(pa)], { spacing: { line: LINE, lineRule: "auto", before: 0, after: 60 } })));
    } else {
      children.push(P([R("(유료/차단으로 본문을 불러오지 못했습니다. 아래 링크로 확인하세요.)")], { spacing: { line: LINE, lineRule: "auto" } }));
    }
    children.push(P([new ExternalHyperlink({ link: n.link, children: [new TextRun({ text: "원문 전체 보기 ▶", size: SZ, font: FONT, characterSpacing: CSP, color: "1F5FBF", underline: {} })] })], { spacing: { before: 120 } }));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } },
    sections: [{ properties: { page: { margin: MARGIN } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
