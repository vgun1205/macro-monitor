// 일일 보고서 이메일 (Gmail) — 전체 표 + 추세 + 지표설명/이슈, 엑셀·PDF(2장) 첨부, 다수 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, buildDaily, DAILY_COLS, fmtLevel, fmtDelta, fmtTitleDate } from "./report.js";
import { getConfig } from "./db.js";
import { fetchIssues, enrichFullText } from "./news.js";

const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
const UP = "#C0392B", DOWN = "#1F5FBF", FLAT = "#6B7280";
const deltaColor = (s) => (s.startsWith("+") ? UP : s.startsWith("△") ? DOWN : FLAT);
const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',system-ui,sans-serif";
// 깨끗한 팔레트: 헤더 무색(흰 배경·진회색 글자), 얇은 회색선
const HDR_BG = "#ffffff", HDR_FG = "#2a2f3a";
const THIN = "1px solid #dfe2e7", GROUP = "2px solid #7a818d", SECT = "2px solid #7a818d", SUBDIV = "2px solid #8a909c", OUTER = "2.5px solid #5b626d", HEADBASE = "2px solid #7a818d";
const TITLE = (rep) => `거시경제지표 현황 (${fmtTitleDate(rep.genDate || rep.currentDate)})`;
// 바로가기 링크(이모지+라벨 칩). 필요시 URL만 교체.
const LINKS = [
  ["📊", "전자공시 DART", "https://dart.fss.or.kr"],
  ["⚖️", "국가법령정보", "https://www.law.go.kr"],
  ["🏦", "한국은행 ECOS", "https://ecos.bok.or.kr"],
  ["📑", "채권정보 KOFIA", "https://www.kofiabond.or.kr"],
  ["🌐", "국제금융센터", "https://www.kcif.or.kr"],
  ["📰", "경제뉴스(한경)", "https://markets.hankyung.com"],
];
function linksBar() {
  return `<div style="margin-top:14px">
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;font-weight:700">바로가기</div>
    ${LINKS.map(([ic, label, url]) => `<a href="${url}" style="display:inline-block;margin:0 6px 6px 0;padding:8px 12px;background:#f2f4f7;border:1px solid #d4d8de;border-radius:8px;color:#1a1d23;text-decoration:none;font-size:13px;font-weight:600">${ic} ${label}</a>`).join("")}
  </div>`;
}
// 작성(수집) 기준시각 — KST
const genStamp = () => { const k = new Date(Date.now() + 9 * 3600 * 1000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}시`; };
const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");
const weekLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}월 ${Math.ceil(Number(iso.slice(8, 10)) / 7)}주차` : "");

