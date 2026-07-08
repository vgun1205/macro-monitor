// 주간 AI 브리핑 — 아카이브의 최근 N일 기사를 Claude가 읽고 팀 관점 핵심 이슈·유의사항을 도출.
// RAG의 축소판(retrieval=최근기간, generation=Claude). ANTHROPIC_API_KEY 없으면 skip.
import Anthropic from "@anthropic-ai/sdk";
import { pool, getConfig, setConfig } from "./db.js";

const MODEL = process.env.TRANSLATE_MODEL || "claude-haiku-4-5";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 최근 days일 아카이브 기사 목록
async function recentArticles(days) {
  const { rows } = await pool().query(
    `SELECT kind, source, coalesce(title_ko,title) AS title, summary
     FROM mi_articles WHERE pub_date >= (CURRENT_DATE - ($1||' days')::interval)
     ORDER BY pub_date DESC NULLS LAST, id DESC LIMIT 80`,
    [String(days)]
  );
  return rows;
}

// { html, from, to, count } 반환. 실패/무자료 시 html="".
export async function generateBriefing({ days = 7 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  const to = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const from = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400000).toISOString().slice(0, 10);
  const rows = await recentArticles(days);
  if (!key || rows.length < 3) return { html: "", from, to, count: rows.length };
  const list = rows.map((r, i) => `${i + 1}. (${r.kind}/${r.source}) ${r.title}${r.summary ? " — " + String(r.summary).replace(/\s+/g, " ").slice(0, 90) : ""}`).join("\n");
  let text = "";
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: [
        "너는 손해보험사 위험관리(RM)팀의 시장정보(MI) 애널리스트다.",
        "팀 업무범위: 위험관리 전반 · 지급여력비율(K-ICS)·자본관리 · BCM(업무연속성) · 제3자(위탁·외주) 리스크.",
        "주어진 최근 기사 목록을 근거로, 팀이 알아야 할 핵심 이슈와 유의사항을 도출한다.",
        "규칙: 목록에 있는 사실만 사용(추측·창작 금지). 팀 업무와 무관한 단순 인사/판매 기사는 제외.",
        "출력 형식(정확히 이 형식, 그 외 머리말·설명 금지):",
        "THEME| 소제목(15자내) ::: 2~3문장 분석(무슨 일인지 + 팀에 주는 시사점)",
        "THEME| ... (3~5개)",
        "WATCH| 한 줄 유의/주목 사항 (1~3개)",
      ].join("\n"),
      messages: [{ role: "user", content: `기간: ${from} ~ ${to}\n최근 기사 목록:\n${list}` }],
    });
    text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (e) {
    console.error("[briefing] 실패:", e.message);
    return { html: "", from, to, count: rows.length };
  }
  // 파싱 → HTML
  const themes = [], watches = [];
  for (const ln of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    let m = ln.match(/^THEME\s*\|\s*(.+?)\s*:::\s*(.+)$/i);
    if (m) { themes.push({ t: m[1].trim(), b: m[2].trim() }); continue; }
    m = ln.match(/^WATCH\s*\|\s*(.+)$/i);
    if (m) watches.push(m[1].trim());
  }
  if (!themes.length && !watches.length) return { inner: "", from, to, count: rows.length, raw: text.slice(0, 600) };
  // 인라인 스타일(이메일 본문·아카이브 양쪽에서 동작). 외곽 카드·헤더는 사용처가 구성.
  const tHtml = themes.map((x, i) =>
    `<div style="margin:11px 0"><div style="font-size:16px;font-weight:700;color:#0b1622">${i + 1}. ${esc(x.t)}</div><div style="font-size:14px;color:#334155;line-height:1.8;margin-top:2px">${esc(x.b)}</div></div>`
  ).join("");
  const wHtml = watches.length
    ? `<div style="margin-top:13px;padding-top:11px;border-top:1px dashed #e2e8f0"><div style="font-size:13.5px;font-weight:700;color:#b45309;margin-bottom:4px">⚠ 주목·유의</div>${watches.map((w) => `<div style="font-size:14px;color:#475569;line-height:1.7">· ${esc(w)}</div>`).join("")}</div>`
    : "";
  const inner = `${tHtml}${wHtml}<div style="font-size:11.5px;color:#94a3b8;margin-top:13px">* AI(Claude)가 아카이브 기사(${rows.length}건)를 근거로 자동 생성 · 참고용</div>`;
  return { inner, from, to, count: rows.length };
}

// ISO 주차 키(예: 2026-W28) — KST 기준
function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7)); // 목요일
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const no = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(no).padStart(2, "0")}`;
}

const curWeek = () => isoWeekKey(new Date(Date.now() + 9 * 3600 * 1000));

let briefTableReady = false;
async function ensureBriefTable() {
  if (briefTableReady) return;
  await pool().query(`CREATE TABLE IF NOT EXISTS weekly_briefings (
    week TEXT PRIMARY KEY, from_date TEXT, to_date TEXT, body_html TEXT, count INT, created_at TIMESTAMPTZ DEFAULT now()
  );`);
  briefTableReady = true;
}

// 발송 경로에서 호출(빠름): 최근 n주 브리핑 히스토리를 최신순으로 반환.
export async function getRecentBriefings(n = 4) {
  await ensureBriefTable();
  const { rows } = await pool().query(
    `SELECT week, from_date, to_date, body_html FROM weekly_briefings WHERE body_html <> '' ORDER BY week DESC LIMIT $1`, [n]
  );
  return rows.map((r) => ({ week: r.week, from: r.from_date, to: r.to_date, inner: r.body_html }));
}
// 이번 주 브리핑이 아직 없으면 true(갱신 필요)
export async function isBriefingStale() {
  return (await getConfig("weekly_briefing_week")) !== curWeek();
}
// 무거운 생성(Claude) — 응답 후 after()에서 호출. 이번 주 브리핑을 만들어 히스토리에 저장.
export async function refreshWeeklyBriefing() {
  await ensureBriefTable();
  const wk = curWeek();
  const br = await generateBriefing({ days: 7 });
  if (br.inner) {
    await pool().query(
      `INSERT INTO weekly_briefings (week, from_date, to_date, body_html, count) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (week) DO UPDATE SET from_date=EXCLUDED.from_date, to_date=EXCLUDED.to_date, body_html=EXCLUDED.body_html, count=EXCLUDED.count, created_at=now()`,
      [wk, br.from, br.to, br.inner, br.count]
    );
    await setConfig("weekly_briefing_week", wk);
  }
  return { week: wk, count: br.count, ok: !!br.inner };
}
