// FRED (St. Louis Fed) 수집기 — 미국 국채 일별 금리 (Constant Maturity)
// 문서: https://fred.stlouisfed.org/docs/api/fred/series_observations.html

const FRED_SERIES = {
  ust5y: "DGS5",
  ust10y: "DGS10",
  ust20y: "DGS20",
  ust30y: "DGS30",
};

export async function collectFred(startISO, endISO) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY 미설정");
  const out = [];
  for (const [ind, sid] of Object.entries(FRED_SERIES)) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${key}&file_type=json&observation_start=${startISO}&observation_end=${endISO}`;
      const res = await fetch(url);
      const json = await res.json();
      for (const o of json.observations || []) {
        if (o.value === "." || o.value == null) continue; // 휴장일
        const v = parseFloat(o.value);
        if (!isNaN(v)) out.push({ date: o.date, indicator: ind, value: v, source: "FRED" });
      }
    } catch (e) {
      console.error(`[FRED] ${ind} 실패:`, e.message);
    }
  }
  return out;
}
