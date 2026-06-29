// 영문 → 한글 번역 (Claude Haiku 4.5). 짧은 보험·자본·위험관리 뉴스 제목용.
// ANTHROPIC_API_KEY 없으면 원문 그대로 반환(기능 degrade, 에러 없음).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.TRANSLATE_MODEL || "claude-haiku-4-5";

// items: [{title, ...}] → title_ko 추가. 한 번의 호출로 일괄 번역(비용·속도 절감).
export async function translateTitles(items) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !items?.length) return items;
  try {
    const client = new Anthropic({ apiKey: key });
    const list = items.map((n, i) => `${i + 1}. ${n.title}`).join("\n");
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: "너는 보험·금융 전문 번역가다. 영문 뉴스 제목을 자연스러운 한국어로 번역한다. 보험·자본 전문용어(Solvency II=지급여력Ⅱ, ICS=보험자본기준, IFRS 17, reinsurance=재보험, capital adequacy=자본적정성, solvency ratio=지급여력비율 등)는 정확히 옮긴다. 번역문만, 입력과 동일한 번호 순서로, 한 줄에 하나씩 출력한다. 설명·원문 병기 금지.",
      messages: [{ role: "user", content: `다음 제목들을 한국어로 번역:\n${list}` }],
    });
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const lines = text.split("\n").map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    items.forEach((n, i) => { n.title_ko = lines[i] || n.title; });
  } catch (e) {
    console.error("[translate] 실패:", e.message); // 실패 시 원문 유지
  }
  return items;
}
