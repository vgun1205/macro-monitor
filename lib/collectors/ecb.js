// ECB Data Portal 수집기 — 유로지역 AAA 정부채 스팟 수익률 (Yield Curve)
// 문서: https://data.ecb.europa.eu/help/api/overview
// dataflow: YC, key 예시: B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y
//
// ★ VERIFY: SR_10Y / SR_20Y 키가 유효한지 ECB 포털에서 확인 후 조정.

const ECB_KEYS = {
  eu10y: "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y",
  eu20y: "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_20Y",
};

export async function collectEcb(startISO, endISO) {
  const out = [];
  for (const [ind, key] of Object.entries(ECB_KEYS)) {
    try {
      const url = `https://data-api.ecb.europa.eu/service/data/YC/${key}?startPeriod=${startISO}&endPeriod=${endISO}&format=csvdata`;
      const res = await fetch(url, { headers: { Accept: "text/csv" } });
      if (!res.ok) continue;
      const csv = await res.text();
      const lines = csv.trim().split(/\r?\n/);
      if (lines.length < 2) continue;
      const header = lines[0].split(",");
      const ti = header.indexOf("TIME_PERIOD");
      const vi = header.indexOf("OBS_VALUE");
      if (ti < 0 || vi < 0) continue;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(",");
        const date = cells[ti];
        const v = parseFloat(cells[vi]);
        if (date && !isNaN(v)) out.push({ date, indicator: ind, value: v, source: "ECB" });
      }
    } catch (e) {
      console.error(`[ECB] ${ind} 실패:`, e.message);
    }
  }
  return out;
}
