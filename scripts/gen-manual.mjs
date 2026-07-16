// 위험관리 MI 사용설명서 생성기 (v5)
// 사용: node scripts/gen-manual.mjs  → 바탕화면에 docx 저장(PDF 변환·manual.js 갱신은 별도)
// 스타일: 지훈 스타일 — □(굵게)·-(하위)·*(파랑 10pt), 문단(□) 앞 간격 크게(블록 구분), wordWrap.
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableLayoutType, VerticalAlign } from "docx";
import JSZip from "jszip";
import fs from "fs";
const FONT = { ascii: "바탕체", hAnsi: "바탕체", eastAsia: "바탕체", cs: "바탕체" };
const MARGIN = { top: 1418, bottom: 1418, left: 1134, right: 1134 };
const LINE = 300, SZ = 22, CSP = -6, BLUE = "0070C0";
const R = (t, o = {}) => new TextRun({ text: t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'), size: SZ, font: FONT, characterSpacing: CSP, ...o });
const P = (runs, opt = {}) => new Paragraph({ spacing: { line: LINE, lineRule: "auto", before: 0, after: 60 }, ...opt, children: Array.isArray(runs) ? runs : [runs] });
const C = (runs, opt = {}) => P(runs, { alignment: AlignmentType.CENTER, ...opt });
const spread = (t) => (/^[가-힣]{2}$/.test(t) ? t[0] + " " + t[1] : t);
// 글자폭(twips): 전각=220, 반각=110 (11pt 기준). 콜론(:) 뒷줄 정렬 계산용.
const charW = (c) => (/[ᄀ-ᇿ⺀-퟿豈-﫿！-｠「」·※①-⑮➊-➓□○◈■◦]/.test(c) ? 220 : 110);
const textW = (s) => [...(s || "")].reduce((a, c) => a + charW(c), 0);
// 마커 문단 내어쓰기: '라벨 : 내용'이면 다음 줄을 콜론 뒤로 정렬(상한 2400 — 과도한 들여쓰기 방지)
function hangFor(marker, text, defHang) {
  const full = marker + text;
  const ci = full.indexOf(":");
  if (ci > 1 && ci <= 20) return Math.min(textW(full.slice(0, ci + 1) + " "), 2400);
  return defHang;
}
// H: 섹션 제목(다음 문단과 분리 금지)
const H = (n, t) => P([R(`${n}. ${spread(t)}`, { bold: true, size: 24 })], { keepNext: true, spacing: { line: LINE, lineRule: "auto", before: 320, after: 130 } });
// □ 문단: 첫 줄 60, 앞 간격 200(블록 구분). 하위(-)와 분리 금지.
const B = (t) => { const hw = hangFor("□ ", t, 300); return P([R("□ " + t, { bold: true })], { keepNext: true, indent: { left: 60 + hw, hanging: hw }, spacing: { line: LINE, lineRule: "auto", before: 200, after: 50 } }); };
// - 하위: 첫 줄 480 (□보다 한 단계만 깊게)
const D = (t) => { const hw = hangFor("- ", t, 280); return P([R("- " + t)], { indent: { left: 480 + hw, hanging: hw }, spacing: { line: LINE, lineRule: "auto", before: 0, after: 40 } }); };
// * 보충: 첫 줄 760 (-보다 한 단계만 깊게), 10pt 파랑
const S = (t) => { const hw = hangFor("* ", t, 220); return P([R("* " + t, { size: 20, color: BLUE })], { indent: { left: 760 + hw, hanging: hw }, spacing: { line: 240, lineRule: "auto", before: 0, after: 40 } }); };
const bd = { style: BorderStyle.SINGLE, size: 4, color: "777777" };
const borders = { top: bd, bottom: bd, left: bd, right: bd, insideH: bd, insideV: bd };
// 표: □ 본문 위치(360)에 맞춰 들여쓰기, 전체 너비 축소(≈9000twips), 고정 레이아웃(열 너비 강제 → 셀 단어 끊김 방지)
function tbl(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w / total) * 9000));
  const mk = (t, head) => new TableCell({
    shading: head ? { type: ShadingType.CLEAR, fill: "F2F2F2" } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ spacing: { line: 264, lineRule: "auto", before: 0, after: 0 }, children: [new TextRun({ text: t.replace(/[‘’]/g, "'"), size: 20, font: FONT, characterSpacing: CSP, bold: head })] })],
  });
  return new Table({
    width: { size: 9000, type: WidthType.DXA }, indent: { size: 360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED, borders, columnWidths: scaled,
    rows: [new TableRow({ children: headers.map((h) => mk(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => mk(c, false)) }))],
  });
}
const ch = [];
ch.push(C([R("위험관리 MI 사용설명서", { bold: true, size: 40 })], { spacing: { before: 200, after: 80 } }));
ch.push(C([R("(RM팀 · 2026-07-16)", { size: 22, color: "888888" })], { spacing: { line: 240, after: 200 } }));

