import { getAllObservations } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getAllObservations();
    return Response.json({ ok: true, rows });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
