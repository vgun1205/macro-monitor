// 일일 보고서 이메일 (Gmail) — 전체 표 + 추세 + 지표설명/이슈, 엑셀·PDF(2장) 첨부, 다수 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, buildDaily, DAILY_COLS, fmtLevel, fmtDelta, fmtTitleDate } from "./report.js";
import { getConfig } from "./db.js";

const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#C0392B", DOWN = "#1F5FBF", FLAT = "#6B7280";
const deltaColor = (s) => (s.startsWith("+") ? UP : s.startsWith("△") ? DOWN : FLAT);
const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',system-ui,sans-serif";
// 깨끗한 팔레트: 헤더 무색(흰 배경·진회색 글자), 얇은 회색선
const HDR_BG = "#ffffff", HDR_FG = "#2a2f3a";
const THIN = "1px solid #e4e6ea", GROUP = "1px solid #b9bec8", SECT = "2px solid #aab0bb", OUTER = "1px solid #aab0bb", HEADBASE = "2px solid #8a909c", BOX = "1.5px solid #7a818d";
const TITLE = (rep) => `거시경제지표 현황 (${fmtTitleDate(rep.currentDate)})`;

const BLOCKS = "▁▂▃▄▅▆▇█";
function sparkText(vals) {
  const v = vals.filter((x) => x != null);
  if (v.length < 2) return { txt: "–", color: FLAT };
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const txt = vals.map((x) => (x == null ? " " : BLOCKS[Math.min(7, Math.floor(((x - min) / span) * 7.999))])).join("");
  const color = v[v.length - 1] > v[0] ? UP : v[v.length - 1] < v[0] ? DOWN : FLAT;
  return { txt, color };
}

function colGroups(rep) {
  return [
    { label: "현재", cur: true, cols: [{ key: "cur", title: dayLabel(rep.currentDate) }] },
    { label: "최근", cols: [{ key: "prevDay", title: "전일" }, { key: "d2", title: "2일전" }, { key: "d3", title: "3일전" }] },
    { label: "연말", cols: [{ key: "y23", title: "’23末" }, { key: "y24", title: "’24末" }, { key: "y25", title: "’25末" }] },
    { label: "증감", delta: true, flat: true, cols: [{ key: "d", title: "전일比" }, { key: "mom", title: "전월比" }, { key: "qoq", title: "전분기比" }, { key: "yoy", title: "전년比" }] },
  ];
}

