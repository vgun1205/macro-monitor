// 일일 보고서 이메일 발송 (Gmail SMTP) — 전체 표 HTML 본문 + 엑셀 첨부, 여러 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, fmtLevel, fmtDelta } from "./report.js";

const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#C0392B", DOWN = "#1F5FBF", FLAT = "#6B7280";
const deltaColor = (s) => (s.startsWith("▲") ? UP : s.startsWith("▼") ? DOWN : FLAT);
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',system-ui,sans-serif";

// 컬럼 그룹: 현재 → 최근(전일/2일전/3일전) → 연말(23/24/25) → 증감
function colGroups(rep) {
  return [
    { label: "현재", cur: true, cols: [{ key: "cur", title: dayLabel(rep.currentDate) }] },
    { label: "최근", cols: [{ key: "prevDay", title: "전일" }, { key: "d2", title: "2일전" }, { key: "d3", title: "3일전" }] },
    { label: "연말", cols: [{ key: "y23", title: "’23末" }, { key: "y24", title: "’24末" }, { key: "y25", title: "’25末" }] },
    { label: "증감 (bp·%)", delta: true, cols: [{ key: "d", title: "전일" }, { key: "mom", title: "전월" }, { key: "qoq", title: "전분기" }, { key: "yoy", title: "전년" }] },
  ];
}

export function buildHtml(rep) {
  const groups = colGroups(rep);
  const THICK = "2px solid #6b7280", THIN = "1px solid #d7dade";
  // 그룹 헤더(상단) — 그룹명 colspan
  let topHead = `<th rowspan="2" style="padding:6px 9px;border:${THIN};border-left:${THICK};background:#3a4252;color:#fff;font-size:11px">분류</th>` +
    `<th rowspan="2" style="padding:6px 9px;border:${THIN};background:#3a4252;color:#fff;font-size:11px">지표</th>`;
  let subHead = "";
  for (const g of groups) {
    const gbg = g.cur ? "#B08D3E" : g.delta ? "#566074" : "#454e60";
    topHead += `<th colspan="${g.cols.length}" style="padding:6px 9px;border:${THIN};border-left:${THICK};background:${gbg};color:#fff;font-size:11px;letter-spacing:-0.01em">${g.label}</th>`;
    g.cols.forEach((c, i) => {
      const bg = g.cur ? "#FBF6E9" : "#eef0f3";
      subHead += `<th style="padding:5px 8px;border:${THIN};${i === 0 ? `border-left:${THICK};` : ""}background:${bg};font-size:10.5px;color:#2a2f3a;white-space:nowrap">${c.title}</th>`;
    });
  }
  const tdNum = (t, first, cur) =>
    `<td style="padding:4px 8px;border:${THIN};${first ? `border-left:${THICK};` : ""}${cur ? "background:#FBF6E9;font-weight:700;" : ""}text-align:right;font-size:11px;white-space:nowrap">${t}</td>`;

  let body = "";
  for (const sec of rep.sections) {
    sec.rows.forEach((row, i) => {
      body += `<tr>`;
      if (i === 0) body += `<td rowspan="${sec.rows.length}" style="padding:5px 9px;border:${THIN};border-left:${THICK};background:#f6f6f3;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;white-space:nowrap">${sec.label}</td>`;
      body += `<td style="padding:4px 9px;border:${THIN};text-align:left;font-size:11px;font-weight:600;white-space:nowrap">${row.label}</td>`;
      for (const g of groups) {
        g.cols.forEach((c, ci) => {
          if (g.delta) {
            const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]);
            body += `<td style="padding:4px 8px;border:${THIN};${ci === 0 ? `border-left:${THICK};` : ""}text-align:right;font-size:11px;font-weight:600;color:${deltaColor(s)};white-space:nowrap">${s}</td>`;
          } else {
            body += tdNum(fmtLevel(row.kind, row.levels[c.key]), ci === 0, g.cur);
          }
        });
      }
      body += `</tr>`;
    });
  }

  return `<div style="font-family:${FONT};color:#1a1d23;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased">
    <h2 style="margin:0 0 2px;font-size:18px;letter-spacing:-0.02em;font-weight:800">거시경제지표 현황</h2>
    <div style="color:#6b7280;font-size:12px;margin-bottom:12px">기준일 <b>${rep.currentDate}</b> · 발표지연 지표는 기준일 시점 최신 가용값(as-of)</div>
    <table style="border-collapse:collapse;border:2px solid #3a4252">
      <thead><tr>${topHead}</tr><tr>${subHead}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p style="color:#6b7280;font-size:11px;margin-top:12px;line-height:1.6">레벨: 금리·스프레드 %, 환율 원, 주가 pt/원 · 증감: 금리·스프레드 bp, 환율·주가 % · 하락 <span style="color:${DOWN}">▼</span> 상승 <span style="color:${UP}">▲</span> · 출처: ECOS·FRED·ECB·Yahoo</p>
    <p style="font-size:13px;margin-top:4px"><a href="${process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app"}" style="color:#1F5FBF;font-weight:600;text-decoration:none">▶ 대시보드 열기</a></p>
  </div>`;
}

export async function buildXlsx(rep) {
  const lvl = [
    ["cur", `금일 ${dayLabel(rep.currentDate)}`], ["prevDay", "전일"], ["d2", "2일전"], ["d3", "3일전"],
    ["y23", "’23末"], ["y24", "’24末"], ["y25", "’25末"],
  ];
  const dlt = [["d", "전일비"], ["mom", "전월비"], ["qoq", "전분기비"], ["yoy", "전년비"]];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`거시지표_${rep.currentDate}`);
  ws.addRow(["분류", "지표", ...lvl.map((c) => c[1]), ...dlt.map((c) => c[1])]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: "center" };
  for (const sec of rep.sections) {
    for (const row of sec.rows) {
      ws.addRow([
        sec.label, row.label,
        ...lvl.map((c) => fmtLevel(row.kind, row.levels[c[0]])),
        ...dlt.map((c) => fmtDelta(row.kind, row.levels.cur, row.base[c[0]])),
      ]);
    }
  }
  ws.columns.forEach((col) => { col.width = 11; });
  ws.getColumn(1).width = 13;
  ws.getColumn(2).width = 14;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function sendReportMail() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user || !pass || !to.length) return "skip(no-config)";
  const rep = await buildReport();
  if (!rep) return "skip(no-data)";

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const xlsx = await buildXlsx(rep);
  await transport.sendMail({
    from: `거시모니터 <${user}>`,
    to,
    subject: `[거시모니터] 거시경제지표 현황 (${rep.currentDate})`,
    html: buildHtml(rep),
    attachments: [{ filename: `거시지표_${rep.currentDate}.xlsx`, content: xlsx }],
  });
  return `sent(${to.length})`;
}
