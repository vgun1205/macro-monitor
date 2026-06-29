// 경제 이슈·규제 동향 워드(.docx). 기사 1개당 1장(페이지). 제목 → 요약 → 본문 전문(문단 분리) → 원문링크.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink } from "docx";

const FONT = "맑은 고딕";
const R = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const P = (runs, opt = {}) => new Paragraph({ ...opt, children: Array.isArray(runs) ? runs : [runs] });

export async function buildIssuesDocx({ dateLabel, weekText, items }) {
  const children = [
    P([R(`보험사 위험관리 MI (${dateLabel})`, { bold: true, size: 32 })], { spacing: { after: 60 } }),
    P([R(`경제 이슈 및 규제 동향 · ${weekText} · 키워드: 지급여력·K-ICS·보험 자본/규제`, { size: 18, color: "6B7280" })], { spacing: { after: 120 } }),
    P([R(`총 ${items?.length || 0}건 · 기사별 1페이지`, { size: 16, color: "9AA0AB" })]),
  ];

  (items || []).forEach((n, i) => {
    // 기사 1개 = 1페이지 (둘째 기사부터 페이지 나눔)
    children.push(P([R(`${i + 1}. ${n.title}`, { bold: true, size: 28 })], { pageBreakBefore: i > 0, spacing: { after: 60 } }));
    const meta = [n.source, n.date].filter(Boolean).join("  ·  ");
    if (meta) children.push(P([R(meta, { size: 18, color: "888888" })], { spacing: { after: 120 } }));

    if (n.snippet) {
      children.push(P([R("■ 요약", { bold: true, size: 20, color: "1F5FBF" })], { spacing: { after: 40 } }));
      children.push(P([R(n.snippet, { size: 21, color: "333333" })], { spacing: { line: 320, lineRule: "auto", after: 160 } }));
    }

    children.push(P([R("■ 원문", { bold: true, size: 20, color: "1F5FBF" })], { spacing: { after: 40 } }));
    const paras = (n.text || "").split(/\n{1,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (paras.length) {
      paras.forEach((pa) => children.push(P([R(pa, { size: 21 })], { spacing: { line: 336, lineRule: "auto", after: 120 } })));
    } else {
      children.push(P([R(n.snippet || "(원문을 불러오지 못했습니다. 아래 링크로 확인하세요.)", { size: 21 })]));
    }

    children.push(P([new ExternalHyperlink({ link: n.link, children: [new TextRun({ text: "원문 전체 보기 ▶", font: FONT, color: "1F5FBF", underline: {}, size: 18 })] })], { spacing: { before: 160 } }));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
