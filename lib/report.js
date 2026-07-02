// 서버용 전체 보고서 데이터 빌더 (웹 대시보드와 동일한 as-of/증감 로직)
import { getAllObservations } from "./db.js";

// 파생 스프레드 = 평가사수익률 − 국고채(동일만기)
const DERIVED = {
  sgb_aaa_5y: ["sgbAAA5yYld", "ktb5y"],
  sgb_aaa_10y: ["sgbAAA10yYld", "ktb10y"],
  corp_aam_3y: ["corpAA3yYield", "ktb3y"],
  corp_aam_10y: ["corpAA10yYld", "ktb10y"],
};

export const SECTIONS = [
  { label: "금리 · 국내", unit: "%", rows: [
    ["ktb3y", "국고채 3Y", "rate"], ["ktb5y", "국고채 5Y", "rate"], ["ktb10y", "국고채 10Y", "rate"],
    ["ktb20y", "국고채 20Y", "rate"], ["ktb30y", "국고채 30Y", "rate"],
  ]},
  { label: "금리 · 해외", unit: "%", rows: [
    ["ust5y", "미국 5Y", "rate"], ["ust10y", "미국 10Y", "rate"], ["ust20y", "미국 20Y", "rate"], ["ust30y", "미국 30Y", "rate"],
    ["eu10y", "유럽 10Y", "rate"], ["eu20y", "유럽 20Y", "rate"],
  ]},
  { label: "환율", unit: "원", rows: [["usdkrw", "원/달러", "fx"], ["eurkrw", "원/유로", "fx"], ["jpykrw", "원/엔(100엔)", "fx"]] },
  { label: "주가", unit: "pt/원", rows: [
    ["kospi", "코스피", "idx"], ["samsung", "삼성전자", "won"], ["samsungct", "삼성물산", "won"],
    ["skt", "SK텔레콤", "won"], ["skhynix", "SK하이닉스", "won"], ["sksquare", "SK스퀘어", "won"],
    ["samsungfire", "삼성화재", "won"], ["insuidx", "보험업지수", "idx"],
  ]},
  // ※ '스프레드·신용' 섹션은 표시에서 제외(평가사 수기입력 의존 — 우선 삭제)
];

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDayOfMonth = (y, mi) => new Date(y, mi + 1, 0);
const asOf = (sorted, target) => { let r = null; for (const d of sorted) { if (d <= target) r = d; else break; } return r; };

