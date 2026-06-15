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
  ]},
  { id: "spread_sgb", label: "스프레드 · 특수채 AAA (대 국고)", unit: "bp", items: [
    { id: "sgb_aaa_5y", label: "특수채 AAA 5Y", kind: "bp" }, { id: "sgb_aaa_10y", label: "특수채 AAA 10Y", kind: "bp" },
  ]},
  { id: "spread_corp", label: "스프레드 · 회사채 AA− (대 국고)", unit: "bp", items: [
    // 3Y 스프레드 = (ECOS 회사채AA-3년 수익률) − (국고채 3Y), bp 환산
    { id: "corp_aam_3y", label: "회사채 AA− 3Y", kind: "bp", from: ["corpAA3yYield", "ktb3y"] },
    { id: "corp_aam_10y", label: "회사채 AA− 10Y", kind: "bp" },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const ITEM_BY_ID = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

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
  { id: "corpAA3yYield", label: "회사채 AA- 3년 수익률(%)", mode: "auto" },
  { id: "sgb_aaa_5y", label: "특수채 AAA 5Y 스프레드(bp)", mode: "manual" },
  { id: "sgb_aaa_10y", label: "특수채 AAA 10Y 스프레드(bp)", mode: "manual" },
  { id: "corp_aam_10y", label: "회사채 AA- 10Y 스프레드(bp)", mode: "manual" },
];

/* ---- 날짜 유틸 ---- */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const lastDayOfMonth = (y, mi) => new Date(y, mi + 1, 0);
const fmtMD = (iso) => { const d = parseISO(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
function asOfDate(sorted, target) { let res = null; for (const d of sorted) { if (d <= target) res = d; else break; } return res; }

/* ---- 값 조회 (derived 자동 계산) ---- */
function getValue(data, dateISO, id) {
  if (!dateISO) return null;
  const item = ITEM_BY_ID[id];
  if (item && item.from) {
    const a = getValue(data, dateISO, item.from[0]);
    const b = getValue(data, dateISO, item.from[1]);
    if (a == null || b == null) return null;
    return (a - b) * 100;
  }
  const row = data[dateISO];
  if (!row) return null;
  const v = row[id];
  return v == null || v === "" || isNaN(v) ? null : Number(v);
}

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
  useEffect(() => {
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
      strip: sortedDates.slice(Math.max(0, idx - dailyCount), idx),
    };
  }, [currentDate, sortedDates, dailyCount]);

  if (!loaded) return <div style={{ padding: 40, fontFamily: "system-ui", color: T.inkSoft }}>불러오는 중…</div>;

  const empty = sortedDates.length === 0;

  const cmpCols = refs ? [
    { key: "d", title: "전일비", date: refs.prevDay }, { key: "mom", title: "전월비", date: refs.m1 },
    { key: "qoq", title: "전분기비", date: refs.prevQ }, { key: "yoy", title: "전년비", date: refs.prevYear },
  ] : [];
  const dailyCols = refs ? refs.strip.slice().reverse().map((d) => ({ key: d, title: fmtMD(d), date: d })) : [];
  const anchorCols = refs ? [
    { key: "m1", title: "전월말", date: refs.m1 }, { key: "m2", title: "2M전", date: refs.m2 }, { key: "m3", title: "3M전", date: refs.m3 },
    { key: "y25", title: "25말", date: refs.y25 }, { key: "y24", title: "24말", date: refs.y24 }, { key: "y23", title: "23말", date: refs.y23 },
  ] : [];

  return (
    <div style={S.root}>
      <style>{CSS}</style>
      <header style={S.header}>
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
          </div>
        </div>
        <nav style={S.tabs}>
          {[["dashboard", "대시보드"], ["edit", "데이터 입력"], ["import", "가져오기 / 내보내기"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabActive : {}) }}>{l}</button>
          ))}
        </nav>
      </header>

      {err && <div style={S.errBanner}>{err}</div>}

      <main style={S.main}>
        {empty && tab === "dashboard" && (
          <div style={S.card}><div style={{ padding: 24, color: T.inkSoft, lineHeight: 1.7 }}>
            <b>데이터가 없습니다.</b><br />
            과거 데이터를 적재하려면 터미널에서 <code style={S.code}>npm run backfill -- 2023-12-01</code> 을 실행하거나,
            상단의 <b>지금 수집</b> 버튼으로 최근치를 받아오세요. 특수채/회사채 10Y 스프레드는 <b>데이터 입력</b> 탭에서 수기 입력합니다.
          </div></div>
        )}
        {!empty && tab === "dashboard" && (
          <Dashboard data={data} currentDate={currentDate} cmpCols={cmpCols} dailyCols={dailyCols} anchorCols={anchorCols} dailyCount={dailyCount} setDailyCount={setDailyCount} />
        )}
        {tab === "edit" && <EditPanel data={data} sortedDates={sortedDates} pushRows={pushRows} deleteDates={deleteDates} />}
        {tab === "import" && <ImportPanel data={data} pushRows={pushRows} />}
      </main>

      <footer style={S.footer}>미국 스프레드 = 장기물 − 10Y · 신용스프레드 = 대 국고(bp) · 상승=적색 / 하락=청색 · 자동수집: ECOS·FRED·ECB·Yahoo</footer>
    </div>
  );
}

