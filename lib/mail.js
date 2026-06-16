// 일일 보고서 이메일 (Gmail) — 전체 표 + 추세 + 지표설명/이슈, 엑셀·PDF(2장) 첨부, 다수 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, fmtLevel, fmtDelta, fmtTitleDate } from "./report.js";
import { getConfig } from "./db.js";

const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#C0392B", DOWN = "#1F5FBF", FLAT = "#6B7280";
const deltaColor = (s) => (s.startsWith("▲") ? UP : s.startsWith("▼") ? DOWN : FLAT);
const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',system-ui,sans-serif";
const HDR = "#34404f", THIN = "1px solid #d4d8de", GROUP = "2px solid #5b6472", SECT = "3px solid #34404f", OUTER = "2px solid #34404f";
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
    { label: "증감 (bp·%)", delta: true, cols: [{ key: "d", title: "전일" }, { key: "mom", title: "전월" }, { key: "qoq", title: "전분기" }, { key: "yoy", title: "전년" }] },
  ];
}

function renderTable(rep, fontPx) {
  const groups = colGroups(rep);
  const f = fontPx, fh = Math.max(10, fontPx - 1), pad = fontPx <= 11 ? "3px 5px" : "6px 10px";
  const hcell = (t, rowspan, first) =>
    `<th${rowspan ? ` rowspan="${rowspan}"` : ""} style="padding:${pad};border:${THIN};${first ? `border-left:${OUTER};` : ""}background:${HDR};color:#fff;font-size:${fh}px;font-weight:700;white-space:nowrap">${t}</th>`;
  let top = hcell("분류", 2, true) + hcell("지표", 2);
  let sub = "";
  for (const g of groups) {
    top += `<th colspan="${g.cols.length}" style="padding:${pad};border:${THIN};border-left:${GROUP};background:${HDR};color:#fff;font-size:${fh}px;font-weight:700;white-space:nowrap">${g.label}</th>`;
    g.cols.forEach((c, i) => { sub += `<th style="padding:${pad};border:${THIN};${i === 0 ? `border-left:${GROUP};` : ""}background:${HDR};color:#fff;font-size:${fh}px;font-weight:600;white-space:nowrap">${c.title}</th>`; });
  }
  top += hcell("추세", 2, false); // 추세 컬럼(상단 rowspan)

  let body = "";
  for (const sec of rep.sections) {
    sec.rows.forEach((row, i) => {
      const sTop = i === 0 ? `border-top:${SECT};` : "";
      body += `<tr>`;
      if (i === 0) body += `<td rowspan="${sec.rows.length}" style="padding:${pad};border:${THIN};border-left:${OUTER};border-top:${SECT};background:#eef0f3;font-size:${fh}px;font-weight:800;text-align:center;vertical-align:middle;white-space:nowrap">${sec.label}</td>`;
      body += `<td style="padding:${pad};border:${THIN};${sTop}text-align:left;font-size:${f}px;font-weight:600;white-space:nowrap">${row.label}</td>`;
      for (const g of groups) {
        g.cols.forEach((c, ci) => {
          const first = ci === 0 ? `border-left:${GROUP};` : "";
          if (g.delta) {
            const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]);
            body += `<td style="padding:${pad};border:${THIN};${first}${sTop}text-align:right;font-size:${f}px;font-weight:600;color:${deltaColor(s)};white-space:nowrap">${s}</td>`;
          } else {
            body += `<td style="padding:${pad};border:${THIN};${first}${sTop}${g.cur ? "background:#eef1f6;font-weight:700;" : ""}text-align:right;font-size:${f}px;white-space:nowrap">${fmtLevel(row.kind, row.levels[c.key])}</td>`;
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

export async function buildXlsx(rep) {
  const lvl = [["cur", `금일 ${dayLabel(rep.currentDate)}`], ["prevDay", "전일"], ["d2", "2일전"], ["d3", "3일전"], ["y23", "’23末"], ["y24", "’24末"], ["y25", "’25末"]];
  const dlt = [["d", "전일비"], ["mom", "전월비"], ["qoq", "전분기비"], ["yoy", "전년비"]];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`거시지표_${rep.currentDate}`);
  const ncol = 2 + lvl.length + dlt.length + 1;
  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell(1, 1).value = TITLE(rep);
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.addRow(["분류", "지표", ...lvl.map((c) => c[1]), ...dlt.map((c) => c[1]), "추세"]);
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).alignment = { horizontal: "center" };
  for (const sec of rep.sections) {
    for (const row of sec.rows) {
      ws.addRow([
        sec.label, row.label,
        ...lvl.map((c) => fmtLevel(row.kind, row.levels[c[0]])),
        ...dlt.map((c) => fmtDelta(row.kind, row.levels.cur, row.base[c[0]])),
        sparkText(row.spark || []).txt,
      ]);
    }
  }
  ws.columns.forEach((col) => { col.width = 11; });
  ws.getColumn(1).width = 13; ws.getColumn(2).width = 14; ws.getColumn(ncol).width = 13;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];
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