// 추세 미니 라인차트(SVG) — sharp로 PNG 변환해 임베드(모든 메일 클라이언트 호환)
function sparkSvg(vals) {
  const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p[1]), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const W = 78, H = 20, step = vals.length > 1 ? W / (vals.length - 1) : 0;
  const xy = pts.map(([i, v]) => [i * step, H - 3 - ((v - min) / span) * (H - 6)]);
  const poly = xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  const trend = ys[ys.length - 1] > ys[0] ? UP : ys[ys.length - 1] < ys[0] ? DOWN : FLAT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polyline points="${poly}" fill="none" stroke="${trend}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2" fill="${trend}"/></svg>`;
}
async function buildSparkMap(rep) {
  const map = {};
  try {
    const sharp = (await import("sharp")).default;
    for (let si = 0; si < rep.sections.length; si++) {
      const rows = rep.sections[si].rows;
      for (let ri = 0; ri < rows.length; ri++) {
        const svg = sparkSvg(rows[ri].spark || []);
        if (!svg) continue;
        const png = await sharp(Buffer.from(svg)).png().toBuffer();
        map[`${si}_${ri}`] = `data:image/png;base64,${png.toString("base64")}`;
      }
    }
  } catch (e) { console.error("[mail] 추세 PNG 실패:", e.message); }
  return map;
}

// 현재 그룹 = 금일값 + 전일/전월/전분기/전년 비교(현재값 바로 옆) → 최근 → 연말
function colGroups(rep) {
  return [
    { label: "현재", cols: [
      { key: "cur", title: "현재", cur: true },
      { key: "d", title: "전일比", delta: true }, { key: "mom", title: "전월比", delta: true },
      { key: "qoq", title: "전분기比", delta: true }, { key: "yoy", title: "전년比", delta: true },
    ] },
    { label: "최근", cols: [{ key: "prevDay", title: "전일" }, { key: "d2", title: "2일전" }, { key: "d3", title: "3일전" }] },
    { label: "연말", cols: [{ key: "y23", title: "’23末" }, { key: "y24", title: "’24末" }, { key: "y25", title: "’25末" }] },
  ];
}

function renderTable(rep, fontPx, sparkMap) {
  const groups = colGroups(rep);
  const f = fontPx, fh = Math.max(10, fontPx - 1), pad = fontPx <= 11 ? "3px 7px" : "6px 11px";
  const sm = Math.max(8, fh - 2);
  const base = `background:${HDR_BG};color:${HDR_FG};white-space:nowrap;padding:${pad}`;
  const hGroup = `${base};border:${THIN};border-bottom:${THIN};font-weight:700;font-size:${fh}px`;
  const hCol = `${base};border:${THIN};border-bottom:${HEADBASE};font-weight:600;font-size:${fh}px`;
  const hSpan = `${base};border:${THIN};border-bottom:${HEADBASE};font-weight:700;font-size:${fh}px`;
  const period = rep.strip && rep.strip.length ? `${md(rep.strip[0])}~${md(rep.currentDate)}` : "";
  const pfx = (s) => s.split(" ")[0]; // 미국/유럽/특수채/회사채 구분용

  // 헤더(외곽은 래퍼 div가 담당, 내부 세로줄은 GROUP로 균일)
  let top = `<th rowspan="2" style="${hSpan}">분류</th><th rowspan="2" style="${hSpan};border-left:${GROUP}">지표</th>`;
  let sub = "";
  for (const g of groups) {
    top += `<th colspan="${g.cols.length}" style="${hGroup};border-left:${GROUP}">${g.label}</th>`;
    g.cols.forEach((c, i) => { sub += `<th style="${hCol};${i === 0 ? `border-left:${GROUP};` : ""}">${c.title}</th>`; });
  }
  top += `<th rowspan="2" style="${hSpan};border-left:${GROUP}">추세<br><span style="font-weight:400;font-size:${sm}px;color:#8a909c">${period}</span></th>`;

  let body = "";
  rep.sections.forEach((sec, si) => {
    sec.rows.forEach((row, ri) => {
      // 분류 사이=굵은선(SECT), 분류 내부 소그룹(미국↔유럽, 특수채↔회사채)=약간 굵은선(SUBDIV)
      const isSub = ri > 0 && pfx(row.label) !== pfx(sec.rows[ri - 1].label) && (row.label.startsWith("유럽") || row.label.startsWith("회사채"));
      const sTop = ri === 0 ? `border-top:${SECT};` : isSub ? `border-top:${SUBDIV};` : "";
      body += `<tr>`;
      if (ri === 0) body += `<td rowspan="${sec.rows.length}" style="padding:${pad};border:${THIN};border-top:${SECT};background:#f6f7f9;font-size:${fh}px;font-weight:700;text-align:center;vertical-align:middle;white-space:nowrap">${sec.label}<br><span style="font-weight:400;font-size:${sm}px;color:#7a818d">(단위:${sec.unit})</span><br><span style="font-weight:400;font-size:${sm}px;color:#9aa0ab">* 기준 ${md(sec.asOf)}</span></td>`;
      body += `<td style="padding:${pad};border:${THIN};border-left:${GROUP};${sTop}text-align:left;font-size:${f}px;font-weight:600;white-space:nowrap">${row.label}</td>`;
      for (const g of groups) {
        g.cols.forEach((c, ci) => {
          const gl = ci === 0 ? `border-left:${GROUP};` : "";
          if (c.delta) {
            const s = fmtDelta(row.kind, row.levels.cur, row.base[c.key]);
            body += `<td style="padding:${pad};border:${THIN};${gl}${sTop}text-align:right;font-size:${f}px;font-weight:600;color:${deltaColor(s)};white-space:nowrap">${s}</td>`;
          } else {
            body += `<td style="padding:${pad};border:${THIN};${gl}${sTop}${c.cur ? "background:#eef4fb;font-weight:700;" : ""}text-align:right;font-size:${f}px;white-space:nowrap">${fmtLevel(row.kind, row.levels[c.key])}</td>`;
          }
        });
      }
      const uri = sparkMap && sparkMap[`${si}_${ri}`];
      const cell = uri ? `<img src="${uri}" width="78" height="20" alt="" style="display:block;margin:0 auto"/>` : "–";
      body += `<td style="padding:2px 6px;border:${THIN};border-left:${GROUP};${sTop}text-align:center;white-space:nowrap">${cell}</td>`;
      body += `</tr>`;
    });
  });
  // 외곽 네모: 래퍼 div가 균일한 굵기로 담당
  return `<div style="display:inline-block;border:${OUTER}"><table style="border-collapse:collapse">
    <thead><tr>${top}</tr><tr>${sub}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderNotes(rep, issues) {
  const manual = (issues && issues.trim()) ? `<div style="background:#f6f7f9;border:1px solid #d4d8de;border-radius:6px;padding:10px;line-height:1.8;margin-top:6px">${issues.trim().replace(/\n/g, "<br>")}</div>` : "";
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
    · 증감 단위: 금리·스프레드 <b>bp</b>, 환율·주가 <b>%</b> · 상승 <span style="color:${UP}">+</span> 하락 <span style="color:${DOWN}">△</span> · 추세선 = 최근 ${rep.strip ? rep.strip.length : 10}영업일(${rep.strip && rep.strip.length ? `${md(rep.strip[0])}~${md(rep.currentDate)}` : ""}) 흐름<br>
    · ※ 공식 보고서는 채권금리를 <b>평가사 5사평균(채권시가평가수익률)</b>으로 산출 → 본 앱은 ECOS(한국은행) 국고채 기준이라 소수점 단위 차이가 있을 수 있음<br><br>
    <h3 style="font-size:16px;margin:6px 0">경제 이슈 · 규제 동향 <span style="font-size:12.5px;font-weight:600;color:#6b7280">(${weekLabel(rep.genDate || rep.currentDate)})</span></h3>
    ${manual}
    <div style="font-size:11.5px;color:#6b7280;margin-top:4px">※ 관련 기사 요약·원문은 별도 메일 <b>‘경제 이슈 및 규제 동향’</b>(워드 첨부)로 발송됩니다.</div>
  </div>`;
}