/* ---- 대시보드 표 ---- */
function Dashboard({ data, currentDate, cmpCols, dailyCols, anchorCols, dailyCount, setDailyCount }) {
  return (
    <div>
      <div style={S.dashControls}>
        <span style={S.ctrlLabel}>일별 표시 영업일수</span>
        {[3, 5, 8].map((n) => <button key={n} onClick={() => setDailyCount(n)} style={{ ...S.chip, ...(dailyCount === n ? S.chipActive : {}) }}>{n}일</button>)}
        <span style={S.legend}><i style={{ ...S.legendDot, background: T.up }} /> 상승<i style={{ ...S.legendDot, background: T.down, marginLeft: 12 }} /> 하락</span>
      </div>
      {GROUPS.map((g) => (
        <section key={g.id} style={S.card}>
          <div style={S.cardHead}><h2 style={S.cardTitle}>{g.label}</h2><span style={S.cardUnit}>단위 {g.unit}</span></div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead><tr>
                <th style={{ ...S.th, ...S.thIndic }}>지표</th>
                <th style={{ ...S.th, ...S.thCurrent }} title={currentDate}>현재일</th>
                {cmpCols.map((c) => <th key={c.key} style={{ ...S.th, ...S.thCmp }} title={c.date || "데이터 없음"}>{c.title}</th>)}
                {dailyCols.map((c) => <th key={c.key} style={{ ...S.th, ...S.thDaily }} title={c.date}>{c.title}</th>)}
                {anchorCols.map((c, i) => <th key={c.key} style={{ ...S.th, ...S.thAnchor, ...(i === 0 ? S.divider : {}) }} title={c.date || "데이터 없음"}>{c.title}</th>)}
                <th style={{ ...S.th, ...S.thTrend }}>추세</th>
              </tr></thead>
              <tbody>
                {g.items.map((it) => {
                  const cur = getValue(data, currentDate, it.id);
                  const spark = [...dailyCols.slice().reverse().map((c) => getValue(data, c.date, it.id)), cur];
                  return (
                    <tr key={it.id}>
                      <td style={{ ...S.td, ...S.tdIndic }}>{it.label}</td>
                      <td style={{ ...S.td, ...S.tdCurrent }}>{fmtVal(it.kind, cur)}</td>
                      {cmpCols.map((c) => { const d = fmtDelta(it.kind, cur, getValue(data, c.date, it.id));
                        return <td key={c.key} style={{ ...S.td, ...S.tdCmp }}><span style={{ color: d.color, fontWeight: 600 }}>{d.text}</span>{d.sub && <span style={{ ...S.cmpSub, color: d.color }}>{d.sub}</span>}</td>; })}
                      {dailyCols.map((c) => <td key={c.key} style={{ ...S.td, ...S.tdDaily }}>{fmtVal(it.kind, getValue(data, c.date, it.id))}</td>)}
                      {anchorCols.map((c, i) => <td key={c.key} style={{ ...S.td, ...S.tdAnchor, ...(i === 0 ? S.divider : {}) }}>{fmtVal(it.kind, getValue(data, c.date, it.id))}</td>)}
                      <td style={{ ...S.td, ...S.tdTrend }}><Spark series={spark} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
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

/* ---- 가져오기 / 내보내기 ---- */
function ImportPanel({ data, pushRows }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const headerOrder = ["날짜", ...STORABLE.map((i) => i.id)];

  const copyTemplate = async () => {
    try { await navigator.clipboard.writeText(headerOrder.join("\t")); setMsg("헤더(컬럼 순서)를 복사했습니다."); }
    catch { setMsg("복사 실패 — 헤더: " + headerOrder.join("\t")); }
  };
  const doImport = () => {
    try {
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setMsg("헤더 1행 + 데이터 1행 이상 필요"); return; }
      const delim = lines[0].includes("\t") ? "\t" : ",";
      const headers = lines[0].split(delim).map((h) => h.trim());
      const byLabel = Object.fromEntries(STORABLE.map((i) => [i.label.replace(/\s/g, ""), i.id]));
      const colIds = headers.map((h) => {
        if (h === "날짜" || h.toLowerCase() === "date") return "__date";
        if (STORABLE.find((s) => s.id === h)) return h;
        return byLabel[h.replace(/\s/g, "")] || null;
      });
      const di = colIds.indexOf("__date");
      if (di < 0) { setMsg("‘날짜’ 컬럼을 찾지 못했습니다."); return; }
      const out = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(delim);
        let date = (cells[di] || "").trim().replace(/[/.]/g, "-");
        const m = date.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) continue;
        date = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
        cells.forEach((c, ci) => {
          const id = colIds[ci];
          if (!id || id === "__date") return;
          const v = parseFloat(String(c).replace(/,/g, "").trim());
          if (!isNaN(v)) out.push({ date, indicator: id, value: v });
        });
      }
      pushRows(out);
      setText(""); setMsg(`완료 — ${out.length}개 값 반영.`);
    } catch (e) { setMsg("오류: " + e.message); }
  };
  const exportCSV = () => {
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
        <div style={S.cardHead}><h2 style={S.cardTitle}>엑셀에서 붙여넣기 가져오기</h2></div>
        <div style={{ padding: "0 18px 18px" }}>
          <p style={S.hint}>1행=헤더(날짜 + 지표), 2행부터 일자별 값. 탭/콤마 인식, 같은 날짜는 덮어씁니다.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={copyTemplate} style={S.btnPrimary}>헤더 복사</button>
            <button onClick={doImport} style={S.btnPrimary}>가져오기 실행</button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"날짜\tktb3y\tktb5y\t...\n2026-06-12\t2.49\t2.58\t..."} style={S.textarea} />
          {msg && <div style={S.msg}>{msg}</div>}
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
  tdDaily: { color: "#6B7280" }, tdAnchor: { color: "#7B828E" }, divider: { borderLeft: `2px solid ${T.line}` },
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
};
const CSS = `
  select:focus, input:focus, textarea:focus, button:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 1px; }
  tbody tr:hover td { background: #FAFAF6; }
  ::-webkit-scrollbar { height: 10px; width: 10px; }
  ::-webkit-scrollbar-thumb { background: #CBD0D8; border-radius: 6px; }
  button:disabled { opacity: 0.6; cursor: default; }
`;