ch.push(H(1, "개요"));
ch.push(B("위험관리 MI는 '위험관리 담당자가 매일 챙겨야 할 정보'를 대신 챙겨주는 자동 서비스입니다."));
ch.push(D("매 영업일 오전 9시, 국내(금감원·금융위·손보협회·언론)와 글로벌(해외 전문매체) 자료를 자동으로 수집·번역·정리해 메일 1통으로 보내드립니다."));
ch.push(D("받은 메일 하나로 : 오늘의 기사 확인 → 주간 핵심 이슈 파악 → 원문(PDF) 열람 → 과거 유사 사례 검색까지 가능합니다."));

ch.push(H(2, "이 서비스의 장점"));
ch.push(B("기존 방식과 비교하면 아래와 같습니다."));
ch.push(tbl(["구분", "기존 방식", "위험관리 MI"], [
  ["정보수집", "금감원·금융위·협회·언론사를 각각 방문해 검색 (30분 이상)", "메일 1통으로 자동 도착 (3분 열람)"],
  ["해외동향", "영문 기사 직접 검색·해석 부담", "한글 번역 제목·요약·본문 제공"],
  ["원문확인", "사이트에서 다시 찾아 다운로드", "금감원·금융위·협회 원본 PDF 첨부"],
  ["주간정리", "직접 요약·보고 자료 작성", "AI가 핵심 이슈 3~5개 자동 브리핑"],
  ["과거사례", "예전 기사 다시 찾기 어려움", "아카이브에서 키워드·기간·기관별 즉시 검색"],
  ["누락위험", "바쁘면 놓침", "매일 자동, 증분 방식으로 빠짐없이"],
], [1400, 3850, 3750]));
ch.push(B("핵심 강점 요약"));
ch.push(D("자동 : 사람이 안 챙겨도 매일 아침 정시에 도착합니다."));
ch.push(D("맞춤 : 지급여력(K-ICS)·자본·BCM·제3자 리스크 등 팀 업무 키워드 중심으로만 선별합니다."));
ch.push(D("신뢰 : 유명 매체 우선 + 감독당국 원문 PDF 그대로 첨부, AI 요약은 원문 근거로만 생성합니다."));
ch.push(D("축적 : 모든 자료가 아카이브에 자동 저장되어, 이슈 발생 시 과거 유사 사례를 바로 찾을 수 있습니다."));

ch.push(H(3, "아침 3분 활용법"));
ch.push(B("메일이 도착하면 이 순서로 보시면 됩니다."));
ch.push(D("① 제목 확인 : '위험관리 MI ｜ Daily & Archive (날짜)' 메일을 엽니다."));
ch.push(D("② 주간 흐름 파악(30초) : 상단 초록 버튼 '🧭 주간 위험관리 AI 브리핑'을 누르면 이번 주 핵심 이슈 3~5개와 유의사항이 바로 아래에 펼쳐집니다."));
ch.push(D("③ 오늘 기사 훑기(1분) : 국내 → 글로벌 순으로 헤드라인을 훑습니다. 제목 오른쪽 #태그(#K-ICS #자본 등)로 관심 기사만 골라 봐도 됩니다."));
ch.push(D("④ 자세히 보기(1분) : 관심 기사는 제목 클릭(원문 이동) 또는 첨부 워드(요약+본문 정리)로 확인합니다. 감독당국 자료는 첨부 원본 PDF를 바로 열면 됩니다."));
ch.push(D("⑤ 과거가 궁금하면 : '비슷한 일이 전에도 있었나?' → 첨부 아카이브(HTML)를 열어 키워드로 검색합니다. (6장 참고)"));