function renderTable(rep, fontPx) {
  const groups = colGroups(rep);
  const f = fontPx, fh = Math.max(10, fontPx - 1), pad = fontPx <= 11 ? "3px 6px" : "6px 11px";
  const hbase = `padding:${pad};border:${THIN};border-bottom:${HEADBASE};background:${HDR_BG};color:${HDR_FG};font-weight:700;white-space:nowrap`;
  const hcell = (t, rowspan, first) =>
    `<th${rowspan ? ` rowspan="${rowspan}"` : ""} style="${hbase};${first ? `border-left:${OUTER};` : ""}font-size:${fh}px">${t}</th>`;
  let top = hcell("분류", 2, true) + hcell("지표", 2);
  let sub = "";
  for (const g of groups) {
    if (g.flat) {
      // 증감 블록: 그룹헤더 없이 전일比/전월比/… 한 줄(rowspan) + 박스 테두리
      g.cols.forEach((c, i) => {
        const bx = `${i === 0 ? `border-left:${BOX};` : ""}${i === g.cols.length - 1 ? `border-right:${BOX};` : ""}`;
        top += `<th rowspan="2" style="${hbase};border-top:${BOX};${bx}font-size:${fh}px">${c.title}</th>`;
      });
    } else {
      top += `<th colspan="${g.cols.length}" style="${hbase};border-left:${GROUP};font-size:${fh}px">${g.label}</th>`;
      g.cols.forEach((c, i) => { sub += `<th style="${hbase};${i === 0 ? `border-left:${GROUP};` : ""}font-weight:600;font-size:${fh}px">${c.title}</th>`; });
    }
  }
  top += hcell("추세", 2, false);

  let body = "";
  for (const sec of rep.sections) {
    sec.rows.forEach((row, i) => {
      // 섹션 첫 행 굵은 구분선 + (금리·해외 내부) 미국→유럽 경계 구분선
      const subDiv = i > 0 && row.label.startsWith("유럽") ? `border-top:${SECT};` : "";
      const sTop = i === 0 ? `border-top:${SECT};` : subDiv;
      body += `<tr>`;
      if (i === 0) body += `<td rowspan="${sec.rows.length}" style="padding:${pad};border:${THIN};border-left:${OUTER};border-top:${SECT};background:#f6f7f9;font-size:${fh}px;font-weight:700;text-align:center;vertical-align:middle;white-space:nowrap">${sec.label}</td>`;
      body += `<td style="padding:${pad};border:${THIN};${sTop}text-align:left;font-size:${f}px;font-weight:600;white-space:nowrap">${row.label}</td>`;
      for (const g of groups) {
        g.cols.forEach((c, ci) => {
          if (g.delta) {
            const bx = `${ci === 0 ? `border-left:${BOX};` : ""}${ci === g.cols.length - 1 ? `border-right:${BOX};` : ""}`;
            const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]);
            body += `<td style="padding:${pad};border:${THIN};${bx}${sTop}text-align:right;font-size:${f}px;font-weight:600;color:${deltaColor(s)};white-space:nowrap">${s}</td>`;
          } else {
            const first = ci === 0 ? `border-left:${GROUP};` : "";
            body += `<td style="padding:${pad};border:${THIN};${first}${sTop}${g.cur ? "background:#eef4fb;font-weight:700;" : ""}text-align:right;font-size:${f}px;white-space:nowrap">${fmtLevel(row.kind, row.levels[c.key])}</td>`;
          }
        });
      }
      const sp = sparkText(row.spark || []);
      body += `<td style="padding:${pad};border:${THIN};${sTop}text-align:center;font-size:${f + 2}px;letter-spacing:1px;color:${sp.color};white-space:nowrap;font-family:monospace">${sp.txt}</td>`;
      body += `</tr>`;
    });
  }
  return `<table style="border-collapse:collapse;border:${OUTER}"><thead><tr>${top}</tr><tr>${sub}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderNotes(rep, issues) {
  const note = (issues && issues.trim()) ? issues.trim().replace(/\n/g, "<br>") : "—  (코멘트 미입력)";
  return `<div style="font-size:13px;color:#1a1d23;line-height:1.85">
    <h3 style="font-size:16px;margin:0 0 6px">지표 근거 · 설명</h3>
    <b>출처</b><br>
    · 국고채(3~30Y): 한국은행 ECOS 시장금리(817Y002) · 미국채(5~30Y): FRED(DGS) · 유럽(10/20Y): ECB 유로존 AAA 국채(YC)<br>
    · 환율: 원/달러·원/유로 매매기준율(ECOS 731Y001) · 주가: 코스피·삼성전자 종가(Yahoo)<br>
    · 신용(평가사 수익률): 채권시가평가 — 회사채 AA- 3Y는 ECOS(평가사 민평) 자동, 특수채 AAA 5/10Y·회사채 AA- 10Y는 평가사 5사평균 <b>수기입력</b><br><br>
    <b>스프레드 산식</b> (= 평가사수익률 − 국고채 동일만기)<br>
    · 특수채 AAA 5Y = 특수채AAA5Y − 국고 5Y · 특수채 AAA 10Y = 특수채AAA10Y − 국고 10Y<br>
    · 회사채 AA- 3Y = 회사채AA-3Y − 국고 3Y · 회사채 AA- 10Y = 회사채AA-10Y − 국고 10Y<br><br>
    <b>표기</b><br>
    · 발표지연 지표는 기준일 시점 <b>최신 가용값(as-of)</b> · 기준일 = 국고채 최신 발표일<br>
    · 증감 단위: 금리·스프레드 <b>bp</b>, 환율·주가 <b>%</b> · 상승 <span style="color:${UP}">▲</span> 하락 <span style="color:${DOWN}">▼</span> · 추세 = 최근 영업일 흐름<br>
    · ※ 공식 보고서는 채권금리를 <b>평가사 5사평균(채권시가평가수익률)</b>으로 산출 → 본 앱은 ECOS(한국은행) 국고채 기준이라 소수점 단위 차이가 있을 수 있음<br><br>
    <h3 style="font-size:16px;margin:6px 0">최근 이슈 · 코멘트</h3>
    <div style="background:#f6f7f9;border:1px solid #d4d8de;border-radius:6px;padding:12px;line-height:1.8">${note}</div>
  </div>`;
}

export function buildHtml(rep, issues) {
  return `<div style="font-family:${FONT};color:#1a1d23;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased">
    <h2 style="margin:0 0 12px;font-size:20px;letter-spacing:-0.02em;font-weight:800">${TITLE(rep)}</h2>
    ${renderTable(rep, 14)}
    <div style="margin-top:16px;border-top:${THIN};padding-top:12px">${renderNotes(rep, issues)}</div>
    <p style="font-size:13.5px;margin-top:12px"><a href="${process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app"}" style="color:#1F5FBF;font-weight:700;text-decoration:none">▶ 대시보드 열기</a></p>
  </div>`;
}

// PDF: 1장 = 장표(가로), 2장 = 지표 근거·설명·이슈
export function buildPdfHtml(rep, issues) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap');
      * { font-family:'Nanum Gothic',sans-serif !important; box-sizing:border-box; }
      @page { size: A4 landscape; margin: 9mm; }
      body { margin:0; color:#1a1d23; font-variant-numeric:tabular-nums; }
      h2 { margin:0 0 8px; font-size:17px; font-weight:800; }
    </style></head><body>
    <div><h2>${TITLE(rep)}</h2>${renderTable(rep, 10)}</div>
    <div style="page-break-before:always;padding-top:4px">${renderNotes(rep, issues)}</div>
  </body></html>`;
}

