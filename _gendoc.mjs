// 위험관리 MI 사용설명서 v2 — 계층 정리(□ 상위, - 하위; □ 뒤엔 반드시 -)
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from "docx";
import JSZip from "jszip";
import fs from "fs";
const FONT = { ascii: "바탕체", hAnsi: "바탕체", eastAsia: "바탕체", cs: "바탕체" };
const MARGIN = { top: 1418, bottom: 1418, left: 1134, right: 1134 };
const LINE = 300, SZ = 22, CSP = -6, BLUE = "0070C0";
const R = (t, o = {}) => new TextRun({ text: t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'), size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ spacing: { line: LINE, lineRule: "auto", before: 0, after: 60 }, ...opt, children: Array.isArray(runs) ? runs : [runs] });
const C = (runs, opt = {}) => P(runs, { alignment: AlignmentType.CENTER, ...opt });
const spread = (t) => (/^[가-힣]{2}$/.test(t) ? t[0] + " " + t[1] : t);
const H = (n, t) => P([R(`${n}. ${spread(t)}`, { bold: true, size: 24 })], { spacing: { line: LINE, lineRule: "auto", before: 260, after: 120 } });
const B = (t) => P([R("□ " + t, { bold: true })], { indent: { left: 360, hanging: 300 }, spacing: { line: LINE, lineRule: "auto", before: 60, after: 50 } });
const D = (t) => P([R("- " + t)], { indent: { left: 760, hanging: 280 }, spacing: { line: LINE, lineRule: "auto", before: 0, after: 40 } });
const S = (t) => P([R("* " + t, { size: 20, color: BLUE })], { indent: { left: 980, hanging: 220 }, spacing: { line: 240, lineRule: "auto", before: 0, after: 90 } });
const bd = { style: BorderStyle.SINGLE, size: 4, color: "777777" };
const borders = { top: bd, bottom: bd, left: bd, right: bd, insideH: bd, insideV: bd };
function tbl(headers, rows, widths) {
  const mk = (t, head) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, fill: "F2F2F2" } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ spacing: { line: 264, lineRule: "auto" }, children: [new TextRun({ text: t.replace(/[‘’]/g, "'"), size: 20, font: FONT, characterSpacing: CSP, bold: head })] })] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, columnWidths: widths, rows: [new TableRow({ children: headers.map((h) => mk(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => mk(c, false)) }))] });
}
const SP = () => P([R("")], { spacing: { line: 160, lineRule: "auto", after: 40 } });
const ch = [];

ch.push(C([R("위험관리 MI 사용설명서", { bold: true, size: 40 })], { spacing: { before: 200, after: 80 } }));
ch.push(C([R("(RM팀 · 2026-07-09)", { size: 22, color: "888888" })], { spacing: { line: 240, after: 200 } }));

ch.push(H(1, "개요"));
ch.push(B("위험관리 MI는 국내(금감원·손보협회·언론)와 글로벌(해외 전문매체)의 위험관리 자료를 매 영업일 아침 자동으로 수집·번역·정리해 메일로 보내드리는 서비스입니다."));
ch.push(D("발송 : 평일 오전 9시 자동 1회"));
ch.push(D("구성 : 메일 본문(브리핑·기사 목록) + 첨부 4종(워드·원본 PDF·검색 아카이브·사용설명서)"));

ch.push(H(2, "매일 받는 메일 구성"));
ch.push(B("메일 본문"));
ch.push(D("제목 : 위험관리 MI ｜ Daily & Archive (날짜)"));
ch.push(D("상단 버튼 : 📱 모바일용 아카이브 검색(웹 열기) / 🧭 주간 AI 브리핑(탭하면 본문 아래에 전체 펼침)"));
ch.push(D("🇰🇷 국내 기사 : (출처)(보도/공지) 제목 — 출처별 색상(금감원 파랑·협회 주황·뉴스 청록)"));
ch.push(D("🌐 글로벌 기사 : (매체) 한글 제목 + 영문 원제목"));
ch.push(B("첨부 파일"));
ch.push(tbl(["첨부", "내용"], [
  ["위험관리MI_날짜.docx", "기사 정리 보고서(요약·본문 전문, RM팀 양식)"],
  ["원본 PDF", "금감원·손보협회 보도자료 원문(도표·그림 포함)"],
  ["MI_아카이브_날짜.html", "과거 기사 검색·주간 브리핑(PC에서 검색 가능)"],
  ["사용설명서.pdf", "본 문서"],
], [3600, 6000]));

