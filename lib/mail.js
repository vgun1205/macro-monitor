// 일일 보고서 이메일 발송 (Gmail SMTP) — 전체 표 HTML 본문 + 엑셀 첨부, 여러 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, fmtLevel, fmtDelta } from "./report.js";

const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#C0392B", DOWN = "#1F5FBF", FLAT = "#6B7280";
const deltaColor = (s) => (s.startsWith("▲") ? UP : s.startsWith("▼") ? DOWN : FLAT);
const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',system-ui,sans-serif";
// 통일된 헤더색 / 경계선
const HDR = "#34404f", THIN = "1px solid #d4d8de", GROUP = "2px solid #5b6472", SECT = "3px solid #34404f", OUTER = "2px solid #34404f";

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
  const hcell = (t, rowspan, first) =>
    `<th${rowspan ? ` rowspan="${rowspan}"` : ""} style="padding:8px 10px;border:${THIN};${first ? `border-left:${OUTER};` : ""}background:${HDR};color:#fff;font-size:13px;font-weight:700;white-space:nowrap">${t}</th>`;
  // 헤더 2단 — 색상 통일(전부 동일 네이비)
  let top = hcell("분류", 2, true) + hcell("지표", 2);
  let sub = "";
  for (const g of groups) {
    top += `<th colspan="${g.cols.length}" style="padding:8px 10px;border:${THIN};border-left:${GROUP};background:${HDR};color:#fff;font-size:13px;font-weight:700;white-space:nowrap">${g.label}</th>`;
    g.cols.forEach((c, i) => {
      sub += `<th style="padding:6px 9px;border:${THIN};${i === 0 ? `border-left:${GROUP};` : ""}background:${HDR};color:#fff;font-size:12.5px;font-weight:600;white-space:nowrap">${c.title}</th>`;
    });
  }

  let body = "";
  for (const sec of rep.sections) {
    sec.rows.forEach((row, i) => {
      const sTop = i === 0 ? `border-top:${SECT};` : "";
      body += `<tr>`;
      if (i === 0) body += `<td rowspan="${sec.rows.length}" style="padding:6px 10px;border:${THIN};border-left:${OUTER};border-top:${SECT};background:#eef0f3;font-size:13px;font-weight:800;text-align:center;vertical-align:middle;white-space:nowrap">${sec.label}</td>`;
      body += `<td style="padding:6px 10px;border:${THIN};${sTop}text-align:left;font-size:14px;font-weight:600;white-space:nowrap">${row.label}</td>`;
      for (const g of groups) {
        g.cols.forEach((c, ci) => {
          const first = ci === 0 ? `border-left:${GROUP};` : "";
          if (g.delta) {
            const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]);
            body += `<td style="padding:6px 10px;border:${THIN};${first}${sTop}text-align:right;font-size:14px;font-weight:600;color:${deltaColor(s)};white-space:nowrap">${s}</td>`;
          } else {
            body += `<td style="padding:6px 10px;border:${THIN};${first}${sTop}${g.cur ? "background:#eef1f6;font-weight:700;" : ""}text-align:right;font-size:14px;white-space:nowrap">${fmtLevel(row.kind, row.levels[c.key])}</td>`;
          }
        });
      }
      body += `</tr>`;
    });
  }

  const notes = `<div style="margin-top:16px;border-top:${THIN};padding-top:12px;font-size:12.5px;color:#3a3f47;line-height:1.8">
    <b style="font-size:13px;color:#1a1d23">지표 안내</b><br>
    · 국고채(3~30Y): 한국은행 ECOS 시장금리 · 미국채(5~30Y): FRED · 유럽(10/20Y): ECB 유로존 AAA 국채<br>
    · 환율: 원/달러·원/유로 매매기준율(ECOS) · 주가: 코스피·삼성전자 종가(Yahoo)<br>
    · 신용스프레드 = 평가수익률 − 국고채(동일만기). 회사채 AA- 3Y는 자동계산, 특수채 AAA·회사채 AA- 10Y는 평가사 5사평균 기준 수기입력<br>
    · 발표지연 지표는 기준일 시점 <b>최신 가용값(as-of)</b> 표시 · 증감 단위: 금리·스프레드 <b>bp</b>, 환율·주가 <b>%</b> · 상승 <span style="color:${UP}">▲</span> 하락 <span style="color:${DOWN}">▼</span><br>
    · ※ 공식 보고서는 채권금리를 <b>‘평가사 5사평균(채권시가평가수익률)’</b>으로 산출 → 본 앱은 ECOS(한국은행) 국고채라 소수점 단위 차이가 있을 수 있습니다.
  </div>`;

  return `<div style="font-family:${FONT};color:#1a1d23;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased">
    <h2 style="margin:0 0 2px;font-size:20px;letter-spacing:-0.02em;font-weight:800">거시경제지표 현황</h2>
    <div style="color:#6b7280;font-size:13px;margin-bottom:12px">기준일 <b>${rep.currentDate}</b></div>
    <table style="border-collapse:collapse;border:${OUTER}">
      <thead><tr>${top}</tr><tr>${sub}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${notes}
    <p style="font-size:13.5px;margin-top:12px"><a href="${process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app"}" style="color:#1F5FBF;font-weight:700;text-decoration:none">▶ 대시보드 열기</a></p>
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

export async function sendReportMail(toOverride) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = toOverride
    ? toOverride.split(",").map((s) => s.trim()).filter(Boolean)
    : (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user || !pass || !to.length) return "skip(no-config)";
  const rep = await buildReport();
  if (!rep) return "skip(no-data)";

  const html = buildHtml(rep);
  const attachments = [{ filename: `거시지표_${rep.currentDate}.xlsx`, content: await buildXlsx(rep) }];
  // PDF 첨부(베스트에포트 — 실패해도 메일은 발송)
  let pdfOk = false, pdfErr = "";
  try {
    const { buildPdf } = await import("./pdf.js");
    attachments.push({ filename: `거시지표_${rep.currentDate}.pdf`, content: await buildPdf(html) });
    pdfOk = true;
  } catch (e) { pdfErr = e.message; console.error("[mail] PDF 생성 실패:", e.message); }

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `거시모니터 <${user}>`,
    to,
    subject: `[거시모니터] 거시경제지표 현황 (${rep.currentDate})`,
    html,
    attachments,
  });
  return `sent(${to.length},xlsx${pdfOk ? "+pdf" : ",pdf실패:" + pdfErr})`;
}
