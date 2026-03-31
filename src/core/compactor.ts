import { ChatMessage, ModelProvider } from "./providers.ts";

export class HistoryCompactor {
  private provider: ModelProvider;

  constructor(provider: ModelProvider) {
    this.provider = provider;
  }

  /**
   * Compacts the history to fit within a target token limit (e.g. 25% of max).
   * Prioritizes preserving User prompts and System instructions.
   * Aggressively summarizes Assistant and Tool outputs.
   */
  async compact(messages: ChatMessage[], targetTokens: number): Promise<ChatMessage[]> {
    const currentTokens = this.provider.estimateTokenCount(messages);
    if (currentTokens <= targetTokens) {
      return messages;
    }

    console.log(`[Compactor] History too large (${currentTokens} tokens). Compacting to target ${targetTokens}...`);

    // 1. Separate the history
    const systemPrompts = messages.filter(m => m.role === "system");
    const conversation = messages.filter(m => m.role !== "system");

    // Always preserve the last 5 messages for immediate context "tail"
    const tailCount = 5;
    const tail = conversation.slice(-tailCount);
    const body = conversation.slice(0, -tailCount);

    if (body.length === 0) {
      return messages; // Tail is all we have
    }

    // 2. Formulate compaction prompt
    const compactionInstruction = `You are a Tactical Memory Compactor. 
Your goal is to shrink the following conversation history to fit within a tight context window.
RULES:
1. PRESERVE USER PROMPTS: Keep user intent as close to original as possible.
2. SUMMARIZE ASSISTANT/TOOL OUTPUTS: Aggressively shorten technical outputs, logs, or long explanations into "Tactical Outcomes" (e.g. "Agent ran CLI check: SUCCESS").
3. MAINTAIN CONTINUITY: Ensure the high-level mission progress is clear.
4. FORMAT: Return each original exchange as a single line summary starting with 'USER:' or 'AGENT:'.
5. PERSISTENCE: If a tool was used, mention the outcome briefly.

HISTORY TO COMPACT:
${body.map(m => `${m.role.toUpperCase()}: ${m.content?.slice(0, 1000)}`).join("\n")}
`;

    try {
      const response = await this.provider.chat([
        { role: "system", content: "You are a specialized history summarizer." },
        { role: "user", content: compactionInstruction }
      ]);

      const summary = response?.choices?.[0]?.message?.content || "Previous conversation summarized.";

      // 3. Reconstruct history
      const compactedMessage: ChatMessage = {
        role: "system",
        content: `[CONTEXT COMPACTED] Summary of earlier mission steps:\n${summary}\n[End of Summary]`
      };

      return [...systemPrompts, compactedMessage, ...tail];
    } catch (e) {
      console.warn("[Compactor] Failed to compact history, falling back to simple slice:", e);
      return [...systemPrompts, ...messages.slice(-10)];
    }
  }
}