export function buildHtml(rep, issues, sparkMap) {
  return `<div style="font-family:${FONT};color:#1a1d23;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased">
    <h2 style="margin:0 0 2px;font-size:20px;letter-spacing:-0.02em;font-weight:800">${TITLE(rep)}</h2>
    <div style="color:#6b7280;font-size:12px;margin:0 0 12px">데이터 기준 ${genStamp()} (KST) · 기준일 ${rep.currentDate}</div>
    ${renderTable(rep, 14, sparkMap)}
    ${linksBar()}
    <div style="margin-top:16px;border-top:${THIN};padding-top:12px">${renderNotes(rep, issues)}</div>
    <p style="font-size:13.5px;margin-top:12px"><a href="${process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app"}" style="color:#1F5FBF;font-weight:700;text-decoration:none">▶ 대시보드 열기</a></p>
  </div>`;
}

// PDF: 메일 본문과 동일한 화면(폭 맞춤은 pdf.js에서 scale 처리)
export function buildPdfHtml(rep, issues, sparkMap) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap');
      * { font-family:'Nanum Gothic',sans-serif !important; box-sizing:border-box; }
      body { margin:0; padding:6px; }
    </style></head><body>${buildHtml(rep, issues, sparkMap)}</body></html>`;
}

// ── 별도 메일: 경제 이슈 및 규제 동향 (본문=요약 목록, 첨부 워드=기사별 원문) ──
// 요약을 문장 단위로 분리 → 한 줄에 한 문장(나머지는 다음 줄)
const sentLines = (s) =>
  (s || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean);
function buildIssuesHtml(items, dateLabel, weekText, global = []) {
  const rows = items.length
    ? items.map((n) => {
        const sum = sentLines(n.snippet)[0] || ""; // 짧게: 첫 문장만
        return `<tr><td style="padding:11px 0;border-bottom:1px solid #eef1f4">
          <div style="font-size:15px;font-weight:700;color:#1a1d23;line-height:1.45">· <span style="color:#147b8c">${n.source || "-"}</span>_<a href="${n.link}" style="color:#1a1d23;text-decoration:none">${n.title}</a></div>
          ${sum ? `<div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:3px">${sum}</div>` : ""}
        </td></tr>`;
      }).join("")
    : `<tr><td style="color:#8a909c;padding:12px 0">수집된 항목이 없습니다.</td></tr>`;
  // 🌐 글로벌 위험관리 MI (해외 자본·규제 동향, 한글 번역)
  const gRows = (global || []).map((n) => `<tr><td style="padding:11px 0;border-bottom:1px solid #eef1f4">
          <div style="font-size:15px;font-weight:700;color:#1a1d23;line-height:1.45">· <span style="color:#b8742a">${n.source || "-"}</span>_<a href="${n.link}" style="color:#1a1d23;text-decoration:none">${n.title_ko || n.title}</a></div>
          <div style="font-size:11.5px;color:#9aa0ab;line-height:1.5;margin-top:2px">${n.title_ko ? n.title : ""}</div>
        </td></tr>`).join("");
  const globalSection = (global && global.length) ? `
      <tr><td style="padding:8px 28px 6px"><div style="border-top:1px dashed #d4d8de;margin:6px 0 16px"></div>
        <div style="font-size:15px;font-weight:800;color:#b8742a;border-left:4px solid #b8742a;padding-left:9px;margin:0 0 6px">🌐 글로벌 위험관리 MI</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${gRows}</table>
      </td></tr>` : "";
  return `<div style="font-family:${FONT};background:#eef1f4;padding:18px 12px">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e3e7ec">
      <tr><td style="background:#147b8c;background:linear-gradient(120deg,#1aa0ad,#0e6582);padding:24px 28px">
        <div style="color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;margin:0">보험사 위험관리 MI</div>
        <div style="color:#dff1f4;font-size:13px;margin-top:6px">${dateLabel} · ${weekText}</div>
      </td></tr>
      <tr><td style="padding:20px 28px 6px">
        <div style="font-size:15px;font-weight:800;color:#147b8c;border-left:4px solid #147b8c;padding-left:9px;margin:0 0 6px">오늘의 주요 기사 (국내)</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
      ${globalSection}
      <tr><td style="padding:14px 28px 20px">
        <div style="color:#9aa0ab;font-size:11.5px;line-height:1.6">※ 키워드: 지급여력·K-ICS·자본/건전성·IFRS17·금리리스크 · 글로벌은 Solvency II·ICS·IFRS17·capital 등 영문 기사 한글 번역 · 기사별 <b>원문 전문</b>은 첨부 워드(.docx) 참조 · 출처: 네이버·구글 뉴스</div>
      </td></tr>
    </table>
  </div>`;
}

export async function sendIssuesMail(toOverride) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = toOverride ? toOverride.split(",").map((s) => s.trim()).filter(Boolean) : ISSUES_RECIPIENTS;
  if (!user || !pass || !to.length) return "skip(no-config)";
  const items = await fetchIssues(10);
  await enrichFullText(items); // 기사 원문 추출(첨부 워드용)
  // 🌐 글로벌(해외) 수집 + 한글 번역
  let global = [];
  try {
    const { fetchGlobal } = await import("./global.js");
    const { translateTitles } = await import("./translate.js");
    global = await fetchGlobal(6);
    await translateTitles(global);
  } catch (e) { console.error("[issues] global 실패:", e.message); }
  const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const wk = weekLabel(genDate);
  const attachments = [];
  try {
    const { buildIssuesDocx } = await import("./issuedoc.js");
    attachments.push({ filename: `보험사위험관리MI_${genDate}.docx`, content: await buildIssuesDocx({ dateLabel: genDate, weekText: wk, items, global }) });
  } catch (e) { console.error("[issues] docx 실패:", e.message); }

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `거시모니터 <${user}>`, to,
    subject: `보험사 위험관리 MI (${genDate})`,
    html: buildIssuesHtml(items, genDate, wk, global),
    attachments,
  });
  return `sent(${to.length},news=${items.length},global=${global.length})`;
}

// 데일리 로그: 일자=행(최신 위), 지표=열. 스프레드는 엑셀 수식, 기준일 행 강조, 상단 기준시각.
export async function buildXlsx(rep) {
  const { data, dates } = await buildDaily();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("거시지표");
  const ncol = 1 + DAILY_COLS.length;
  const idToCol = {}; DAILY_COLS.forEach((c, i) => { idToCol[c.id] = 2 + i; });

  // 그룹 구간
  const groups = [];
  let prevG = null;
  for (const c of DAILY_COLS) {
    if (c.g !== prevG) { groups.push({ name: c.g, start: groups.length ? groups[groups.length - 1].start + groups[groups.length - 1].span : 2, span: 1 }); prevG = c.g; }
    else groups[groups.length - 1].span++;
  }

  // 1행: 제목 + 작성 기준시각
  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell(1, 1).value = `${TITLE(rep)}     ·     데이터 기준 ${genStamp()} (KST)`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  // 2~3행: 헤더(일자 병합 + 그룹 + 지표명)
  ws.mergeCells(2, 1, 3, 1);
  ws.getCell(2, 1).value = "일자";
  for (const g of groups) { ws.mergeCells(2, g.start, 2, g.start + g.span - 1); ws.getCell(2, g.start).value = g.name; }
  DAILY_COLS.forEach((c, i) => { ws.getCell(3, 2 + i).value = c.label; });
  [2, 3].forEach((rr) => { ws.getRow(rr).font = { bold: true }; ws.getRow(rr).alignment = { horizontal: "center", vertical: "middle" }; });

  // 4행~: 일자별. 스프레드는 엑셀 수식(=평가사수익률−국고)으로 직접 기입.
  let r = 4;
  for (const date of dates) {
    const row = data[date] || {};
    ws.getCell(r, 1).value = date;
    DAILY_COLS.forEach((c, i) => {
      const cell = ws.getCell(r, 2 + i);
      if (c.derive) {
        // 스프레드 = 평가사수익률 − 국고채. 전 행에 함수(수익률 비면 공란).
        const yL = colLetter(idToCol[c.derive[0]]), kL = colLetter(idToCol[c.derive[1]]);
        const a = row[c.derive[0]], b = row[c.derive[1]];
        cell.value = { formula: `IF(OR(${yL}${r}="",${kL}${r}=""),"",${yL}${r}-${kL}${r})`, result: a != null && b != null ? Number((a - b).toFixed(4)) : "" };
        cell.numFmt = c.fmt;
      } else if (row[c.id] != null) {
        cell.value = Number(row[c.id]); cell.numFmt = c.fmt;
      }
    });
    // 기준일(국고채 최신 발표일) 행: 볼드 + 하이라이트
    if (date === rep.currentDate) {
      for (let cc = 1; cc <= ncol; cc++) {
        const cell = ws.getCell(r, cc);
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      }
    }
    r++;
  }

  ws.getColumn(1).width = 12;
  for (let i = 0; i < DAILY_COLS.length; i++) ws.getColumn(2 + i).width = 11;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// 수신자별 발송 시각(KST 시). 여기만 고치면 주기·대상 변경 가능.
// 거시 리포트 수신자(원래 설정대로) — 김지훈 9·13·17시, 나머지 9시
const RECIPIENTS = [
  { email: "jihoon777.kim@samsung.com", hours: [9, 13, 17] },
  { email: "jaeho24.choi@samsung.com", hours: [9] },
  { email: "dh0407.seo@samsung.com", hours: [9] },
  { email: "hj-act.yoon@samsung.com", hours: [9] },
];
// 보험사 위험관리 MI(이슈 메일) 수신자 — 작업 중이라 우선 김지훈 단독
const ISSUES_RECIPIENTS = ["jihoon777.kim@samsung.com"];

export async function sendReportMail(toOverride) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  let to;
  if (toOverride) {
    to = toOverride.split(",").map((s) => s.trim()).filter(Boolean); // 테스트(특정 주소)
  } else {
    const h = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours(); // 현재 KST 시
    to = RECIPIENTS.filter((r) => r.hours.includes(h)).map((r) => r.email);
  }
  if (!user || !pass) return "skip(no-config)";
  if (!to.length) return "skip(no-recipient-this-hour)";
  const rep = await buildReport();
  if (!rep) return "skip(no-data)";
  const issues = await getConfig("report_note");
  const sparkMap = await buildSparkMap(rep);

  const html = buildHtml(rep, issues, sparkMap);
  const attachments = [{ filename: `거시지표_${rep.currentDate}.xlsx`, content: await buildXlsx(rep) }];
  let pdfOk = false, pdfErr = "";
  try {
    const { buildPdf } = await import("./pdf.js");
    attachments.push({ filename: `거시지표_${rep.currentDate}.pdf`, content: await buildPdf(buildPdfHtml(rep, issues, sparkMap)) });
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
