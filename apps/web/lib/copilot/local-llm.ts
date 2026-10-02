import { searchKnowledge } from "./knowledge";

/**
 * Optional bridge to a model running on the user's own machine through an OpenAI-compatible API
 * (Ollama, LM Studio, llama.cpp server). The model can call TEMT tools; each call is turned into an
 * instruction for the built-in agent so calculations always come from the TEMT engine, never the model.
 */
export interface LocalModelConfig {
  endpoint: string;
  model: string;
}

const TOOLS = [
  { type: "function", function: { name: "calculate_shipment", description: "Calculate freight emissions for one shipment.", parameters: { type: "object", properties: { origin: { type: "string" }, destination: { type: "string" }, tonnes: { type: "number" }, mode: { type: "string", enum: ["road", "rail", "air", "sea", "courier"] }, truck: { type: "string", description: "Optional truck description such as 32 ft or 20 ft" }, save: { type: "boolean" } }, required: ["origin", "destination", "tonnes"] } } },
  { type: "function", function: { name: "compare_modes", description: "Compare road, rail, air and coastal options door to door.", parameters: { type: "object", properties: { origin: { type: "string" }, destination: { type: "string" }, tonnes: { type: "number" } }, required: ["origin", "destination"] } } },
  { type: "function", function: { name: "summarise_footprint", description: "Summarise the user's saved shipments for a financial year.", parameters: { type: "object", properties: { fiscal_year: { type: "string", description: "For example FY 2025-26" } } } } },
  { type: "function", function: { name: "find_reductions", description: "Find reduction opportunities in the user's shipments.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "what_if", description: "Run a what-if scenario.", parameters: { type: "object", properties: { lever: { type: "string", enum: ["rail", "air-to-road", "electric", "load-factor", "consolidate"] }, percent: { type: "number" } }, required: ["lever"] } } },
  { type: "function", function: { name: "export_report", description: "Download a report.", parameters: { type: "object", properties: { format: { type: "string", enum: ["pdf", "xlsx", "docx", "csv", "json", "powerbi"] } }, required: ["format"] } } },
  { type: "function", function: { name: "open_page", description: "Open a page of the TEMT app.", parameters: { type: "object", properties: { page: { type: "string", enum: ["overview", "calculate", "compare", "chain", "import", "shipments", "reports", "planner", "factors", "settings", "help"] } }, required: ["page"] } } },
];

function toInstruction(name: string, args: Record<string, unknown>): string {
  const s = (key: string) => String(args[key] ?? "").trim();
  switch (name) {
    case "calculate_shipment": return `${args.save ? "add" : "calculate"} ${args.tonnes ?? ""} t from ${s("origin")} to ${s("destination")}${args.mode ? ` by ${s("mode")}` : ""}${args.truck ? ` ${s("truck")} truck` : ""}`;
    case "compare_modes": return `compare ${args.tonnes ?? 10} t from ${s("origin")} to ${s("destination")}`;
    case "summarise_footprint": return `summarise my footprint ${s("fiscal_year")}`;
    case "find_reductions": return "where can I reduce emissions";
    case "what_if": return `what if we ${({ rail: "shift", "air-to-road": "move air", electric: "switch to electric", "load-factor": "improve load", consolidate: "consolidate" } as Record<string, string>)[s("lever")] ?? "shift"} ${args.percent ?? 30}%${s("lever") === "rail" ? " of road to rail" : ""}`;
    case "export_report": return `export ${s("format")} report`;
    case "open_page": return `open ${s("page")}`;
    default: return "";
  }
}

export async function askLocalModel(config: LocalModelConfig, message: string, history: { role: "user" | "assistant"; content: string }[], context: string): Promise<{ content?: string; instruction?: string }> {
  const knowledge = searchKnowledge(message, 3).map((hit) => `## ${hit.article.title}\n${hit.article.body}`).join("\n\n");
  const system = `You are the TEMT Copilot inside the Transportation Emission Measurement Tool built by the TCI–IIMB Supply Chain Sustainability Lab at IIM Bangalore. Help Indian enterprise users measure, report and reduce freight emissions. Use a tool whenever the user asks to calculate, compare, summarise, export or navigate; never invent emission numbers yourself. Answer concept questions briefly and only from the reference notes. Use Indian English and CO₂e units.\n\nWorkspace: ${context}\n\nReference notes:\n${knowledge}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${config.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, temperature: 0.2, tools: TOOLS, messages: [{ role: "system", content: system }, ...history.slice(-6), { role: "user", content: message }] }),
    });
    if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}`);
    const data = await response.json() as { choices?: { message?: { content?: string; tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
    const choice = data.choices?.[0]?.message;
    const call = choice?.tool_calls?.[0];
    if (call) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* use defaults */ }
      const instruction = toInstruction(call.function.name, args);
      if (instruction) return { instruction };
    }
    return { content: choice?.content?.trim() || undefined };
  } finally {
    clearTimeout(timer);
  }
}

export async function testLocalModel(config: LocalModelConfig): Promise<string> {
  const response = await fetch(`${config.endpoint.replace(/\/$/, "")}/models`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as { data?: { id: string }[] };
  return (data.data ?? []).map((item) => item.id).join(", ") || "connected";
}
