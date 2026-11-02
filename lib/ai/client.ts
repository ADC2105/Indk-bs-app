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
};

/**
 * Kalder Claude med tool use, så svaret altid er struktureret JSON.
 * Validerer med zod og prøver én gang mere ved fejl (API-fejl, manglende
 * værktøjskald eller valideringsfejl), som krævet i SPEC.md.
 */
export async function callClaudeTool<T>(args: CallClaudeToolArgs<T>): Promise<T> {
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
      { timeout: 45_000 },
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

  try {
    return await attempt();
  } catch {
    return await attempt();
  }
}
