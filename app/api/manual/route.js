import { upsertObservations, deleteObservations } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

// body: { rows: [{date, indicator, value}] }  (value=null/'' 이면 해당 셀 삭제)
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body.rows || [];
    const toUpsert = [];
    const toDelete = [];
    for (const r of input) {
      if (r.value == null || r.value === "") toDelete.push({ date: r.date, indicator: r.indicator });
      else toUpsert.push({ date: r.date, indicator: r.indicator, value: Number(r.value), source: "manual" });
    }
    const upserted = await upsertObservations(toUpsert);
    const deleted = await deleteObservations(toDelete);
    return Response.json({ ok: true, upserted, deleted });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// body: { rows: [{date, indicator}] } — 행 삭제
export async function DELETE(req) {
  try {
    const body = await req.json();
    const n = await deleteObservations(body.rows || []);
    return Response.json({ ok: true, deleted: n });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
