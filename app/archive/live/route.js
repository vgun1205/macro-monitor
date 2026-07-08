// 모바일/웹용 — 매 접속 시 최신 아카이브 HTML(브리핑+검색)을 서버 렌더링해 반환.
// 즐겨찾기하면 항상 최신. 첨부 HTML과 동일한 화면.
import { exportArticles } from "../../../lib/archive.js";
import { buildArchiveHtml } from "../../../lib/archivehtml.js";
import { getRecentBriefings } from "../../../lib/briefing.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const genDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const rows = await exportArticles({ months: 120 });
    let briefings = [];
    try { briefings = await getRecentBriefings(4); } catch {}
    const html = buildArchiveHtml(rows, { generatedAt: genDate, briefings });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return new Response("archive error: " + e.message, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
