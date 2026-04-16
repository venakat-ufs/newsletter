import { getSettings } from "@/server/env";
import { appendWorkflowLog } from "@/server/logs";
import { SECTION_PROMPTS } from "@/server/prompts";

function loadPrompt(sectionType: string): string {
  const prompt = SECTION_PROMPTS[sectionType];
  if (!prompt) {
    throw new Error(`Unknown section type: ${sectionType}`);
  }
  return prompt;
}

async function draftSection(sectionType: string, sectionData: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = getSettings();
  const promptTemplate = loadPrompt(sectionType);
  let dataString = JSON.stringify(sectionData.data ?? [], null, 2);

  if (dataString.length > 15000) {
    dataString = `${dataString.slice(0, 15000)}\n... (truncated)`;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a professional newsletter writer for the REO real estate industry. You write accurate, concise, data-forward content based ONLY on the data provided. Never invent facts or statistics. Prefer short, direct sentences over long narrative. Always return valid JSON.",
        },
        {
          role: "user",
          content: promptTemplate.replace("{data}", dataString),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { ...parsed, section_type: sectionType };
  } catch {
    return {
      section_type: sectionType,
      title: `[Draft Error] ${sectionType}`,
      teaser: "Content generation encountered an issue. Please review manually.",
      body: content,
    };
  }
}

export async function generateAiDraft(rawData: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = getSettings();
  if (!settings.openaiApiKey) {
    await appendWorkflowLog({
      scope: "drafting",
      step: "openai",
      status: "warning",
      message: "AI draft generation skipped because OPENAI_API_KEY is missing.",
    });

    return {
      error: "OPENAI_API_KEY not configured",
      sections: [],
    };
  }

  const sectionsData =
    (rawData.sections as Record<string, Record<string, unknown>> | undefined) ?? {};
  const draftedSections: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  await appendWorkflowLog({
    scope: "drafting",
    step: "openai",
    status: "info",
    message: "Starting AI section generation.",
    context: {
      section_count: Object.keys(SECTION_PROMPTS).length,
    },
  });

  for (const sectionType of Object.keys(SECTION_PROMPTS)) {
    try {
      draftedSections.push(
        await draftSection(sectionType, sectionsData[sectionType] ?? { data: [] }),
      );

      await appendWorkflowLog({
        scope: "drafting",
        step: sectionType,
        status: "success",
        message: `Generated AI copy for ${sectionType.replaceAll("_", " ")}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push(`${sectionType}: ${message}`);

      await appendWorkflowLog({
        scope: "drafting",
        step: sectionType,
        status: "error",
        message: `Failed to generate AI copy for ${sectionType.replaceAll("_", " ")}.`,
        context: {
          error: message,
        },
      });

      draftedSections.push({
        section_type: sectionType,
        title: `[Error] ${sectionType}`,
        teaser: "Failed to generate this section.",
        body: `Error: ${message}`,
      });
    }
  }

  await appendWorkflowLog({
    scope: "drafting",
    step: "openai",
    status: errors.length > 0 ? "warning" : "success",
    message:
      errors.length > 0
        ? `AI generation completed with ${errors.length} section errors.`
        : "AI generation completed successfully.",
    context: {
      generated_sections: draftedSections.length,
      error_count: errors.length,
    },
  });

  return {
    sections: draftedSections,
    errors,
    generated_at: new Date().toISOString(),
  };
}