// 데일리 로그: 일자=행(최신 위), 지표=열(분류 그룹 헤더). 값은 숫자로 저장(텍스트 경고 없음).
export async function buildXlsx(rep) {
  const { data, dates } = await buildDaily();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("거시지표");
  const ncol = 1 + DAILY_COLS.length;

  // 그룹 구간 계산
  const groups = [];
  let prevG = null;
  for (const c of DAILY_COLS) {
    if (c.g !== prevG) { groups.push({ name: c.g, start: groups.length ? groups[groups.length - 1].start + groups[groups.length - 1].span : 2, span: 1 }); prevG = c.g; }
    else groups[groups.length - 1].span++;
  }

  // 1행: 제목
  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell(1, 1).value = TITLE(rep);
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  // 2~3행: 헤더(일자 병합 + 그룹 + 지표명)
  ws.mergeCells(2, 1, 3, 1);
  ws.getCell(2, 1).value = "일자";
  for (const g of groups) { ws.mergeCells(2, g.start, 2, g.start + g.span - 1); ws.getCell(2, g.start).value = g.name; }
  DAILY_COLS.forEach((c, i) => { ws.getCell(3, 2 + i).value = c.label; });
  [2, 3].forEach((r) => { ws.getRow(r).font = { bold: true }; ws.getRow(r).alignment = { horizontal: "center", vertical: "middle" }; });

  // 4행~: 일자별 데이터(숫자)
  let r = 4;
  for (const date of dates) {
    const row = data[date] || {};
    ws.getCell(r, 1).value = date;
    DAILY_COLS.forEach((c, i) => {
      let v = null;
      if (c.derive) { const a = row[c.derive[0]], b = row[c.derive[1]]; v = a != null && b != null ? Number((a - b).toFixed(4)) : null; }
      else v = row[c.id] != null ? Number(row[c.id]) : null;
      if (v != null) { const cell = ws.getCell(r, 2 + i); cell.value = v; cell.numFmt = c.fmt; }
    });
    r++;
  }

  ws.getColumn(1).width = 12;
  for (let i = 0; i < DAILY_COLS.length; i++) ws.getColumn(2 + i).width = 11;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function sendReportMail(toOverride) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = (toOverride || process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user || !pass || !to.length) return "skip(no-config)";
  const rep = await buildReport();
  if (!rep) return "skip(no-data)";
  const issues = await getConfig("report_note");

  const html = buildHtml(rep, issues);
  const attachments = [{ filename: `거시지표_${rep.currentDate}.xlsx`, content: await buildXlsx(rep) }];
  let pdfOk = false, pdfErr = "";
  try {
    const { buildPdf } = await import("./pdf.js");
    attachments.push({ filename: `거시지표_${rep.currentDate}.pdf`, content: await buildPdf(buildPdfHtml(rep, issues)) });
    pdfOk = true;
  } catch (e) { pdfErr = e.message; console.error("[mail] PDF 생성 실패:", e.message); }

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `거시모니터 <${user}>`, to,
    subject: `[거시모니터] ${TITLE(rep)}`,
    html, attachments,
  });
  return `sent(${to.length},xlsx${pdfOk ? "+pdf" : ",pdf실패:" + pdfErr})`;
}