ch.push(H(4, "무엇을 어디서 모으나"));
ch.push(B("국내 소스 (수록 순서대로)"));
ch.push(tbl(["순서", "소스", "내용"], [
  ["1", "금융감독원 보도자료", "보험·위험관리 관련 감독 이슈 (원문 PDF 첨부)"],
  ["2", "금융위원회 보도자료", "제도·정책 중 위험관리 관련 (원문 PDF 첨부)"],
  ["3", "손해보험협회 보도자료·공지", "업계 공식 자료 (원문 PDF 첨부)"],
  ["4", "국내 언론", "연합뉴스·한국경제·매일경제·더벨 등 유명 매체 우선"],
], [700, 3000, 5800]));
ch.push(B("글로벌 소스"));
ch.push(D("해외 보험·재보험 전문매체(Reinsurance News, Artemis)의 기사를 한국어로 번역해 제공합니다."));
ch.push(B("추적 키워드(예시)"));
ch.push(D("지급여력·K-ICS·경과조치·자본확충·IFRS17·내부통제·BCM·사업연속성·위험관리위원회·제3자 리스크·전산장애·재보험·주담대·신용대출·삼성화재·캐노피우스 등"));
ch.push(S("키워드·회사 추가를 원하시면 RM팀 담당자에게 요청하면 바로 반영됩니다."));

ch.push(H(5, "매일 받는 메일 구성"));
ch.push(B("메일 본문"));
ch.push(D("상단 버튼 2개 : '📱 모바일용 아카이브 검색'(웹으로 열기, 아래에 수집기간 표기) / '🧭 주간 AI 브리핑'(누르면 본문 아래 펼침)"));
ch.push(D("🇰🇷 국내 기사 : (출처)(보도/공지) 제목 — 출처별 색상(금감원 파랑·금융위 남보라·협회 주황·뉴스 청록)"));
ch.push(D("🌐 글로벌 기사 : (매체) 한글 제목 + 영문 원제목"));
ch.push(D("각 제목 오른쪽 : 관심 키워드 태그 1~2개 (#자본 #M&A 등)"));
ch.push(B("첨부 파일 4종"));
ch.push(tbl(["첨부", "용도"], [
  ["위험관리MI_날짜.docx", "기사 요약+본문 전문을 보고서 양식으로 정리 — 인쇄·회람용"],
  ["원본 PDF (금감원·금융위·협회)", "감독당국 발표 원문 그대로 — 도표·수치 확인용"],
  ["MI_아카이브_날짜.html", "과거 기사 검색 + 주간 브리핑 — PC에서 열람"],
  ["사용설명서.pdf", "본 문서"],
], [4000, 5600]));

ch.push(H(6, "PC에서 아카이브(HTML) 활용"));
ch.push(B("여는 방법"));
ch.push(D("첨부 'MI_아카이브_날짜.html'을 더블클릭하면 브라우저로 열립니다. 인터넷 연결이 없어도 동작합니다."));
ch.push(B("🧭 주간 AI 브리핑"));
ch.push(D("이번 주 핵심 이슈와 유의사항을 보여주고, 주차 버튼(이번 주/지난 주/2주 전…)으로 과거 브리핑도 조회합니다."));
ch.push(B("🔎 기사 검색 — 과거 유사 사례 찾기"));
ch.push(D("키워드 : 상단 칩 클릭(지급여력·K-ICS·BCM·삼성화재 등) 또는 검색창에 직접 입력"));
ch.push(D("기간 : 전체 / 최근 1주 / 1개월 / 3개월 / 올해"));
ch.push(D("구분 : 전체 / 금감원 / 금융위 / 손보협회 / 국내뉴스 / 글로벌"));
ch.push(D("기사 카드를 클릭하면 요약이 펼쳐지고, '원문 ▶'으로 원문 페이지로 이동합니다."));
ch.push(D("예시 : '전산장애 관련 과거 사례 찾기' → 칩에서 '전산장애' 클릭 → 기간 '올해' → 결과 열람"));
ch.push(B("📷 영역 캡처 — 보고자료에 붙여넣기"));
ch.push(D("우측 하단 '📷 영역 캡처' 클릭 → 마우스로 원하는 부분 드래그 → 그 영역만 이미지(PNG)로 저장됩니다. (취소 : Esc)"));
ch.push(B("기타"));
ch.push(D("상단에 수집기간(예: 2026년 5월 8일 ~ 오늘)이 표기되고, 자료는 매일 자동으로 쌓입니다."));
ch.push(D("제목(MI 아카이브)을 클릭하면 검색·필터가 초기화됩니다."));

