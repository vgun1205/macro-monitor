// MI 아카이브 검색 API — /api/archive?q=경과조치&from=2026-01-01&to=&source=&region=&limit=50
import { searchArticles } from "../../../lib/archive.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    const rows = await searchArticles({
      q: p.get("q") || undefined,
      from: p.get("from") || undefined,
      to: p.get("to") || undefined,
      source: p.get("source") || undefined,
      region: p.get("region") || undefined,
      limit: p.get("limit") || 50,
    });
    return Response.json({ ok: true, count: rows.length, rows });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
