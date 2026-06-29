// 최근 이슈·규제 동향 → 워드(.docx) 생성. 제목·매체·날짜·요약(스니펫)·원문링크.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } from "docx";

export async function buildIssuesDocx({ dateLabel, weekText, items }) {
  const children = [
    new Paragraph({ text: "최근 이슈 · 규제 동향", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `${weekText}  ·  작성 ${dateLabel}`, color: "6B7280", size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: "키워드: 지급여력 · K-ICS · 보험 자본/건전성/규제", color: "9AA0AB", size: 16 })] }),
    new Paragraph({ text: "" }),
  ];
  if (!items || !items.length) {
    children.push(new Paragraph("수집된 항목이 없습니다."));
  } else {
    items.forEach((n, i) => {
      children.push(new Paragraph({ spacing: { before: 180, after: 40 }, children: [new TextRun({ text: `${i + 1}. ${n.title}`, bold: true, size: 24 })] }));
      const meta = [n.source, n.date].filter(Boolean).join("  ·  ");
      if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, color: "888888", size: 18 })] }));
      if (n.snippet) children.push(new Paragraph({ children: [new TextRun({ text: n.snippet, size: 20 })] }));
      children.push(new Paragraph({ children: [new ExternalHyperlink({ link: n.link, children: [new TextRun({ text: "원문 보기", style: "Hyperlink", size: 18 })] })] }));
    });
  }
  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
