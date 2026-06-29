// 영문 → 한글 번역·요약 (Claude Haiku 4.5). 보험·자본·위험관리 뉴스용.
// ANTHROPIC_API_KEY 없으면 원문 그대로(기능 degrade, 에러 없음).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.TRANSLATE_MODEL || "claude-haiku-4-5";

// 글로벌 기사: 제목 번역 + 본문 기반 한 문장 요약을 한 번의 호출로 일괄 처리.
// 각 item에 title_ko, summary_ko 추가.
export async function translateGlobal(items) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !items?.length) return items;
  try {
    const client = new Anthropic({ apiKey: key });
    const blocks = items.map((n, i) =>
      `[${i + 1}] TITLE: ${n.title}\nBODY: ${((n.text || "").slice(0, 800).replace(/\s+/g, " ")) || "(본문 없음 — 제목만으로 요약)"}`
    ).join("\n\n");
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: "너는 보험·금융 전문 번역가다. 각 기사에 대해 (1) 제목을 자연스러운 한국어로 번역하고, (2) 본문(또는 제목)을 근거로 한국어 한 문장 요약을 작성한다. 보험·자본 전문용어(Solvency II=지급여력Ⅱ, ICS=보험자본기준, IFRS 17, reinsurance=재보험, capital adequacy=자본적정성, solvency ratio=지급여력비율 등)는 정확히 옮긴다. 출력은 각 기사마다 정확히 한 줄: `번호| 한글제목 ::: 한문장요약`. 그 외 설명·머리말 금지.",
      messages: [{ role: "user", content: `다음 기사들을 처리:\n\n${blocks}` }],
    });
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    for (const ln of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const m = ln.match(/^\[?(\d+)\]?\s*[|.)]?\s*(.+?)\s*:::\s*(.+)$/);
      if (m) {
        const i = Number(m[1]) - 1;
        if (items[i]) { items[i].title_ko = m[2].trim(); items[i].summary_ko = m[3].trim(); }
      }
    }
  } catch (e) {
    console.error("[translate] 실패:", e.message); // 실패 시 원문 유지
  }
  return items;
}
