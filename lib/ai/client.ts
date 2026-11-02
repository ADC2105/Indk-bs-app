import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type CallClaudeToolArgs<T> = {
  supabase: SupabaseClient;
  purpose: string;
  model: string;
  system: string;
  userMessage: string | Anthropic.MessageParam["content"];
  toolName: string;
  toolDescription: string;
  inputSchema: Anthropic.Tool.InputSchema;
  zodSchema: ZodType<T>;
  maxTokens?: number;
  /** Millisekunder pr. forsøg. Standard 20s, passende til små/hurtige kald. */
  timeoutMs?: number;
  /**
   * Antal forsøg i alt. Standard 2 (prøv igen én gang ved fejl, jf.
   * SPEC.md). For langsomme kald (store svar, fx hele madplaner) SKAL dette
   * være 1: 2 × et langt timeoutMs kan nemt overstige Vercels 60s-grænse
   * for serverfunktioner, og funktionen bliver så slået ihjel af
   * platformen midt i andet forsøg, uden at nogen fejl når at blive vist.
   */
  maxAttempts?: number;
};

/**
 * Kalder Claude med tool use, så svaret altid er struktureret JSON.
 * Validerer med zod og prøver igen ved fejl, jf. SPEC.md - men kun hvis der
 * reelt er tid til et nyt forsøg inden for Vercels tidsgrænse (se
 * maxAttempts).
 */
export async function callClaudeTool<T>(args: CallClaudeToolArgs<T>): Promise<T> {
  const timeoutMs = args.timeoutMs ?? 20_000;
  const maxAttempts = args.maxAttempts ?? 2;

  const attempt = async () => {
    const response = await anthropic.messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens ?? 4096,
        system: args.system,
        messages: [{ role: "user", content: args.userMessage }],
        tools: [
          {
            name: args.toolName,
            description: args.toolDescription,
            input_schema: args.inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: args.toolName },
      },
      // Fejl hurtigt i stedet for at hænge - SDK'ens standard-timeout (10
      // min.) er langt over Vercels tidsgrænse for serverfunktioner.
      { timeout: timeoutMs },
    );

    await args.supabase.from("ai_calls").insert({
      purpose: args.purpose,
      model: args.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Svaret fra Claude blev afskåret (nåede max_tokens) - prøv en mindre portion ad gangen");
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("Claude returnerede intet værktøjskald");
    }
    return args.zodSchema.parse(toolUse.input);
  };

  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
