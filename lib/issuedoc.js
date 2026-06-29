// 경제 이슈·규제 동향 워드(.docx). 맑은 고딕 + 줄간격 + 기사당 요지(약 800자) + 원문링크.
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink } from "docx";

const FONT = "맑은 고딕";

// 기사 본문에서 자주 끼는 군더더기 제거
function clean(t) {
  return (t || "")
    .replace(/기사의?\s*본문\s*내용은[^.]*변경됩니다\.?/g, "")
    .replace(/[ⓒ©][^.\n]{0,40}(무단|저작권|재배포)[^.\n]*/g, "")
    .replace(/무단\s*전재[^.\n]*/g, "")
    .replace(/저작권자[^.\n]*/g, "")
    .replace(/\[(사진|이미지|자료)\s*=[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildIssuesDocx({ dateLabel, weekText, items }) {
  const R = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
  const P = (runs, opt = {}) => new Paragraph({ ...opt, children: Array.isArray(runs) ? runs : [runs] });

  const children = [
    P([R("경제 이슈 및 규제 동향", { bold: true, size: 30 })], { spacing: { after: 80 } }),
    P([R(`${weekText} · 작성 ${dateLabel} · 키워드: 지급여력·K-ICS·보험 자본/규제`, { size: 18, color: "6B7280" })], { spacing: { after: 220 } }),
  ];

  if (!items || !items.length) {
    children.push(P([R("수집된 항목이 없습니다.")]));
  } else {
    items.forEach((n, i) => {
      children.push(P([R(`${i + 1}. ${n.title}`, { bold: true, size: 24 })], { spacing: { before: 260, after: 40 } }));
      const meta = [n.source, n.date].filter(Boolean).join("  ·  ");
      if (meta) children.push(P([R(meta, { size: 18, color: "888888" })], { spacing: { after: 60 } }));
      const full = clean(n.text || n.snippet || "");
      const body = full.slice(0, 800);
      if (body) children.push(P([R(body + (full.length > 800 ? " …" : ""), { size: 22 })], { spacing: { line: 336, lineRule: "auto", after: 80 } }));
      children.push(P([new ExternalHyperlink({ link: n.link, children: [new TextRun({ text: "원문 전체 보기 ▶", font: FONT, color: "1F5FBF", underline: {}, size: 18 })] })]));
    });
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
