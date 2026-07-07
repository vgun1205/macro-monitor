// MI 아카이브 — 매일 수집·발송하는 기사를 영구 저장(과거 이슈 검색·재활용용).
// 테이블은 첫 사용 시 자동 생성. 중복은 (source, title) 기준 무시.
import { pool } from "./db.js";

let ready = false;
async function ensureTable() {
  if (ready) return;
  await pool().query(`
    CREATE TABLE IF NOT EXISTS mi_articles (
      id BIGSERIAL PRIMARY KEY,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      pub_date DATE,
      region TEXT NOT NULL,          -- domestic | global
      kind TEXT,                     -- fss_report | knia_report | knia_notice | news | global
      source TEXT,
      title TEXT NOT NULL,
      title_ko TEXT,
      summary TEXT,
      body TEXT,
      body_ko TEXT,
      link TEXT,
      UNIQUE (source, title)
    );
    CREATE INDEX IF NOT EXISTS idx_mi_articles_pub ON mi_articles (pub_date DESC);
  `);
  ready = true;
}

const toDate = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : null);

// items(국내)·global(해외)을 저장. 실패해도 발송에 영향 없도록 호출부에서 try/catch.
export async function saveArticles(items = [], global = []) {
  await ensureTable();
  const rows = [
    ...items.map((n) => ({
      pub_date: toDate(n.ts), region: "domestic", kind: n.kind || "news", source: n.source || "-",
      title: n.title, title_ko: null, summary: n.snippet || null, body: n.text || null, body_ko: null, link: n.link || null,
    })),
    ...global.map((n) => ({
      pub_date: toDate(n.ts), region: "global", kind: "global", source: n.source || "-",
      title: n.title, title_ko: n.title_ko || null, summary: n.summary_ko || n.snippet || null,
      body: n.text || null, body_ko: n.text_ko || null, link: n.link || null,
    })),
  ].filter((r) => r.title);
  if (!rows.length) return 0;
  const p = pool();
  let saved = 0;
  for (const r of rows) {
    const res = await p.query(
      `INSERT INTO mi_articles (pub_date, region, kind, source, title, title_ko, summary, body, body_ko, link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (source, title) DO NOTHING`,
      [r.pub_date, r.region, r.kind, r.source, r.title, r.title_ko, r.summary, r.body, r.body_ko, r.link]
    );
    saved += res.rowCount;
  }
  return saved;
}

// 아카이브 검색: q(키워드), from/to(YYYY-MM-DD), source, region, limit
export async function searchArticles({ q, from, to, source, region, limit = 50 } = {}) {
  await ensureTable();
  const conds = [], params = [];
  if (q) { params.push(`%${q}%`); const i = params.length; conds.push(`(title ILIKE $${i} OR title_ko ILIKE $${i} OR summary ILIKE $${i} OR body ILIKE $${i} OR body_ko ILIKE $${i})`); }
  if (from) { params.push(from); conds.push(`pub_date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`pub_date <= $${params.length}`); }
  if (source) { params.push(`%${source}%`); conds.push(`source ILIKE $${params.length}`); }
  if (region) { params.push(region); conds.push(`region = $${params.length}`); }
  params.push(Math.min(Number(limit) || 50, 200));
  const sql = `SELECT id, pub_date, region, kind, source, title, title_ko, summary, link,
                      left(coalesce(body_ko, body, ''), 400) AS preview
               FROM mi_articles ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
               ORDER BY pub_date DESC NULLS LAST, id DESC LIMIT $${params.length}`;
  const { rows } = await pool().query(sql, params);
  return rows;
}