export async function buildReport() {
  const rows = await getAllObservations();
  const data = {};
  for (const r of rows) (data[r.obs_date] ??= {})[r.indicator] = Number(r.value);
  const sortedDates = Object.keys(data).sort();
  if (!sortedDates.length) return null;

  // 지표별 가용 날짜(파생은 교집합)
  const datesByInd = {};
  for (const d of sortedDates) for (const id in data[d]) {
    const v = data[d][id]; if (v != null && !isNaN(v)) (datesByInd[id] ??= []).push(d);
  }
  for (const [id, [a, b]] of Object.entries(DERIVED)) {
    const s = new Set(datesByInd[a] || []); datesByInd[id] = (datesByInd[b] || []).filter((x) => s.has(x));
  }
  const valueAt = (id, d) => {
    if (!d) return null;
    if (DERIVED[id]) { const a = valueAt(DERIVED[id][0], d), b = valueAt(DERIVED[id][1], d); return a == null || b == null ? null : (a - b) * 100; }
    const v = data[d]?.[id]; return v == null || isNaN(v) ? null : Number(v);
  };
  const asOfDate = (id, t) => { const ds = datesByInd[id]; if (!ds) return null; let r = null; for (const d of ds) { if (d <= t) r = d; else break; } return r; };
  const valAsOf = (id, t) => valueAt(id, asOfDate(id, t));
  const prevObs = (id, t) => { const ds = datesByInd[id]; if (!ds) return null; const d0 = asOfDate(id, t); if (!d0) return null; let p = null; for (const d of ds) { if (d < d0) p = d; else break; } return valueAt(id, p); };

  // 현황 = 현시점(최신 보유 일자). 각 지표는 as-of로 자기 최신값, 분류별 기준일은 따로 표기.
  const currentDate = sortedDates[sortedDates.length - 1];
  const cur = new Date(currentDate.slice(0, 4), Number(currentDate.slice(5, 7)) - 1, Number(currentDate.slice(8, 10)));
  const y = cur.getFullYear(), m = cur.getMonth();
  const q = Math.floor(m / 3);
  const prevQEnd = lastDayOfMonth(q === 0 ? y - 1 : y, q === 0 ? 11 : q * 3 - 1);
  const idx = sortedDates.indexOf(currentDate);
  const strip = sortedDates.slice(Math.max(0, idx - 9), idx + 1); // 추세용 최근 ~10영업일
  const ref = {
    y23: asOf(sortedDates, "2023-12-31"), y24: asOf(sortedDates, "2024-12-31"), y25: asOf(sortedDates, "2025-12-31"),
    m3: asOf(sortedDates, toISO(lastDayOfMonth(y, m - 3))), m2: asOf(sortedDates, toISO(lastDayOfMonth(y, m - 2))), m1: asOf(sortedDates, toISO(lastDayOfMonth(y, m - 1))),
    prevQ: asOf(sortedDates, toISO(prevQEnd)), prevYear: asOf(sortedDates, `${y - 1}-12-31`),
    prevDay: idx > 0 ? sortedDates[idx - 1] : null,
    d2: idx > 1 ? sortedDates[idx - 2] : null,
    d3: idx > 2 ? sortedDates[idx - 3] : null,
  };

  const sections = SECTIONS.map((sec) => ({
    label: sec.label, unit: sec.unit,
    // 분류 기준일 = 구성 지표 중 최신 as-of 일자
    asOf: sec.rows.reduce((mx, [id]) => { const d = asOfDate(id, currentDate); return d && (!mx || d > mx) ? d : mx; }, null),
    rows: sec.rows.map(([id, label, kind]) => {
      const c = valAsOf(id, currentDate);
      return {
        label, kind,
        levels: { y23: valAsOf(id, ref.y23), y24: valAsOf(id, ref.y24), y25: valAsOf(id, ref.y25),
          m3: valAsOf(id, ref.m3), m2: valAsOf(id, ref.m2), m1: valAsOf(id, ref.m1),
          prevDay: valAsOf(id, ref.prevDay), d2: valAsOf(id, ref.d2), d3: valAsOf(id, ref.d3), cur: c },
        base: { d: prevObs(id, currentDate), mom: valAsOf(id, ref.m1), qoq: valAsOf(id, ref.prevQ), yoy: valAsOf(id, ref.prevYear) },
        spark: strip.map((d) => valAsOf(id, d)),
      };
    }),
  }));
  const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 현시점(KST)
  return { currentDate, ref, sections, strip, genDate };
}

// 제목용 날짜: '26.06.15
export const fmtTitleDate = (iso) => (iso ? `'${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}` : "");

