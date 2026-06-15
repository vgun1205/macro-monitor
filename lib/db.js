import pg from "pg";
const { Pool } = pg;

// 서버리스 환경에서 커넥션 재사용
let _pool;
export function pool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 3,
    });
  }
  return _pool;
}

// 관측치 일괄 upsert: rows = [{date, indicator, value, source}]
// 멀티행 INSERT로 청크 단위 처리(백필 수천 행도 빠르게). 한 트랜잭션으로 묶음.
const CHUNK = 1000; // 행당 파라미터 4개 → 4000 < Postgres 65535 한계
export async function upsertObservations(rows) {
  const valid = rows.filter((r) => r.value != null && !isNaN(r.value));
  if (!valid.length) return 0;
  const p = pool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const batch = valid.slice(i, i + CHUNK);
      const params = [];
      const tuples = batch.map((r, j) => {
        const b = j * 4;
        params.push(r.date, r.indicator, r.value, r.source || "auto");
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, now())`;
      });
      await client.query(
        `INSERT INTO observations (obs_date, indicator, value, source, updated_at)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (obs_date, indicator)
         DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now()`,
        params
      );
      n += batch.length;
    }
    await client.query("COMMIT");
    return n;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// 관측치 삭제: rows = [{date, indicator}]
export async function deleteObservations(rows) {
  if (!rows.length) return 0;
  const p = pool();
  const client = await p.connect();
  try {
    let n = 0;
    for (const r of rows) {
      if (!r.date || !r.indicator) continue;
      const res = await client.query(
        `DELETE FROM observations WHERE obs_date = $1 AND indicator = $2`,
        [r.date, r.indicator]
      );
      n += res.rowCount || 0;
    }
    return n;
  } finally {
    client.release();
  }
}

// 전체 시계열 조회 → [{obs_date:'YYYY-MM-DD', indicator, value}]
export async function getAllObservations() {
  const p = pool();
  const { rows } = await p.query(
    `SELECT to_char(obs_date,'YYYY-MM-DD') AS obs_date, indicator, value
     FROM observations ORDER BY obs_date ASC`
  );
  return rows;
}
