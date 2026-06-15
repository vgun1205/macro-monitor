// 일일 보고서 이메일 발송 (Gmail SMTP) — 전체 표 HTML 본문 + 엑셀 첨부, 여러 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, fmtLevel, fmtDelta } from "./report.js";

const monthEndLabel = (iso) => (iso ? `'${iso.slice(2, 4)}.${Number(iso.slice(5, 7))}末` : "–");
const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#CB2A3E", DOWN = "#1457BE";
const deltaColor = (s) => (s.startsWith("▲") ? UP : s.startsWith("▼") ? DOWN : "#6B7280");

function columns(rep) {
  const r = rep.ref;
  return {
    levels: [
      { key: "y23", title: "'23末" }, { key: "y24", title: "'24末" }, { key: "y25", title: "'25末" },
      { key: "m3", title: monthEndLabel(r.m3) }, { key: "m2", title: monthEndLabel(r.m2) }, { key: "m1", title: monthEndLabel(r.m1) },
      { key: "prevDay", title: dayLabel(r.prevDay) }, { key: "cur", title: dayLabel(rep.currentDate) },
    ],
    deltas: [{ key: "d", title: "전일比" }, { key: "mom", title: "전월比" }, { key: "qoq", title: "전분기比" }, { key: "yoy", title: "전년比" }],
  };
}

export function buildHtml(rep) {
  const { levels, deltas } = columns(rep);
  const th = (t, extra = "") => `<th style="padding:5px 7px;border:1px solid #cfd3da;background:#eef0f3;font-size:11px;white-space:nowrap;${extra}">${t}</th>`;
  const td = (t, extra = "") => `<td style="padding:4px 7px;border:1px solid #e2e4e9;text-align:right;font-size:11px;white-space:nowrap;${extra}">${t}</td>`;
  let h = `<div style="font-family:'Malgun Gothic',system-ui,sans-serif;color:#15181E">
    <h2 style="margin:0 0 2px">거시경제지표 현황</h2>
    <div style="color:#5B616E;font-size:12px;margin-bottom:10px">기준일 ${rep.currentDate} · 발표지연 지표는 기준일 시점 최신 가용값(as-of)</div>
    <table style="border-collapse:collapse;border:1px solid #9aa0ab">
      <thead><tr>${th("분류", "text-align:left")}${th("지표", "text-align:left")}` +
    levels.map((c) => th(c.title, c.key === "cur" ? "background:#FBF6E9" : "")).join("") +
    deltas.map((c) => th(c.title, "background:#f2f4f7")).join("") + `</tr></thead><tbody>`;
  for (const sec of rep.sections) {
    sec.rows.forEach((row, i) => {
      h += `<tr>`;
      if (i === 0) h += `<td rowspan="${sec.rows.length}" style="padding:4px 8px;border:1px solid #cfd3da;background:#fafaf7;font-size:11px;font-weight:700;text-align:center;vertical-align:middle">${sec.label}</td>`;
      h += `<td style="padding:4px 7px;border:1px solid #e2e4e9;text-align:left;font-size:11px;font-weight:600">${row.label}</td>`;
      h += levels.map((c) => td(fmtLevel(row.kind, row.levels[c.key]), c.key === "cur" ? "background:#FBF6E9;font-weight:700" : "")).join("");
      h += deltas.map((c) => { const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]); return td(s, `color:${deltaColor(s)};font-weight:600`); }).join("");
      h += `</tr>`;
    });
  }
  h += `</tbody></table>
    <p style="color:#5B616E;font-size:11px;margin-top:10px">레벨: 금리·스프레드 %, 환율 원, 주가 pt/원 · 증감: 금리·스프레드 bp, 환율·주가 % · 하락 ▼ · 출처: ECOS·FRED·ECB·Yahoo</p>
    <p style="font-size:12px"><a href="${process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app"}">▶ 대시보드 열기</a></p>
  </div>`;
  return h;
}

export async function buildXlsx(rep) {
  const { levels, deltas } = columns(rep);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`거시지표_${rep.currentDate}`);
  ws.addRow(["분류", "지표", ...levels.map((c) => c.title), ...deltas.map((c) => c.title)]);
  ws.getRow(1).font = { bold: true };
  for (const sec of rep.sections) {
    for (const row of sec.rows) {
      ws.addRow([
        sec.label.replace(/^[^\s]+\s/, ""), row.label,
        ...levels.map((c) => fmtLevel(row.kind, row.levels[c.key])),
        ...deltas.map((c) => fmtDelta(row.kind, row.levels.cur, row.base[c.key])),
      ]);
    }
  }
  ws.columns.forEach((col) => { col.width = 11; });
  ws.getColumn(2).width = 14;
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