// ── 엑셀 데일리 로그용: 일자=행, 지표=열 ──
export const DAILY_COLS = [
  { g: "금리·국내", id: "ktb3y", label: "국고 3Y", fmt: "0.000" }, { g: "금리·국내", id: "ktb5y", label: "국고 5Y", fmt: "0.000" },
  { g: "금리·국내", id: "ktb10y", label: "국고 10Y", fmt: "0.000" }, { g: "금리·국내", id: "ktb20y", label: "국고 20Y", fmt: "0.000" },
  { g: "금리·국내", id: "ktb30y", label: "국고 30Y", fmt: "0.000" },
  { g: "금리·해외", id: "ust5y", label: "미국 5Y", fmt: "0.000" }, { g: "금리·해외", id: "ust10y", label: "미국 10Y", fmt: "0.000" },
  { g: "금리·해외", id: "ust20y", label: "미국 20Y", fmt: "0.000" }, { g: "금리·해외", id: "ust30y", label: "미국 30Y", fmt: "0.000" },
  { g: "금리·해외", id: "eu10y", label: "유럽 10Y", fmt: "0.000" }, { g: "금리·해외", id: "eu20y", label: "유럽 20Y", fmt: "0.000" },
  { g: "환율", id: "usdkrw", label: "원/달러", fmt: "#,##0.0" }, { g: "환율", id: "eurkrw", label: "원/유로", fmt: "#,##0.0" }, { g: "환율", id: "jpykrw", label: "원/엔(100엔)", fmt: "#,##0.0" },
  { g: "주가", id: "kospi", label: "코스피", fmt: "#,##0.0" }, { g: "주가", id: "samsung", label: "삼성전자", fmt: "#,##0" },
  { g: "주가", id: "samsungct", label: "삼성물산", fmt: "#,##0" }, { g: "주가", id: "skt", label: "SK텔레콤", fmt: "#,##0" }, { g: "주가", id: "skhynix", label: "SK하이닉스", fmt: "#,##0" }, { g: "주가", id: "sksquare", label: "SK스퀘어", fmt: "#,##0" },
  { g: "주가", id: "samsungfire", label: "삼성화재", fmt: "#,##0" }, { g: "주가", id: "insuidx", label: "보험업지수", fmt: "#,##0.0" },
  { g: "금리·신용", id: "sgbAAA5yYld", label: "특수채AAA 5Y", fmt: "0.000" }, { g: "금리·신용", id: "sgbAAA10yYld", label: "특수채AAA 10Y", fmt: "0.000" },
  { g: "금리·신용", id: "corpAA3yYield", label: "회사채AA- 3Y", fmt: "0.000" }, { g: "금리·신용", id: "corpAA10yYld", label: "회사채AA- 10Y", fmt: "0.000" },
  { g: "스프레드", id: "spr_sgb5", label: "특수채AAA 5Y", fmt: "0.000", derive: ["sgbAAA5yYld", "ktb5y"] },
  { g: "스프레드", id: "spr_sgb10", label: "특수채AAA 10Y", fmt: "0.000", derive: ["sgbAAA10yYld", "ktb10y"] },
  { g: "스프레드", id: "spr_corp3", label: "회사채AA- 3Y", fmt: "0.000", derive: ["corpAA3yYield", "ktb3y"] },
  { g: "스프레드", id: "spr_corp10", label: "회사채AA- 10Y", fmt: "0.000", derive: ["corpAA10yYld", "ktb10y"] },
];

export async function buildDaily() {
  const rows = await getAllObservations();
  const data = {};
  for (const r of rows) (data[r.obs_date] ??= {})[r.indicator] = Number(r.value);
  const dates = Object.keys(data).sort().reverse(); // 최신 일자 위로
  return { data, dates };
}

// ── 표기 ──
export function fmtLevel(kind, v) {
  if (v == null) return "–";
  if (kind === "rate") return v.toFixed(2);
  if (kind === "bp") return (v / 100).toFixed(2);
  return Math.round(v).toLocaleString("ko-KR");
}
// 보고서 양식: 상승 +Nbp / 하락 △Nbp / 무변동 –
export function fmtDelta(kind, cur, base) {
  if (cur == null || base == null) return "–";
  if (kind === "rate" || kind === "bp") {
    const d = Math.round(kind === "rate" ? (cur - base) * 100 : cur - base);
    return d === 0 ? "–" : d > 0 ? `+${d}bp` : `△${Math.abs(d)}bp`;
  }
  const p = base !== 0 ? (cur / base - 1) * 100 : 0;
  return Math.abs(p) < 0.05 ? "–" : p > 0 ? `+${p.toFixed(1)}%` : `△${Math.abs(p).toFixed(1)}%`;
}