ch.push(H(3, "PC에서 아카이브(HTML) 활용"));
ch.push(B("여는 방법"));
ch.push(D("첨부 HTML을 더블클릭 → 브라우저로 열면 아래 기능을 사용합니다. (모바일은 4장 참고)"));
ch.push(B("🧭 주간 AI 브리핑"));
ch.push(D("이번 주 핵심 이슈 3~5개와 유의사항을 자동 정리해 보여줍니다."));
ch.push(D("상단 주차 버튼(이번 주/지난 주/2주 전…)으로 과거 브리핑도 조회합니다."));
ch.push(B("🔎 기사 검색"));
ch.push(D("키워드 : 상단 칩(지급여력·K-ICS·경과조치·삼성화재·캐노피우스 등) 클릭 또는 검색창 입력"));
ch.push(D("기간 : 전체 / 최근 1주 / 1개월 / 3개월 / 올해 버튼으로 선택"));
ch.push(D("구분 : 전체 / 금감원·협회 / 국내뉴스 / 글로벌 로 골라보기"));
ch.push(D("기사 카드 클릭 시 요약이 펼쳐지고, ‘원문 ▶’으로 원문 이동"));
ch.push(D("하단 페이지 번호로 이동(페이지당 20건), 우측 하단 ↑ 로 맨 위로"));
ch.push(B("📷 영역 캡처"));
ch.push(D("우측 하단 ‘📷 영역 캡처’ 클릭 → 마우스/손가락으로 원하는 범위 드래그 → 그 부분만 이미지(PNG) 저장 (취소 : Esc)"));
ch.push(B("기타"));
ch.push(D("제목(MI 아카이브) 클릭 = 검색·필터 초기화(홈)"));

ch.push(H(4, "모바일에서 보기"));
ch.push(B("메일 본문만으로 확인"));
ch.push(D("🧭 AI 브리핑 버튼을 누르면 본문 아래에 전체 내용이 나옵니다."));
ch.push(D("국내·글로벌 기사 목록이 본문에 그대로 표시됩니다."));
ch.push(B("검색까지 하려면"));
ch.push(D("‘📱 모바일용 아카이브 검색’ 버튼을 탭 → 모바일 브라우저에서 전체 검색 화면 사용"));
ch.push(S("HTML 첨부 파일은 모바일 메일앱이 ‘이미지 미리보기’로만 보여줘 작동하지 않습니다. 반드시 위 버튼(웹) 또는 PC를 이용하세요."));

ch.push(H(5, "수신 안내"));
ch.push(B("발송·수신 기준"));
ch.push(D("발송 시간 : 평일(월~금) 오전 9시. 주말·공휴일은 발송하지 않습니다."));
ch.push(D("증분 방식 : 직전 발송 이후 새로 올라온 자료만 담아 누락·중복이 없습니다(신규가 적은 날은 분량이 줄 수 있음)."));
ch.push(D("수신자 변경·문의 : RM팀 담당자에게 요청."));

ch.push(H(6, "자주 묻는 질문"));
ch.push(B("FAQ"));
ch.push(D("Q. 모바일에서 첨부 HTML이 작게/흐리게 보여요. → A. 메일앱의 이미지 미리보기일 뿐이며, ‘📱 모바일용 아카이브 검색’ 버튼(웹)으로 여시면 됩니다."));
ch.push(D("Q. 요약이 짧은 기사가 있어요. → A. 해당 기사의 본문 추출이 막힌 경우입니다(사이트 차단 등). ‘원문 ▶’ 링크로 확인해 주세요."));
ch.push(D("Q. 과거 이슈를 찾고 싶어요. → A. 아카이브의 기간·구분·키워드로 검색하면 됩니다. 자료는 매일 자동으로 쌓입니다."));

const doc = new Document({ styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } }, sections: [{ properties: { page: { margin: MARGIN } }, children: ch }] });
let buf = Buffer.from(await Packer.toBuffer(doc));
const zip = await JSZip.loadAsync(buf);
let dx = await zip.file("word/document.xml").async("string");
dx = dx.replace(/<w:spacing (?!w:val=")/g, '<w:wordWrap w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing ');
zip.file("word/document.xml", dx);
buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
fs.writeFileSync("C:/Users/82108/Desktop/위험관리 MI 사용설명서.docx", buf);
console.log("saved docx", (buf.length / 1024).toFixed(0) + "KB");
