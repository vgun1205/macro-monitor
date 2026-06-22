"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";

/* =========================================================================
   거시지표 일별 모니터 — API(DB) 연동판
   데이터: GET /api/series 로 로드, 수기/가져오기는 POST /api/manual 로 저장
   오프라인 캐시: localStorage
   ========================================================================= */

const CACHE_KEY = "macro:cache:v1";

const T = {
  paper: "#F7F7F4", panel: "#FFFFFF", ink: "#15181E", inkSoft: "#5B616E",
  line: "#E4E6EA", lineSoft: "#EEF0F3", header: "#0E1726", headerSoft: "#1B2738",
  gold: "#B08D3E", goldBg: "#FBF6E9", up: "#CB2A3E", down: "#1457BE", flat: "#9AA0AB",
};

/* ---- 표시 지표군 (derived = 자동 계산) ---- */
const GROUPS = [
  { id: "rates_dom", label: "금리 · 국내 (국고채)", unit: "%", items: [
    { id: "ktb3y", label: "국고채 3Y", kind: "rate" }, { id: "ktb5y", label: "국고채 5Y", kind: "rate" },
    { id: "ktb10y", label: "국고채 10Y", kind: "rate" }, { id: "ktb20y", label: "국고채 20Y", kind: "rate" },
    { id: "ktb30y", label: "국고채 30Y", kind: "rate" },
  ]},
  { id: "rates_glb", label: "금리 · 해외 (국채)", unit: "%", items: [
    { id: "ust5y", label: "미국 5Y", kind: "rate" }, { id: "ust10y", label: "미국 10Y", kind: "rate" },
    { id: "ust20y", label: "미국 20Y", kind: "rate" }, { id: "ust30y", label: "미국 30Y", kind: "rate" },
    { id: "eu10y", label: "유럽 10Y", kind: "rate" }, { id: "eu20y", label: "유럽 20Y", kind: "rate" },
  ]},
  { id: "fx", label: "환율", unit: "원", items: [
    { id: "usdkrw", label: "원/달러 (USD)", kind: "fx" }, { id: "eurkrw", label: "원/유로 (EUR)", kind: "fx" },
  ]},
  { id: "spread_us", label: "금리스프레드 · 미국 (장기물 − 10Y)", unit: "bp", items: [
    { id: "us_sp20", label: "미국 20Y − 10Y", kind: "bp", from: ["ust20y", "ust10y"] },
    { id: "us_sp30", label: "미국 30Y − 10Y", kind: "bp", from: ["ust30y", "ust10y"] },
  ]},
  { id: "equity", label: "주가", unit: "pt / 원", items: [
    { id: "kospi", label: "코스피", kind: "idx" }, { id: "samsung", label: "삼성전자", kind: "won" },
    { id: "samsungct", label: "삼성물산", kind: "won" }, { id: "skt", label: "SK텔레콤", kind: "won" },
    { id: "skhynix", label: "SK하이닉스", kind: "won" },
  ]},
  // 평가사 수익률(특수채AAA·회사채AA−). 회사채AA−3Y는 ECOS 자동, 나머지는 수기.
  { id: "rates_credit", label: "금리 · 신용 (평가사)", unit: "%", items: [
    { id: "sgbAAA5yYld", label: "특수채 AAA 5Y", kind: "rate" }, { id: "sgbAAA10yYld", label: "특수채 AAA 10Y", kind: "rate" },
    { id: "corpAA3yYield", label: "회사채 AA− 3Y", kind: "rate" }, { id: "corpAA10yYld", label: "회사채 AA− 10Y", kind: "rate" },
  ]},
  // 스프레드 = 평가사수익률 − 국고채(동일만기), bp 환산
  { id: "spread_sgb", label: "스프레드 · 특수채 AAA (대 국고)", unit: "bp", items: [
    { id: "sgb_aaa_5y", label: "특수채 AAA 5Y", kind: "bp", from: ["sgbAAA5yYld", "ktb5y"] },
    { id: "sgb_aaa_10y", label: "특수채 AAA 10Y", kind: "bp", from: ["sgbAAA10yYld", "ktb10y"] },
  ]},
  { id: "spread_corp", label: "스프레드 · 회사채 AA− (대 국고)", unit: "bp", items: [
    { id: "corp_aam_3y", label: "회사채 AA− 3Y", kind: "bp", from: ["corpAA3yYield", "ktb3y"] },
    { id: "corp_aam_10y", label: "회사채 AA− 10Y", kind: "bp", from: ["corpAA10yYld", "ktb10y"] },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

/* 바로가기 링크(메일과 동일) */
const QUICK_LINKS = [
  ["📊", "전자공시 DART", "https://dart.fss.or.kr"],
  ["⚖️", "국가법령정보", "https://www.law.go.kr"],
  ["🏦", "한국은행 ECOS", "https://ecos.bok.or.kr"],
  ["📑", "채권정보 KOFIA", "https://www.kofiabond.or.kr"],
  ["🌐", "국제금융센터", "https://www.kcif.or.kr"],
  ["📰", "경제뉴스(한경)", "https://markets.hankyung.com"],
];

/* ---- 저장 가능한(수집/수기) 항목: 편집·가져오기·내보내기 대상 ---- */
const STORABLE = [
  { id: "ktb3y", label: "국고채 3Y", mode: "auto" }, { id: "ktb5y", label: "국고채 5Y", mode: "auto" },
  { id: "ktb10y", label: "국고채 10Y", mode: "auto" }, { id: "ktb20y", label: "국고채 20Y", mode: "auto" },
  { id: "ktb30y", label: "국고채 30Y", mode: "auto" },
  { id: "ust5y", label: "미국 5Y", mode: "auto" }, { id: "ust10y", label: "미국 10Y", mode: "auto" },
  { id: "ust20y", label: "미국 20Y", mode: "auto" }, { id: "ust30y", label: "미국 30Y", mode: "auto" },
  { id: "eu10y", label: "유럽 10Y", mode: "auto" }, { id: "eu20y", label: "유럽 20Y", mode: "auto" },
  { id: "usdkrw", label: "원/달러", mode: "auto" }, { id: "eurkrw", label: "원/유로", mode: "auto" },
  { id: "kospi", label: "코스피", mode: "auto" }, { id: "samsung", label: "삼성전자", mode: "auto" },
  { id: "samsungct", label: "삼성물산", mode: "auto" }, { id: "skt", label: "SK텔레콤", mode: "auto" }, { id: "skhynix", label: "SK하이닉스", mode: "auto" },
  { id: "corpAA3yYield", label: "회사채 AA- 3Y 수익률(%)", mode: "auto" },
  { id: "sgbAAA5yYld", label: "특수채 AAA 5Y 수익률(%)", mode: "manual" },
  { id: "sgbAAA10yYld", label: "특수채 AAA 10Y 수익률(%)", mode: "manual" },
  { id: "corpAA10yYld", label: "회사채 AA- 10Y 수익률(%)", mode: "manual" },
];

/* ---- 날짜 유틸 ---- */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const lastDayOfMonth = (y, mi) => new Date(y, mi + 1, 0);
const fmtMD = (iso) => { const d = parseISO(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
function asOfDate(sorted, target) { let res = null; for (const d of sorted) { if (d <= target) res = d; else break; } return res; }

/* 값 조회(as-of/정확/직전)는 Dashboard 내부 헬퍼에서 datesByInd 기반으로 처리한다. */

/* ---- 포맷 ---- */
function fmtVal(kind, v) {
  if (v == null) return "–";
  switch (kind) {
    case "rate": return v.toFixed(3);
    case "bp": return v.toFixed(1);
    case "fx":
    case "idx": return v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "won": return Math.round(v).toLocaleString("ko-KR");
    default: return String(v);
  }
}
const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
const colorOf = (x) => (x > 0 ? T.up : x < 0 ? T.down : T.flat);
function fmtDelta(kind, cur, base) {
  if (cur == null || base == null) return { text: "–", sub: "", color: T.flat };
  if (kind === "rate" || kind === "bp") {
    const d = kind === "rate" ? (cur - base) * 100 : cur - base;
    return { text: `${sgn(d)}${Math.abs(d).toFixed(1)}bp`, sub: "", color: colorOf(d) };
  }
  const d = cur - base, pct = base !== 0 ? (cur / base - 1) * 100 : 0;
  const dTxt = kind === "won"
    ? Math.round(Math.abs(d)).toLocaleString("ko-KR")
    : Math.abs(d).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { text: `${sgn(d)}${dTxt}`, sub: `${sgn(pct)}${Math.abs(pct).toFixed(2)}%`, color: colorOf(d) };
}

function Spark({ series, color }) {
  const vals = series.filter((v) => v != null);
  if (vals.length < 2) return <svg width="64" height="20" />;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const W = 64, H = 20, step = W / (series.length - 1);
  const pts = [];
  series.forEach((v, i) => { if (v == null) return; const x = i * step, y = H - 2 - ((v - min) / span) * (H - 4); pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); });
  const trend = vals[vals.length - 1] > vals[0] ? T.up : vals[vals.length - 1] < vals[0] ? T.down : T.flat;
  return <svg width={W} height={H} style={{ display: "block" }}><polyline points={pts.join(" ")} fill="none" stroke={color || trend} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/* ---- rows(API) → data 피벗 ---- */
function pivot(rows) {
  const data = {};
  for (const r of rows) {
    if (!data[r.obs_date]) data[r.obs_date] = {};
    data[r.obs_date][r.indicator] = r.value == null ? null : Number(r.value);
  }
  return data;
}

/* =========================================================================
   메인
   ========================================================================= */
export default function MacroDashboard() {
  const [data, setData] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [currentDate, setCurrentDate] = useState(null);
  const [dailyCount, setDailyCount] = useState(5);
  const [tab, setTab] = useState("dashboard");
  const [syncing, setSyncing] = useState(false);

  /* PWA: 서비스워커 등록 */
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  /* 로드: 캐시 → API */
  useEffect(() => {
    try { const c = localStorage.getItem(CACHE_KEY); if (c) setData(JSON.parse(c)); } catch {}
    (async () => {
      try {
        const res = await fetch("/api/series");
        const j = await res.json();
        if (j.ok) { const p = pivot(j.rows); setData(p); try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch {} }
        else setErr(j.error || "데이터 로드 실패");
      } catch (e) { setErr("서버 연결 실패 — 캐시로 표시합니다. (" + e.message + ")"); }
      setLoaded(true);
    })();
  }, []);

  /* 변경분 저장: 로컬 즉시 반영 + API upsert */
  const pushRows = useCallback(async (rows) => {
    setData((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        next[r.date] = { ...(next[r.date] || {}) };
        if (r.value == null || r.value === "") delete next[r.date][r.indicator];
        else next[r.date][r.indicator] = Number(r.value);
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setSyncing(true);
    try { await fetch("/api/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); }
    catch (e) { console.error(e); }
    setSyncing(false);
  }, []);

  /* 행 삭제: 해당 날짜의 저장 항목 전체 삭제 + 로컬 반영 */
  const deleteDates = useCallback(async (dates) => {
    const rows = [];
    for (const date of dates) for (const it of STORABLE) rows.push({ date, indicator: it.id });
    setData((prev) => {
      const next = { ...prev };
      for (const date of dates) delete next[date];
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setSyncing(true);
    try { await fetch("/api/manual", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); }
    catch (e) { console.error(e); }
    setSyncing(false);
  }, []);

  const triggerCollect = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/cron/collect", { method: "POST" }); // 로컬/테스트용 (CRON_SECRET 미설정 시)
      const res = await fetch("/api/series"); const j = await res.json();
      if (j.ok) { const p = pivot(j.rows); setData(p); try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch {} }
    } catch (e) { console.error(e); }
    setSyncing(false);
  }, []);

  const sortedDates = useMemo(() => Object.keys(data).sort(), [data]);

  /* 지표별 가용 날짜(오름차순). 파생지표는 두 다리 모두 존재하는 날짜의 교집합. */
  const datesByInd = useMemo(() => {
    const m = {};
    for (const d of sortedDates) {
      const row = data[d]; if (!row) continue;
      for (const id in row) {
        const v = row[id];
        if (v != null && v !== "" && !isNaN(v)) (m[id] ??= []).push(d);
      }
    }
    for (const it of ALL_ITEMS) {
      if (!it.from) continue;
      const set = new Set(m[it.from[0]] || []);
      m[it.id] = (m[it.from[1]] || []).filter((d) => set.has(d));
    }
    return m;
  }, [data, sortedDates]);

  useEffect(() => {
    // 기본 기준일 = 현시점(최신 보유 일자). 분류별 실제 데이터일자는 표에 따로 표기.
    if (sortedDates.length && (!currentDate || !data[currentDate])) setCurrentDate(sortedDates[sortedDates.length - 1]);
  }, [sortedDates, currentDate, data]);

  const refs = useMemo(() => {
    if (!currentDate) return null;
    const cur = parseISO(currentDate), y = cur.getFullYear(), m = cur.getMonth();
    const yearEnd = (yy) => asOfDate(sortedDates, `${yy}-12-31`);
    const monthEndBefore = (n) => asOfDate(sortedDates, toISO(lastDayOfMonth(y, m - n)));
    const q = Math.floor(m / 3);
    const prevQEnd = lastDayOfMonth(q === 0 ? y - 1 : y, q === 0 ? 11 : q * 3 - 1);
    const idx = sortedDates.indexOf(currentDate);
    return {
      y23: yearEnd(2023), y24: yearEnd(2024), y25: yearEnd(2025),
      m3: monthEndBefore(3), m2: monthEndBefore(2), m1: monthEndBefore(1),
      prevQ: asOfDate(sortedDates, toISO(prevQEnd)), prevYear: asOfDate(sortedDates, `${y - 1}-12-31`),
      prevDay: idx > 0 ? sortedDates[idx - 1] : null,
      d2: idx > 1 ? sortedDates[idx - 2] : null,
      d3: idx > 2 ? sortedDates[idx - 3] : null,
      spark: sortedDates.slice(Math.max(0, idx - 9), idx + 1),
    };
  }, [currentDate, sortedDates]);

  if (!loaded) return <div style={{ padding: 40, fontFamily: "system-ui", color: T.inkSoft }}>불러오는 중…</div>;

  const empty = sortedDates.length === 0;

  return (
    <div style={S.root} className="macro-root">
      <style>{CSS}</style>
      <header style={S.header} className="no-print">
        <div style={S.headerLeft}>
          <div style={S.titleRow}>
            <span style={S.logoDot} /><h1 style={S.title}>거시지표 일별 모니터</h1>
            <span style={S.titleSub}>RATES · FX · CREDIT · EQUITY</span>
          </div>
          <div style={S.asOfRow}>
            <span style={S.asOfLabel}>기준일</span>
            <select value={currentDate || ""} onChange={(e) => setCurrentDate(e.target.value)} style={S.dateSelect}>
              {sortedDates.slice().reverse().map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span style={S.asOfNote}>전일 {refs?.prevDay || "–"}</span>
            <button onClick={triggerCollect} style={S.syncBtn} disabled={syncing}>{syncing ? "동기화중…" : "지금 수집"}</button>
            {tab === "dashboard" && <button onClick={() => window.print()} style={S.printBtn}>인쇄 / PDF</button>}
          </div>
        </div>
        <nav style={S.tabs}>
          {[["dashboard", "대시보드"], ["edit", "데이터 입력"], ["import", "가져오기 / 내보내기"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabActive : {}) }}>{l}</button>
          ))}
        </nav>
      </header>

      {err && <div style={S.errBanner} className="no-print">{err}</div>}

      <main style={S.main}>
        {empty && tab === "dashboard" && (
          <div style={S.card}><div style={{ padding: 24, color: T.inkSoft, lineHeight: 1.7 }}>
            <b>데이터가 없습니다.</b><br />
            과거 데이터를 적재하려면 터미널에서 <code style={S.code}>npm run backfill -- 2023-12-01</code> 을 실행하거나,
            상단의 <b>지금 수집</b> 버튼으로 최근치를 받아오세요. 특수채/회사채 10Y 스프레드는 <b>데이터 입력</b> 탭에서 수기 입력합니다.
          </div></div>
        )}
        {!empty && tab === "dashboard" && (
          <Dashboard data={data} datesByInd={datesByInd} currentDate={currentDate} refs={refs} />
        )}
        {tab === "edit" && <EditPanel data={data} sortedDates={sortedDates} pushRows={pushRows} deleteDates={deleteDates} />}
        {tab === "import" && <ImportPanel data={data} pushRows={pushRows} />}
      </main>

      <footer style={S.footer} className="no-print">미국 스프레드 = 장기물 − 10Y · 신용스프레드 = 대 국고 · 상승=적색 / 하락=청색 · 자동수집: ECOS·FRED·ECB·Yahoo</footer>
    </div>
  );
}

/* ---- 보고서 양식: 섹션(분류)·표기 헬퍼 ---- */
// 사내 보고서와 동일한 구성. 환P / 연금저축 계약이전 행은 제외(별도 지표·내부수치).
const SECTIONS = [
  { label: "금리 · 국내", unit: "%", ids: ["ktb3y", "ktb5y", "ktb10y", "ktb20y", "ktb30y"] },
  { label: "금리 · 해외", unit: "%", ids: ["ust5y", "ust10y", "ust20y", "ust30y", "eu10y", "eu20y"] },
  { label: "환율", unit: "원", ids: ["usdkrw", "eurkrw"] },
  { label: "주가", unit: "pt/원", ids: ["kospi", "samsung", "samsungct", "skt", "skhynix"] },
  { label: "스프레드 · 신용", unit: "%p", ids: ["sgb_aaa_5y", "sgb_aaa_10y", "corp_aam_3y", "corp_aam_10y"] },
];
const monthEndLabel = (iso) => (iso ? `'${iso.slice(2, 4)}.${Number(iso.slice(5, 7))}末` : "–");
const dayLabel = (iso) => (iso ? `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}` : "–");

// 레벨 표기: 금리=%(2자리), 스프레드=%p(2자리, 내부 bp/100), 환율/주가=정수 천단위
function fmtLevel(kind, v) {
  if (v == null) return "–";
  switch (kind) {
    case "rate": return v.toFixed(2);
    case "bp": return (v / 100).toFixed(2);
    case "fx":
    case "idx":
    case "won": return Math.round(v).toLocaleString("ko-KR");
    default: return String(v);
  }
}
// 증감 표기: 금리/스프레드=bp(정수, 하락 △), 환율/주가=%(1자리, 하락 △)
function fmtRptDelta(kind, cur, base) {
  if (cur == null || base == null) return { text: "–", color: T.flat };
  if (kind === "rate" || kind === "bp") {
    const d = kind === "rate" ? (cur - base) * 100 : cur - base;
    const r = Math.round(d);
    return { text: r === 0 ? "–" : r > 0 ? `+${r}bp` : `△${Math.abs(r)}bp`, color: colorOf(d) };
  }
  const pct = base !== 0 ? (cur / base - 1) * 100 : 0;
  const r = pct;
  return { text: Math.abs(r) < 0.05 ? "–" : r > 0 ? `+${r.toFixed(1)}%` : `△${Math.abs(r).toFixed(1)}%`, color: colorOf(r) };
}

/* ---- 대시보드(보고서 양식) 표 ---- */
function Dashboard({ data, datesByInd, currentDate, refs }) {
  const [showSrc, setShowSrc] = useState(false);
  // 특정 날짜의 정확한 값(파생지표는 두 다리에서 계산). 없으면 null.
  const valueAt = (id, d) => {
    if (!d) return null;
    const it = ITEM_BY_ID[id];
    if (it && it.from) {
      const a = valueAt(it.from[0], d), b = valueAt(it.from[1], d);
      return a == null || b == null ? null : (a - b) * 100;
    }
    const row = data[d]; if (!row) return null;
    const v = row[id];
    return v == null || v === "" || isNaN(v) ? null : Number(v);
  };
  // 기준일 시점에 해당 지표가 가진 '최신 가용 날짜'(≤ target)
  const asOfDateFor = (id, target) => {
    if (!target) return null;
    const ds = datesByInd[id]; if (!ds || !ds.length) return null;
    let res = null;
    for (const d of ds) { if (d <= target) res = d; else break; }
    return res;
  };
  const valAsOf = (id, target) => valueAt(id, asOfDateFor(id, target));
  // 기준일 시점 최신값의 '직전 관측치' 값 (전일비 계산용)
  const prevObsVal = (id, target) => {
    const ds = datesByInd[id]; if (!ds) return null;
    const d0 = asOfDateFor(id, target); if (!d0) return null;
    let prev = null;
    for (const d of ds) { if (d < d0) prev = d; else break; }
    return valueAt(id, prev);
  };
  if (!refs) return null;
  // 컬럼 그룹: 현재(금일+전일比/전월比/전분기比/전년比) → 최근(전일/2일전/3일전) → 연말 (메일과 동일)
  const groups = [
    { label: "현재", cols: [
      { key: "cur", cur: true, title: "현재" },
      { key: "d", delta: true, title: "전일比" },
      { key: "mom", delta: true, title: "전월比", date: refs.m1 },
      { key: "qoq", delta: true, title: "전분기比", date: refs.prevQ },
      { key: "yoy", delta: true, title: "전년比", date: refs.prevYear },
    ]},
    { label: "최근", cols: [
      { key: "prevDay", title: "전일", date: refs.prevDay },
      { key: "d2", title: "2일전", date: refs.d2 },
      { key: "d3", title: "3일전", date: refs.d3 },
    ]},
    { label: "연말", cols: [
      { key: "y23", title: "'23末", date: refs.y23 },
      { key: "y24", title: "'24末", date: refs.y24 },
      { key: "y25", title: "'25末", date: refs.y25 },
    ]},
  ];
  const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "–");
  const period = refs.spark && refs.spark.length ? `${md(refs.spark[0])}~${md(currentDate)}` : "";
  const pfx = (s) => s.split(" ")[0];
  // 선 스킴(메일과 동일)
  const THIN = "1px solid #dfe2e7", GRP = "2px solid #7a818d", SECTL = "2px solid #7a818d", SUB = "2px solid #8a909c", OUT = "2.5px solid #5b626d", HB = "2px solid #7a818d";
  const pad = "6px 10px";
  const hbase = { background: "#fff", color: "#2a2f3a", whiteSpace: "nowrap", padding: pad, border: THIN, fontWeight: 700, fontSize: 12 };
  const hSpan = { ...hbase, borderBottom: HB };
  const hGroupCell = { ...hbase, borderBottom: THIN };
  const hColCell = { ...hbase, borderBottom: HB, fontWeight: 600 };
  const catCell = { padding: pad, border: THIN, background: "#f6f7f9", fontWeight: 700, fontSize: 12, textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" };
  const catSub = { fontWeight: 400, fontSize: 10 };
  const nameCell = { padding: pad, border: THIN, textAlign: "left", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
  const numCell = { padding: pad, border: THIN, textAlign: "right", fontSize: 13, whiteSpace: "nowrap" };
  const sparkSvg = (id) => {
    const vals = refs.spark.map((d) => valAsOf(id, d));
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return <span style={{ color: T.flat }}>–</span>;
    const ys = pts.map((p) => p[1]), mn = Math.min(...ys), mx = Math.max(...ys), span = mx - mn || 1;
    const W = 72, H = 18, step = vals.length > 1 ? W / (vals.length - 1) : 0;
    const xy = pts.map(([i, v]) => [i * step, H - 2 - ((v - mn) / span) * (H - 4)]);
    const poly = xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const tr = ys[ys.length - 1] > ys[0] ? T.up : ys[ys.length - 1] < ys[0] ? T.down : T.flat;
    const last = xy[xy.length - 1];
    return <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}><polyline points={poly} fill="none" stroke={tr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2" fill={tr} /></svg>;
  };
  return (
    <div className="report">
      <h2 className="report-print-title" style={S.printTitle}>거시경제지표 현황 (기준일 {currentDate})</h2>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <button onClick={() => setShowSrc((v) => !v)} style={S.srcToggle}>ⓘ 데이터 출처 · 기준 안내 {showSrc ? "▲" : "▼"}</button>
        {showSrc && (
          <div style={S.srcPanel}>
            <p style={S.srcLine}><b>금리 · 국내</b> (국고채 3/5/10/20/30Y) — 한국은행 <b>ECOS</b> (817Y002 시장금리) 자동수집</p>
            <p style={S.srcLine}><b>금리 · 해외</b> — 미국 <b>FRED</b>(DGS5/10/20/30), 유럽 <b>ECB</b> AAA 국채 스팟(YC)</p>
            <p style={S.srcLine}><b>환율</b> — 한국은행 ECOS(원/달러·원/유로 매매기준율) · <b>주가</b> — Yahoo Finance(코스피·삼성전자)</p>
            <p style={S.srcLine}><b>스프레드 · 신용</b> = 평가수익률 − 국고채(동일만기). 회사채 AA- 3Y는 ECOS(평가사 민평기반)로 자동계산, 특수채 AAA 5/10Y·회사채 AA- 10Y는 평가사 5사평균 기준 <b>수기입력</b></p>
            <p style={{ ...S.srcLine, marginTop: 8, color: T.gold, borderTop: `1px solid ${T.lineSoft}`, paddingTop: 8 }}>
              ※ <b>공식 보고서와의 차이</b>: 귀사 공식 보고서는 채권금리를 <b>‘채권시가평가수익률 — 평가사 5사평균’</b>(나이스피앤아이·한국자산평가·KIS·에프앤·이지)으로 산출합니다.
              본 앱의 국고채는 <b>ECOS(한국은행)</b> 자동수집이라 평가사 평균과 <b>소수점 단위 차이</b>가 있을 수 있습니다 (예: 국고 3Y 6/12 — ECOS 3.808 vs 평가사 3.790).
            </p>
          </div>
        )}
      </div>
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {QUICK_LINKS.map(([ic, label, url]) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 12px", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, textDecoration: "none", fontSize: 12.5, fontWeight: 600 }}>{ic} {label}</a>
        ))}
      </div>
      <div style={S.tableWrap}>
        <div style={{ display: "inline-block", border: OUT }}>
          <table style={{ borderCollapse: "collapse", fontFamily: sans, fontVariantNumeric: "tabular-nums" }} className="report-table">
            <thead>
              <tr>
                <th rowSpan={2} style={hSpan}>분류</th>
                <th rowSpan={2} style={{ ...hSpan, borderLeft: GRP }}>지표</th>
                {groups.map((g) => <th key={g.label} colSpan={g.cols.length} style={{ ...hGroupCell, borderLeft: GRP }}>{g.label}</th>)}
                <th rowSpan={2} style={{ ...hSpan, borderLeft: GRP }}>추세<br /><span style={{ fontWeight: 400, fontSize: 10, color: "#8a909c" }}>{period}</span></th>
              </tr>
              <tr>
                {groups.flatMap((g) => g.cols.map((c, i) => <th key={c.key} style={{ ...hColCell, ...(i === 0 ? { borderLeft: GRP } : {}) }}>{c.title}</th>))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((sec) => {
                const secAsOf = sec.ids.reduce((mx, id) => { const d = asOfDateFor(id, currentDate); return d && (!mx || d > mx) ? d : mx; }, null);
                return sec.ids.map((id, ri) => {
                  const it = ITEM_BY_ID[id]; if (!it) return null;
                  const kind = it.kind, cur = valAsOf(id, currentDate);
                  const isSub = ri > 0 && pfx(it.label) !== pfx(ITEM_BY_ID[sec.ids[ri - 1]].label) && (it.label.startsWith("유럽") || it.label.startsWith("회사채"));
                  const sTop = ri === 0 ? { borderTop: SECTL } : isSub ? { borderTop: SUB } : {};
                  return (
                    <tr key={id}>
                      {ri === 0 && <td rowSpan={sec.ids.length} style={{ ...catCell, borderTop: SECTL }}>{sec.label}<br /><span style={{ ...catSub, color: "#7a818d" }}>(단위:{sec.unit})</span><br /><span style={{ ...catSub, color: "#9aa0ab" }}>* 기준 {md(secAsOf)}</span></td>}
                      <td style={{ ...nameCell, borderLeft: GRP, ...sTop }}>{it.label}</td>
                      {groups.flatMap((g) => g.cols.map((c, ci) => {
                        const gl = ci === 0 ? { borderLeft: GRP } : {};
                        if (c.delta) {
                          const base = c.key === "d" ? prevObsVal(id, currentDate) : valAsOf(id, c.date);
                          const dd = fmtRptDelta(kind, cur, base);
                          return <td key={c.key} style={{ ...numCell, ...gl, ...sTop, color: dd.color, fontWeight: 600 }}>{dd.text}</td>;
                        }
                        return <td key={c.key} style={{ ...numCell, ...gl, ...sTop, ...(c.cur ? { background: "#eef4fb", fontWeight: 700 } : {}) }}>{fmtLevel(kind, c.cur ? cur : valAsOf(id, c.date))}</td>;
                      }))}
                      <td style={{ padding: "2px 6px", border: THIN, borderLeft: GRP, textAlign: "center", whiteSpace: "nowrap", ...sTop }}>{sparkSvg(id)}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={S.rptNote} className="no-print">레벨: 금리·스프레드 %, 환율 원, 주가 pt/원 · 증감: 금리·스프레드 bp, 환율·주가 % · 상승 +/적색, 하락 △/청색 · 추세선 = 최근 {refs.spark.length}영업일 · 분류별 ‘기준’은 해당 데이터 일자(as-of)</p>
    </div>
  );
}

/* ---- 데이터 입력 ---- */
function EditPanel({ data, sortedDates, pushRows, deleteDates }) {
  const [newDate, setNewDate] = useState("");
  const rows = sortedDates.slice().reverse();
  const setCell = (date, id, raw) => pushRows([{ date, indicator: id, value: raw }]);
  const addDate = () => { if (!newDate || data[newDate]) return; pushRows([{ date: newDate, indicator: STORABLE[0].id, value: "" }]); setNewDate(""); };
  const delDate = (date) => { if (window.confirm(`${date} 행을 삭제할까요?`)) deleteDates([date]); };
  return (
    <div style={S.card}>
      <div style={S.cardHead}><h2 style={S.cardTitle}>데이터 입력 / 편집</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={S.input} />
          <button onClick={addDate} style={S.btnPrimary}>+ 날짜 추가</button>
        </div>
      </div>
      <p style={{ ...S.hint, padding: "0 18px" }}>auto = 자동수집 / manual = 수기. 자동 항목도 직접 덮어쓸 수 있습니다.</p>
      <div style={{ ...S.tableWrap, maxHeight: 520 }}>
        <table style={S.table}>
          <thead><tr><th style={{ ...S.th, ...S.thIndic }}>날짜</th>
            {STORABLE.map((it) => <th key={it.id} style={{ ...S.th, ...(it.mode === "manual" ? S.thManual : {}) }} title={it.label}>{it.label}</th>)}
            <th style={{ ...S.th, textAlign: "center" }}>삭제</th>
          </tr></thead>
          <tbody>
            {rows.map((date) => (
              <tr key={date}><td style={{ ...S.td, ...S.tdIndic }}>{date}</td>
                {STORABLE.map((it) => (
                  <td key={it.id} style={S.tdEdit}>
                    <input style={{ ...S.cellInput, ...(it.mode === "manual" ? { background: T.goldBg } : {}) }}
                      value={data[date]?.[it.id] ?? ""} onChange={(e) => setCell(date, it.id, e.target.value)} inputMode="decimal" />
                  </td>
                ))}
                <td style={{ ...S.td, textAlign: "center" }}>
                  <button onClick={() => delDate(date)} style={S.delBtn} title="이 날짜 행 삭제">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={S.hint}>※ 미국 20Y−10Y/30Y−10Y, 회사채 AA− 3Y 스프레드는 입력값에서 자동 계산됩니다.</p>
    </div>
  );
}

/* 평가사/엑셀 헤더 → 지표 id 자동 매핑 (채권종류 + 만기 키워드). 없으면 STORABLE id/label 매칭. */
const STORABLE_BYLABEL = Object.fromEntries(STORABLE.map((i) => [i.label.replace(/\s/g, ""), i.id]));
const LABEL_OF = Object.fromEntries(STORABLE.map((i) => [i.id, i.label]));
const dateRe = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
function mapHeaderToId(combined) {
  const s = (combined || "").replace(/\s/g, "");
  if (!s) return null;
  if (STORABLE.find((x) => x.id === s)) return s;
  if (STORABLE_BYLABEL[s]) return STORABLE_BYLABEL[s];
  const my = s.match(/(\d+)\s*(?:년|y)/i);
  const mat = my ? Number(my[1]) : null;
  if (/특수채|공사채|공단채|AAA/.test(s)) {
    if (mat === 5) return "sgbAAA5yYld";
    if (mat === 10) return "sgbAAA10yYld";
  }
  if (/회사채|무보증|AA-|AA−/.test(s)) {
    if (mat === 3) return "corpAA3yYield";
    if (mat === 10) return "corpAA10yYld";
  }
  if (/국고|국채/.test(s)) {
    if (mat === 3) return "ktb3y"; if (mat === 5) return "ktb5y"; if (mat === 10) return "ktb10y";
    if (mat === 20) return "ktb20y"; if (mat === 30) return "ktb30y";
  }
  if (/달러|usd/i.test(s)) return "usdkrw";
  if (/유로|eur/i.test(s)) return "eurkrw";
  if (/코스피|kospi/i.test(s)) return "kospi";
  if (/삼성/i.test(s)) return "samsung";
  return null;
}

/* ---- 가져오기 / 내보내기 ---- */
function ImportPanel({ data, pushRows }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null); // { rows, mapping }

  const parse = () => {
    setPreview(null);
    try {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setMsg("헤더 + 데이터 행이 필요합니다."); return; }
      const delim = lines[0].includes("\t") ? "\t" : ",";
      const grid = lines.map((l) => l.split(delim).map((c) => c.trim()));
      const firstData = grid.findIndex((r) => r.some((c) => dateRe.test(c)));
      if (firstData < 1) { setMsg("날짜 행을 찾지 못했습니다. (헤더 + YYYY-MM-DD 날짜 필요)"); return; }
      const ncol = Math.max(...grid.map((r) => r.length));
      const combined = [];
      for (let c = 0; c < ncol; c++) combined[c] = grid.slice(0, firstData).map((r) => r[c] || "").join("");
      const dateCol = grid[firstData].findIndex((c) => dateRe.test(c));
      const mapping = [];
      for (let c = 0; c < ncol; c++) {
        if (c === dateCol) continue;
        const id = mapHeaderToId(combined[c]);
        if (id) mapping.push({ col: c, id, header: combined[c] });
      }
      if (!mapping.length) { setMsg("인식된 지표 컬럼이 없습니다. 헤더에 '특수채 AAA 10년'처럼 종목·만기가 있어야 합니다."); return; }
      const out = [];
      for (let i = firstData; i < grid.length; i++) {
        const dm = (grid[i][dateCol] || "").match(dateRe);
        if (!dm) continue;
        const date = `${dm[1]}-${pad(+dm[2])}-${pad(+dm[3])}`;
        for (const m of mapping) {
          const v = parseFloat(String(grid[i][m.col] || "").replace(/,/g, ""));
          if (!isNaN(v)) out.push({ date, indicator: m.id, value: v });
        }
      }
      setPreview({ rows: out, mapping });
      setMsg(`인식: ${mapping.length}개 지표 · ${out.length}개 값. 매핑 확인 후 '가져오기 실행'.`);
    } catch (e) { setMsg("오류: " + e.message); }
  };
  const apply = () => {
    if (!preview || !preview.rows.length) { setMsg("먼저 '미리보기'로 분석하세요."); return; }
    pushRows(preview.rows);
    setMsg(`완료 — ${preview.rows.length}개 값 반영.`);
    setText(""); setPreview(null);
  };
  const exportCSV = () => {
    const headerOrder = ["날짜", ...STORABLE.map((i) => i.id)];
    const dates = Object.keys(data).sort();
    const head = headerOrder.join(",");
    const body = dates.map((d) => [d, ...STORABLE.map((i) => data[d]?.[i.id] ?? "")].join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `macro_${toISO(new Date())}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={S.card}>
        <div style={S.cardHead}><h2 style={S.cardTitle}>평가사 / 엑셀 붙여넣기 가져오기</h2></div>
        <div style={{ padding: "0 18px 18px" }}>
          <p style={S.hint}>
            채권시가평가 포털의 <b>엑셀(또는 화면)을 그대로 복사해 붙여넣고</b> ‘미리보기 → 가져오기 실행’.
            헤더가 여러 줄(채권종류/만기/5사평균)이어도 자동 인식하며 <b>날짜 + 종목·만기</b>로 컬럼을 매핑합니다.
            예: ‘특수채 AAA 10년’→특수채 AAA 10Y, ‘회사채 AA- 10년’→회사채 AA- 10Y. 같은 날짜는 덮어씁니다.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={parse} style={S.btnPrimary}>미리보기(분석)</button>
            <button onClick={apply} style={{ ...S.btnPrimary, opacity: preview ? 1 : 0.5 }} disabled={!preview}>가져오기 실행</button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"일자\t특수채AAA 5년\t특수채AAA 10년\t회사채AA- 10년\n2026-06-15\t4.21\t4.31\t5.60\n..."} style={S.textarea} />
          {msg && <div style={S.msg}>{msg}</div>}
          {preview && (
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              <b>매핑 미리보기</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                {preview.mapping.map((m) => (
                  <li key={m.col}><span style={{ color: T.inkSoft }}>{m.header || `열 ${m.col + 1}`}</span> → <b>{LABEL_OF[m.id] || m.id}</b></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <section style={S.card}>
        <div style={S.cardHead}><h2 style={S.cardTitle}>내보내기</h2></div>
        <div style={{ padding: "0 18px 18px" }}><button onClick={exportCSV} style={S.btnPrimary}>CSV 내보내기</button></div>
      </section>
    </div>
  );
}

/* ---- 스타일 ---- */
const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const sans = "system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const S = {
  root: { background: T.paper, minHeight: "100vh", fontFamily: sans, color: T.ink, fontVariantNumeric: "tabular-nums" },
  header: { background: T.header, color: "#fff", padding: "16px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", flexDirection: "column", gap: 10 },
  titleRow: { display: "flex", alignItems: "baseline", gap: 10 },
  logoDot: { width: 9, height: 9, borderRadius: 2, background: T.gold, display: "inline-block", transform: "translateY(-1px)" },
  title: { fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 },
  titleSub: { fontSize: 10.5, letterSpacing: "0.18em", color: "#7C8699", fontFamily: mono },
  asOfRow: { display: "flex", alignItems: "center", gap: 10 },
  asOfLabel: { fontSize: 11, color: "#8A93A4", letterSpacing: "0.05em" },
  dateSelect: { background: T.headerSoft, color: "#fff", border: `1px solid ${T.gold}`, borderRadius: 4, padding: "5px 9px", fontSize: 14, fontFamily: mono, fontWeight: 600 },
  asOfNote: { fontSize: 11, color: "#6E7787", fontFamily: mono },
  syncBtn: { background: T.gold, color: "#15181E", border: "none", borderRadius: 4, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  printBtn: { background: "transparent", color: "#fff", border: `1px solid ${T.gold}`, borderRadius: 4, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  tabs: { display: "flex", gap: 2 },
  tab: { background: "transparent", border: "none", color: "#8A93A4", padding: "9px 14px", fontSize: 13, cursor: "pointer", borderBottom: "2px solid transparent", fontFamily: sans },
  tabActive: { color: "#fff", borderBottom: `2px solid ${T.gold}` },
  errBanner: { background: "#FCEEEE", color: "#8C2433", fontSize: 12.5, padding: "9px 22px", borderBottom: "1px solid #F0C9CE" },
  main: { padding: 20, maxWidth: 1500, margin: "0 auto" },
  footer: { textAlign: "center", fontSize: 11, color: T.inkSoft, padding: "10px 0 26px", fontFamily: mono },
  dashControls: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  ctrlLabel: { fontSize: 12, color: T.inkSoft },
  chip: { border: `1px solid ${T.line}`, background: "#fff", borderRadius: 999, padding: "4px 11px", fontSize: 12, cursor: "pointer", color: T.inkSoft },
  chipActive: { background: T.header, color: "#fff", borderColor: T.header },
  legend: { marginLeft: "auto", fontSize: 12, color: T.inkSoft, display: "flex", alignItems: "center" },
  legendDot: { width: 8, height: 8, borderRadius: 999, display: "inline-block", marginRight: 5 },
  card: { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,24,30,0.04)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${T.lineSoft}` },
  cardTitle: { fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  cardUnit: { fontSize: 11, color: T.inkSoft, fontFamily: mono },
  tableWrap: { overflowX: "auto" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 12.5, fontFamily: mono },
  th: { padding: "8px 10px", textAlign: "right", color: T.inkSoft, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}`, background: "#FBFBF9", position: "sticky", top: 0 },
  thIndic: { textAlign: "left", position: "sticky", left: 0, zIndex: 2, background: "#FBFBF9", minWidth: 124 },
  thDaily: { color: "#9098A4" }, thAnchor: { color: "#9098A4", background: "#FCFCFB" },
  thCurrent: { background: T.goldBg, color: "#6B5417", borderLeft: `2px solid ${T.gold}` },
  thCmp: { background: "#F2F4F7", color: "#3C4350" }, thManual: { background: T.goldBg, color: "#6B5417" },
  thTrend: { textAlign: "center" },
  td: { padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${T.lineSoft}` },
  tdIndic: { textAlign: "left", fontFamily: sans, fontWeight: 600, fontSize: 12.5, position: "sticky", left: 0, background: T.panel, zIndex: 1 },
  tdDaily: { color: "#6B7280" }, tdAnchor: { color: "#7B828E" },
  divider: { borderLeft: `2px solid ${T.line}` },
  groupSep: { borderLeft: "2px solid #AEB4BE" }, // 주요 그룹 경계(현재/증감) — 강조 세로선
  tdCurrent: { background: T.goldBg, fontWeight: 700, borderLeft: `2px solid ${T.gold}` },
  tdCmp: { background: "#F7F8FA" }, cmpSub: { display: "block", fontSize: 10.5, opacity: 0.85, marginTop: 1 },
  tdTrend: { textAlign: "center", padding: "4px 8px" },
  tdEdit: { padding: "2px 3px", borderBottom: `1px solid ${T.lineSoft}` },
  cellInput: { width: 70, border: `1px solid ${T.line}`, borderRadius: 3, padding: "4px 5px", fontSize: 12, fontFamily: mono, textAlign: "right" },
  input: { border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 9px", fontSize: 13, fontFamily: sans },
  textarea: { width: "100%", minHeight: 150, border: `1px solid ${T.line}`, borderRadius: 6, padding: 11, fontSize: 12, fontFamily: mono, boxSizing: "border-box", resize: "vertical" },
  btnPrimary: { background: T.header, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  delBtn: { background: "transparent", border: `1px solid ${T.line}`, color: T.up, borderRadius: 4, padding: "2px 7px", fontSize: 12, cursor: "pointer", fontWeight: 700 },
  hint: { fontSize: 12, color: T.inkSoft, lineHeight: 1.6, margin: "10px 18px" },
  msg: { marginTop: 10, fontSize: 12.5, color: T.header, background: "#EEF1F5", padding: "8px 11px", borderRadius: 6 },
  code: { fontFamily: mono, background: "#F1F3F6", padding: "2px 6px", borderRadius: 4, fontSize: 11.5, color: T.header },
  // 보고서 괘선표 — 균일한 그리드
  printTitle: { display: "none" },
  rptNote: { fontSize: 11, color: T.inkSoft, marginTop: 10, lineHeight: 1.6, fontFamily: mono },
  srcToggle: { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, color: T.header, cursor: "pointer", fontWeight: 600 },
  srcPanel: { marginTop: 8, background: "#FBFBF9", border: `1px solid ${T.line}`, borderRadius: 8, padding: "12px 16px" },
  srcLine: { fontSize: 12, color: T.ink, lineHeight: 1.7, margin: "2px 0" },
  rtable: { borderCollapse: "collapse", width: "100%", fontSize: 12, fontFamily: mono, border: "1px solid #9AA0AB" },
  rth: { padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap", border: "1px solid #D2D6DD", background: "#F2F3F5", color: "#2A2F3A", position: "sticky", top: 0 },
  rthCat: { textAlign: "center", background: "#E7E9EE", minWidth: 150 },
  rthNum: { color: "#3C4350" },
  rthCur: { background: T.goldBg, color: "#6B5417" },
  rthDelta: { background: "#EEF1F5", color: "#3C4350" },
  rtd: { padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", border: "1px solid #D2D6DD" },
  rtdCat: { textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 11.5, background: "#FAFAF7", verticalAlign: "middle" },
  rtdName: { textAlign: "left", fontFamily: sans, fontWeight: 600, fontSize: 12, minWidth: 96 },
  rtdNum: { color: T.ink },
  rtdCur: { background: T.goldBg, fontWeight: 700 },
  rtdDelta: { fontSize: 11.5 },
};
const CSS = `
  select:focus, input:focus, textarea:focus, button:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 1px; }
  tbody tr:hover td { background: #FAFAF6; }
  ::-webkit-scrollbar { height: 10px; width: 10px; }
  ::-webkit-scrollbar-thumb { background: #CBD0D8; border-radius: 6px; }
  button:disabled { opacity: 0.6; cursor: default; }
  .report-print-title { display: none; }
  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    html, body { background: #fff !important; }
    .no-print { display: none !important; }
    .macro-root { background: #fff !important; min-height: 0 !important; }
    main { padding: 0 !important; max-width: none !important; }
    .report > div { overflow: visible !important; }
    .report-print-title { display: block !important; text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 8px; }
    .report-table { font-size: 8.5px !important; width: 100% !important; }
    .report-table th, .report-table td { padding: 2px 3px !important; }
    .report-table th { position: static !important; }
    tbody tr:hover td { background: transparent !important; }
  }
`;
