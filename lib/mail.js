// 일일 보고서 이메일 (Gmail) — 전체 표 + 추세 + 지표설명/이슈, 엑셀·PDF(2장) 첨부, 다수 수신자
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { buildReport, buildDaily, DAILY_COLS, fmtLevel, fmtDelta, fmtTitleDate } from "./report.js";
import { getConfig, setConfig } from "./db.js";
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
// 직전 영업일 09:00 KST(ms) — 증분 기준값이 없을 때의 수집 기간 시작점
function prevBizNineAm(now) {
  const dayMs = 86400e3;
  const k = new Date(now + 9 * 3600e3);
  let a = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - dayMs; // 어제 09:00 KST
  for (let i = 0; i < 7; i++) { const dow = new Date(a + 9 * 3600e3).getUTCDay(); if (dow !== 0 && dow !== 6) break; a -= dayMs; }
  return a;
}
// KST 'M/D HH:mm' 표기
const kstStamp = (ms) => { const k = new Date(ms + 9 * 3600e3), p = (n) => String(n).padStart(2, "0"); return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`; };

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

function renderNotes(rep) {
  const trendDays = rep.strip ? rep.strip.length : 10;
  const trendRange = rep.strip && rep.strip.length ? `${md(rep.strip[0])}~${md(rep.currentDate)}` : "";
  return `<div style="font-size:13px;color:#1a1d23;line-height:1.85">
    <h3 style="font-size:16px;margin:0 0 6px">지표 근거 · 설명</h3>
    <b>자료 출처</b> (지표별)<br>
    · 국고채 3·5·10·20·30Y — 한국은행 ECOS 시장금리(통계표 <b>817Y002</b>)<br>
    · 미국채 5·10·20·30Y — 미국 FRED 국채금리(<b>DGS5 / DGS10 / DGS20 / DGS30</b>)<br>
    · 유럽 10·20Y — 유럽중앙은행 ECB 유로존 AAA 국채 수익률곡선(Yield Curve)<br>
    · 환율 원/달러·원/유로·원/엔(100엔) — 한국은행 ECOS 매매기준율(통계표 <b>731Y001</b>)<br>
    · 주가 코스피·삼성전자·삼성물산·SK텔레콤·SK하이닉스·SK스퀘어 — Yahoo Finance 일별 종가<br><br>
    <b>산출 방법</b><br>
    · 기준일 = 국고채 최신 발표일. 발표지연 지표는 기준일 시점 <b>최신 가용값(as-of)</b> 적용<br>
    · 증감 = 전일·전월·전분기·전년말 대비 차이 — 금리 <b>bp</b>(=0.01%p), 환율·주가 <b>%</b><br>
    · 표기: 상승 <span style="color:${UP}">+</span> · 하락 <span style="color:${DOWN}">△</span> · 추세선 = 최근 ${trendDays}영업일(${trendRange}) 흐름<br>
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
function buildIssuesHtml(items, dateLabel, weekText, global = [], periodText = "", briefing = null, archivePeriod = null) {
  const BASE = process.env.APP_BASE_URL || "https://macro-monitor-sigma.vercel.app";
  const kdate = (s) => { const p = (s || "").split("-"); return p.length === 3 ? `${+p[0]}년 ${+p[1]}월 ${+p[2]}일` : (s || ""); };
  // 메일 본문은 제목만(출처·날짜). 상세 요약·본문은 첨부 워드 참조.
  const dt = (n) => (n.date ? ` <span style="color:#9aa0ab;font-weight:400;font-size:12px">(${n.date})</span>` : "");
  // 출처 색상: 금감원=파랑, 손보협회=주황, 국내뉴스=청록, 글로벌=갈색 (기사 제목은 검정 유지)
  const srcColor = (s) => s === "금융감독원" ? "1d4ed8" : s === "손해보험협회" ? "d97706" : "147b8c";
  const kindTag = (k) => /report$/.test(k || "") ? " (보도)" : /notice$/.test(k || "") ? " (공지)" : "";
  // 헤드라인 옆 키워드 태그(1~2개, 오른쪽 정렬) — 팀 관심 주제 자동 추출
  const KW = [
    [/K-?ICS|킥스|지급여력|solvency/i, "K-ICS"],
    [/자본|CET1|후순위|신종자본|증자|배당|capital/i, "자본"],
    [/IFRS\s?17|책임준비금|예실차|할인율/i, "IFRS17"],
    [/내부통제|리베이트|불완전판매|허위계약/i, "내부통제"],
    [/제3자|위탁|외주|third[- ]?party|outsourc/i, "제3자"],
    [/전산|재해복구|클라우드|이중화|사이버|시스템|cyber/i, "전산·IT"],
    [/업무연속성|사업연속성|\bBCP\b|\bBCM\b|재해|business continuity/i, "BCM"],
    [/위험관리위원회|리스크위원회|risk committee/i, "위험관리위"],
    [/건전성|\bRBC\b|prudential/i, "건전성"],
    [/재보험|reinsur/i, "재보험"],
    [/손해율|보험손익|손익|보험료/i, "손익"],
    [/인수|매각|합병|M&A|우선협상/i, "M&A"],
    [/금감원|감독|규제|당국|검사|제재/i, "규제"],
    [/보험사기/i, "보험사기"],
    [/삼성화재|삼성생명/i, "삼성"],
    [/신용등급|rating|S&P|Fitch|Moody|AM Best/i, "신용등급"],
    [/catastrophe|대재해|\bILS\b|cat bond/i, "ILS"],
  ];
  const kwTags = (n) => {
    const hay = `${n.title_ko || ""} ${n.title || ""} ${n.snippet || n.summary_ko || n.summary || ""}`;
    const out = [];
    for (const [re, label] of KW) { if (re.test(hay)) { out.push(label); if (out.length >= 2) break; } }
    return out;
  };
  const tagCell = (n) => {
    const t = kwTags(n);
    return t.length ? `<td valign="top" style="text-align:right;white-space:nowrap;padding-left:8px">${t.map((x) => `<span style="display:inline-block;background:#eef6f7;color:#0e6070;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:3px">#${x}</span>`).join("")}</td>` : "";
  };
  const row = (n, color, title) => `<tr><td style="padding:5px 0;border-bottom:1px solid #eef1f4">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;font-weight:600;color:#1a1d23;line-height:1.4"><span style="color:#${color};font-weight:700">(${n.source || "-"})${kindTag(n.kind)}</span> <a href="${n.link}" style="color:#1a1d23;text-decoration:none">${title}</a>${dt(n)}</td>${tagCell(n)}</tr></table>
        </td></tr>`;
  const rows = items.length
    ? items.map((n) => row(n, srcColor(n.source), n.title)).join("")
    : `<tr><td style="color:#8a909c;padding:10px 0">수집된 항목이 없습니다.</td></tr>`;
  // 🌐 글로벌 위험관리 MI — 한글 번역 제목 + 영문 원제목
  const gRows = (global || []).map((n) => `<tr><td style="padding:5px 0;border-bottom:1px solid #eef1f4">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;font-weight:600;color:#1a1d23;line-height:1.4"><span style="color:#b8742a;font-weight:700">(${n.source || "-"})</span> <a href="${n.link}" style="color:#1a1d23;text-decoration:none">${n.title_ko || n.title}</a>${dt(n)}</td>${tagCell(n)}</tr></table>
          ${n.title_ko ? `<div style="font-size:10.5px;color:#aeb3bb;line-height:1.3">${n.title}</div>` : ""}
        </td></tr>`).join("");
  const globalSection = (global && global.length) ? `
      <tr><td style="padding:6px 20px 4px"><div style="border-top:1px dashed #d4d8de;margin:4px 0 10px"></div>
        <div style="font-size:14.5px;font-weight:800;color:#b8742a;border-left:4px solid #b8742a;padding-left:8px;margin:0 0 4px">🌐 글로벌 위험관리 MI</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${gRows}</table>
      </td></tr>` : "";
  // 상단: 모바일용 아카이브 검색(남색 링크) + AI 브리핑(청록, 탭하면 본문 아래 전체 펼침)
  const wkShort = briefing && briefing.label ? briefing.label.replace("주차", "주") : "";
  const apText = (archivePeriod && archivePeriod.from) ? `<div style="text-align:center;font-size:11px;color:#9aa0ab;margin-top:4px">📅 아카이브 수집기간 : ${kdate(archivePeriod.from)} ~ ${kdate(archivePeriod.to)}</div>` : "";
  const btnA = `<a href="${BASE}/archive/live" style="display:block;text-align:center;background:#1f3b57;color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:700;padding:12px 8px;border-radius:10px;white-space:nowrap">📱 모바일용 아카이브 검색 ▶</a>${apText}`;
  const briefBlock = (briefing && briefing.inner) ? `<details style="margin-top:8px">
        <summary style="list-style:none;cursor:pointer;display:block;background:#0f766e;color:#ffffff;text-align:center;font-size:13.5px;font-weight:700;padding:12px 8px;border-radius:10px;white-space:nowrap">🧭 주간 위험관리 AI 브리핑${wkShort ? " · " + wkShort : ""} ▾</summary>
        <div style="padding:13px 4px 2px">${briefing.inner}</div>
      </details>` : "";
  const btnRow = `<tr><td style="padding:12px 16px 2px">${btnA}${briefBlock}</td></tr>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"></head>
  <body style="margin:0;padding:0;background:#eef1f4;-webkit-text-size-adjust:100%">
  <div style="font-family:${FONT};background:#eef1f4;padding:12px 2%">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:820px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e3e7ec">
      <tr><td style="background:#147b8c;background:linear-gradient(120deg,#1aa0ad,#0e6582);padding:16px 24px">
        <div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;margin:0">위험관리 MI</div>
        <div style="color:#dff1f4;font-size:13px;margin-top:4px">${dateLabel} · ${weekText}</div>
        ${periodText ? `<div style="color:#cdeef2;font-size:11.5px;margin-top:2px">📅 ${periodText}</div>` : ""}
      </td></tr>
      ${btnRow}
      <tr><td style="padding:14px 20px 4px">
        <div style="font-size:14.5px;font-weight:800;color:#147b8c;border-left:4px solid #147b8c;padding-left:8px;margin:0 0 4px"><img src="cid:flagkr" width="20" height="13" alt="" style="vertical-align:-1px;border:1px solid #e3e7ec;border-radius:2px"> 국내 위험관리 MI</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
      ${globalSection}
      <tr><td style="padding:10px 20px 14px">
        <div style="color:#9aa0ab;font-size:11px;line-height:1.5">※ 키워드: 지급여력·K-ICS·자본/건전성·IFRS17·금리리스크 · 기사별 <b>원문 전문</b>은 첨부 워드(.docx) 참조 · 출처: 금감원·손보협회·네이버·구글·글로벌 전문매체</div>
      </td></tr>
    </table>
  </div>
  </body></html>`;
}

export async function sendIssuesMail(toOverride, opts = {}) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = toOverride ? toOverride.split(",").map((s) => s.trim()).filter(Boolean) : ISSUES_RECIPIENTS;
  if (!user || !pass || !to.length) return "skip(no-config)";
  // 수집 기간(window): 직전 발송 시각 이후 ~ 현재. 기록이 없으면 '직전 영업일 09시'로 고정(항상 날짜창 적용).
  const isTest = !!toOverride;
  const now = Date.now();
  const lastRun = Number(await getConfig("issues_last_run")) || 0;
  const from = isTest ? prevBizNineAm(now) : (lastRun || prevBizNineAm(now));
  const items = await fetchIssues(30, from);
  // 국내 본문 추출 + 글로벌 수집·번역을 병렬 실행(60초 제한 대응)
  let global = [];
  const globalP = (async () => {
    try {
      const { fetchGlobal, enrichGlobal } = await import("./global.js");
      const { translateGlobal, translateBodies } = await import("./translate.js");
      let g = await fetchGlobal(6);
      g = g.filter((n) => (n.ts || 0) > from); // 수집 기간 내 신규만
      await enrichGlobal(g);
      await translateGlobal(g);
      await translateBodies(g);
      global = g;
    } catch (e) { console.error("[issues] global 실패:", e.message); }
  })();
  await Promise.all([enrichFullText(items), globalP]);
  // MI 아카이브 저장(과거 이슈 검색용) — 실패해도 발송은 진행
  let archived = 0;
  try { const { saveArticles } = await import("./archive.js"); archived = await saveArticles(items, global); }
  catch (e) { console.error("[issues] archive 실패:", e.message); }
  const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const wk = weekLabel(genDate);
  const periodText = `수집 기간: ${kstStamp(from)} ~ ${kstStamp(now)} (KST)`;
  // 주간 브리핑(메일 본문 + 아카이브 첨부 공용) — 모바일은 본문 브리핑으로 바로 확인
  let briefings = [];
  try { const { getRecentBriefings } = await import("./briefing.js"); briefings = await getRecentBriefings(4); } catch (e) { console.error("[issues] briefing 읽기 실패:", e.message); }
  let archivePeriod = null;
  try { const { getArchivePeriod } = await import("./archive.js"); archivePeriod = await getArchivePeriod(); } catch (e) { console.error("[issues] archive 기간 실패:", e.message); }
  const attachments = [];
  if (!opts.noAttach) {
    try {
      const { buildIssuesDocx } = await import("./issuedoc.js");
      attachments.push({ filename: `위험관리MI_${genDate}.docx`, content: await buildIssuesDocx({ dateLabel: genDate, weekText: wk, items, global, periodText }) });
    } catch (e) { console.error("[issues] docx 실패:", e.message); }
    // 금감원·협회 보도자료 원본 PDF 첨부(도표·그림 그대로) — 파일명 중복 제거
    const seenPdf = new Set();
    for (const n of items) {
      if (n._pdf && n._pdf.content && !seenPdf.has(n._pdf.filename)) {
        seenPdf.add(n._pdf.filename);
        attachments.push({ filename: n._pdf.filename, content: n._pdf.content });
      }
    }
    // MI 아카이브 검색 HTML 첨부(오프라인 과거 이슈 검색) — 오늘 저장분 + 주간 AI 브리핑(상단, 주 단위 고정)
    try {
      const { exportArticles } = await import("./archive.js");
      const { buildArchiveHtml } = await import("./archivehtml.js");
      const arows = await exportArticles({ months: 120 });
      attachments.push({ filename: `MI_아카이브_${genDate}.html`, content: buildArchiveHtml(arows, { generatedAt: genDate, briefings }), contentType: "text/html; charset=utf-8" });
    } catch (e) { console.error("[issues] archive html 실패:", e.message); }
    // 사용설명서 PDF 별첨
    try {
      const { MANUAL_B64 } = await import("./manual.js");
      attachments.push({ filename: "위험관리 MI 사용설명서.pdf", content: Buffer.from(MANUAL_B64, "base64"), contentType: "application/pdf" });
    } catch (e) { console.error("[issues] manual 첨부 실패:", e.message); }
  }

  // 태극기 인라인 이미지(국기 이모지가 Windows 메일에서 'KR' 글자로 깨지는 문제 대응)
  try {
    const { FLAG_KR_B64 } = await import("./flagkr.js");
    attachments.push({ filename: "kr.png", content: Buffer.from(FLAG_KR_B64, "base64"), cid: "flagkr", contentDisposition: "inline" });
  } catch (e) { console.error("[issues] 국기 이미지 실패:", e.message); }

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `RM AI Native <${user}>`,
    to: `RM AI Native <${user}>`, // 표시 수신인=발신자, 실제 수신인은 BCC로 상호 비공개
    bcc: to,
    subject: `위험관리 MI ｜ Daily & Archive (${genDate})`,
    html: buildIssuesHtml(items, genDate, wk, global, periodText,
      briefings[0] ? { inner: briefings[0].inner, label: weekLabel(briefings[0].to || genDate), range: `${briefings[0].from || ""} ~ ${briefings[0].to || ""}` } : null,
      archivePeriod),
    attachments,
  });
  if (!isTest) await setConfig("issues_last_run", String(Date.now())); // 발송 시각 기록(다음 증분 기준)
  return `sent(${to.length},news=${items.length},global=${global.length},arch=${archived}${isTest ? ",test" : ",inc"})`;
}