ch.push(H(7, "모바일에서 보기"));
ch.push(B("메일 본문만으로 충분합니다."));
ch.push(D("'🧭 주간 AI 브리핑' 버튼 → 본문 아래에 전체 내용이 펼쳐집니다."));
ch.push(D("국내·글로벌 기사 목록도 본문에 그대로 표시됩니다."));
ch.push(B("검색이 필요하면"));
ch.push(D("'📱 모바일용 아카이브 검색' 버튼 → 모바일 브라우저에서 전체 검색 화면이 열립니다."));
ch.push(S("첨부 HTML 파일은 모바일 메일앱이 '이미지 미리보기'로만 보여줘 버튼·검색이 동작하지 않습니다. 모바일은 반드시 위 버튼(웹)을 이용하세요."));

ch.push(H(8, "수신 안내"));
ch.push(B("발송·수신 기준"));
ch.push(D("발송 : 평일(월~금) 오전 9시 1회. 주말·공휴일은 발송하지 않습니다."));
ch.push(D("증분 방식 : 직전 발송 이후 새로 올라온 자료만 담습니다. 신규가 적은 날은 분량이 줄 수 있으며, 누락·중복은 없습니다."));
ch.push(D("수신인은 서로 표시되지 않습니다(숨은참조 발송)."));
ch.push(D("수신자 추가·제외, 키워드 요청 : RM팀 담당자에게 연락하시면 됩니다."));

ch.push(H(9, "자주 묻는 질문"));
ch.push(B("FAQ"));
ch.push(D("Q. 모바일에서 첨부 HTML이 흐린 이미지로 보여요. → A. 메일앱의 미리보기일 뿐입니다. '📱 모바일용 아카이브 검색' 버튼(웹)으로 여시면 됩니다."));
ch.push(D("Q. 어떤 기사는 요약이 짧아요. → A. 해당 언론사가 본문 수집을 막은 경우입니다. '원문 ▶' 링크로 확인해 주세요."));
ch.push(D("Q. 옛날 이슈를 찾고 싶어요. → A. 첨부 아카이브에서 키워드·기간·기관으로 검색하세요. 자료는 매일 자동 축적됩니다."));
ch.push(D("Q. 우리 회사(삼성화재)나 특정 해외사 소식만 모아볼 수 있나요? → A. 아카이브 키워드 칩의 '삼성화재', '캐노피우스'처럼 등록해 드립니다. 담당자에게 요청하세요."));

const doc = new Document({ styles: { default: { document: { run: { font: FONT, size: SZ, characterSpacing: CSP } } } }, sections: [{ properties: { page: { margin: MARGIN } }, children: ch }] });
let buf = Buffer.from(await Packer.toBuffer(doc));
const zip = await JSZip.loadAsync(buf);
let dx = await zip.file("word/document.xml").async("string");
dx = dx.replace(/<w:spacing (?!w:val=")/g, '<w:wordWrap w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing ');
zip.file("word/document.xml", dx);
buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
fs.writeFileSync("C:/Users/82108/Desktop/위험관리 MI 사용설명서.docx", buf);
console.log("saved docx", (buf.length / 1024).toFixed(0) + "KB · □ 문단 앞 간격 200(블록 구분 강화)");
