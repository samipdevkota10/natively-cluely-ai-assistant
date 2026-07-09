import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_FACT_CHECK_PROMPT } from "./prompts";

/**
 * Fact Check action (F5, Cluely parity). Verifies the most recent checkable
 * factual claim in the conversation: Accurate / Inaccurate / Unverifiable plus
 * a one-line correction or context. The prompt mandates uncertainty language —
 * the model has no live internet access, so it must never assert corrections
 * with false confidence. Same shape as RecapLLM: context in, stream out.
 */
export class FactCheckLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(context: string): Promise<string> {
        if (!context.trim()) return "";
        try {
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            const stream = this.llmHelper.streamChat(fittedContext, undefined, undefined, UNIVERSAL_FACT_CHECK_PROMPT);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return fullResponse.trim();
        } catch (error) {
            console.error("[FactCheckLLM] Generation failed:", error);
            return "";
        }
    }

    async *generateStream(context: string): AsyncGenerator<string> {
        if (!context.trim()) return;
        try {
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            yield* this.llmHelper.streamChat(fittedContext, undefined, undefined, UNIVERSAL_FACT_CHECK_PROMPT);
        } catch (error) {
            console.error("[FactCheckLLM] Streaming generation failed:", error);
        }
    }
}