// 주간 AI 브리핑 생성 + (브리핑 얹은)아카이브 HTML 첨부 발송 — 검토/주간용
export async function sendBriefingMail(toOverride, opts = {}) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = toOverride ? toOverride.split(",").map((s) => s.trim()).filter(Boolean) : ISSUES_RECIPIENTS;
  if (!user || !pass || !to.length) return "skip(no-config)";
  const { refreshWeeklyBriefing, getRecentBriefings } = await import("./briefing.js");
  const r = await refreshWeeklyBriefing();
  if (!r.ok) return `skip(no-briefing,count=${r.count})`;
  const briefings = await getRecentBriefings(4);
  const br = briefings[0] || { from: "", to: "" };
  const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { exportArticles } = await import("./archive.js");
  const { buildArchiveHtml } = await import("./archivehtml.js");
  const rows = await exportArticles({ months: 120 });
  const ahtml = buildArchiveHtml(rows, { generatedAt: genDate, briefings });
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `RM AI Native <${user}>`, to,
    subject: `주간 위험관리 AI 브리핑 (${br.from} ~ ${br.to})`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;color:#1a1d23;padding:12px;line-height:1.7">
      <p><b>주간 위험관리 AI 브리핑</b>입니다. 첨부 아카이브 파일 <b>상단</b>에 이번 주 핵심 이슈·유의사항이 정리돼 있고, 지난 주차도 버튼으로 조회됩니다.</p>
      <p style="color:#6b7280;font-size:12.5px">· 기간 ${br.from} ~ ${br.to} · AI(Claude) 자동 생성(참고용)</p>
    </div>`,
    attachments: [{ filename: `MI_아카이브_브리핑_${genDate}.html`, content: ahtml, contentType: "text/html; charset=utf-8" }],
  });
  return `briefing-sent(${to.length},weeks=${briefings.length})`;
}

// MI 아카이브 검색 HTML을 첨부해 발송(전달성 테스트/주간 발송용). ext="html"|"zip"
export async function sendArchiveMail(toOverride, opts = {}) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = toOverride ? toOverride.split(",").map((s) => s.trim()).filter(Boolean) : ISSUES_RECIPIENTS;
  if (!user || !pass || !to.length) return "skip(no-config)";
  const { exportArticles } = await import("./archive.js");
  const { buildArchiveHtml } = await import("./archivehtml.js");
  const { getRecentBriefings } = await import("./briefing.js");
  const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await exportArticles({ months: Number(opts.months) || 6 });
  let briefings = []; try { briefings = await getRecentBriefings(4); } catch {}
  const html = buildArchiveHtml(rows, { generatedAt: genDate, briefings });
  const base = `MI_아카이브_${genDate}`;
  const attachments = [];
  if (opts.zip) {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(`${base}.html`, html);
    attachments.push({ filename: `${base}.zip`, content: await zip.generateAsync({ type: "nodebuffer" }) });
  } else {
    attachments.push({ filename: `${base}.html`, content: html, contentType: "text/html; charset=utf-8" });
  }
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `RM AI Native <${user}>`, to,
    subject: `MI 아카이브 (${genDate})${opts.zip ? " [zip]" : ""}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;color:#1a1d23;padding:12px">
      <p>위험관리 MI <b>누적 아카이브</b>입니다. 첨부 파일(<b>${base}.${opts.zip ? "zip → html" : "html"}</b>)을 열면 키워드·기간·구분으로 <b>오프라인 검색</b>이 됩니다.</p>
      <p style="color:#6b7280;font-size:12.5px">· 수록: 최근 ${Number(opts.months) || 6}개월 · 총 ${rows.length}건 · 인터넷 연결 없이 브라우저로 열림</p>
    </div>`,
    attachments,
  });
  return `archive-sent(${to.length},rows=${rows.length},${opts.zip ? "zip" : "html"})`;
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
// 거시지표 모니터링(거시 리포트) 수신자 — 9시: 전원 / 13·17시: 김지훈만
const RECIPIENTS = [
  { email: "jihoon777.kim@samsung.com", hours: [9, 13, 17] }, // 김지훈
  { email: "jaeho24.choi@samsung.com", hours: [9] },          // 최재호
  { email: "dh0407.seo@samsung.com", hours: [9] },            // 서동현
  { email: "hj-act.yoon@samsung.com", hours: [9] },           // 윤혁중
];
// 보험사 위험관리 MI(이슈 메일) 수신자 — 오전 9시 1회: 전원
const ISSUES_RECIPIENTS = [
  "jihoon777.kim@samsung.com", // 김지훈
  "jaeho24.choi@samsung.com",  // 최재호
  "dh0407.seo@samsung.com",    // 서동현
  "hj-act.yoon@samsung.com",   // 윤혁중
  "bongsoo85.choi@samsung.com", // 최봉수
  "selena.park@samsung.com",   // 박셀레나
  "jaikun.kim@samsung.com",    // 김재건
  "junsuk.yoo@samsung.com",    // 유준석
  "junhee88.nam@samsung.com",  // 남준희
];

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
    from: `RM AI Native <${user}>`, to,
    subject: `[RM AI Native] ${TITLE(rep)}`,
    html, attachments,
  });
  return `sent(${to.length},xlsx${pdfOk ? "+pdf" : ",pdf실패:" + pdfErr})`;
}
