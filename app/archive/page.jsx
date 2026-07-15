"use client";
// MI 아카이브 — 쌓인 기사(국내·글로벌)를 키워드·기간·출처로 검색해 꺼내 쓰는 화면
import { useEffect, useState } from "react";

const KIND_LABEL = { fss_report: "금감원·보도", fsc_report: "금융위·보도", knia_report: "손보협회·보도", knia_notice: "손보협회·공지", news: "뉴스", global: "글로벌" };
const KIND_COLOR = { fss_report: "#1d4ed8", fsc_report: "#6d28d9", knia_report: "#d97706", knia_notice: "#b45309", news: "#147b8c", global: "#8a5a1f" };

export default function ArchivePage() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [region, setRegion] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);

  async function search() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (region) p.set("region", region);
      p.set("limit", "100");
      const r = await fetch(`/api/archive?${p}`);
      const j = await r.json();
      setRows(j.rows || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { search(); }, []); // 첫 진입 시 최신순

  const S = {
    wrap: { maxWidth: 900, margin: "0 auto", padding: "24px 16px", fontFamily: "'Noto Sans KR',sans-serif", color: "#1a1d23" },
    h1: { fontSize: 22, fontWeight: 800, margin: "0 0 4px" },
    sub: { color: "#6b7280", fontSize: 13, margin: "0 0 16px" },
    bar: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
    input: { padding: "8px 10px", border: "1px solid #d4d8de", borderRadius: 6, fontSize: 14 },
    btn: { padding: "8px 16px", background: "#147b8c", color: "#fff", border: 0, borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" },
    card: { border: "1px solid #e3e7ec", borderRadius: 8, padding: "10px 14px", marginBottom: 8, cursor: "pointer", background: "#fff" },
    tag: (k) => ({ fontSize: 11.5, fontWeight: 700, color: KIND_COLOR[k] || "#6b7280", marginRight: 6 }),
    title: { fontSize: 14.5, fontWeight: 600 },
    meta: { fontSize: 12, color: "#9aa0ab", marginTop: 2 },
    preview: { fontSize: 13, color: "#3a3f47", lineHeight: 1.7, marginTop: 8, whiteSpace: "pre-wrap" },
  };

  return (
    <main style={S.wrap}>
      <h1 style={S.h1}>MI 아카이브</h1>
      <p style={S.sub}>매일 수집된 위험관리 MI 기사를 검색합니다 — 키워드·기간·구분(국내/글로벌)</p>
      <div style={S.bar}>
        <input style={{ ...S.input, flex: 1, minWidth: 200 }} placeholder="키워드 (예: 경과조치, 전산장애, K-ICS)" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <input style={S.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input style={S.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select style={S.input} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">전체</option><option value="domestic">국내</option><option value="global">글로벌</option>
        </select>
        <button style={S.btn} onClick={search} disabled={loading}>{loading ? "검색 중…" : "검색"}</button>
      </div>
      {rows.length === 0 && !loading && <p style={{ color: "#9aa0ab" }}>결과가 없습니다. (아카이브는 매일 발송 시 자동으로 쌓입니다)</p>}
      {rows.map((r) => (
        <div key={r.id} style={S.card} onClick={() => setOpen(open === r.id ? null : r.id)}>
          <div><span style={S.tag(r.kind)}>[{KIND_LABEL[r.kind] || r.kind}]</span>
            <span style={S.title}>{r.title_ko || r.title}</span></div>
          <div style={S.meta}>{r.pub_date ? r.pub_date.slice(0, 10) : "-"} · {r.source}
            {r.link && <> · <a href={r.link} target="_blank" rel="noreferrer" style={{ color: "#147b8c" }} onClick={(e) => e.stopPropagation()}>원문 ▶</a></>}</div>
          {open === r.id && (
            <div style={S.preview}>{r.summary ? `■ 요약: ${r.summary}\n\n` : ""}{r.preview || "(본문 없음 — 원문 링크 참조)"}…</div>
          )}
        </div>
      ))}
    </main>
  );
}
