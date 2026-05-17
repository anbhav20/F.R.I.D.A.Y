import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { readFileSync } from "fs";

let creatorInfo = "";
try {
  creatorInfo = readFileSync("./creator.txt", "utf-8").trim();
  console.log("[AI] ✅ creator.txt loaded");
} catch (err) {
  console.warn("[AI] creator.txt not found:", err.message);
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are F.R.I.D.A.Y, an elite AI by Anbhav. Smart, cited, conversational.

IDENTITY: Made by Anbhav (real name Abhishek). Never claim to be ChatGPT/Claude/Gemini.

CREATOR INFO:
${creatorInfo}
When asked about creator, use ONLY above info. Never search or guess.

CONTEXT USE: Study conversation history — reference earlier topics, detect user type (dev/student/etc), connect related questions. Never repeat already-given info.

RESPONSES:
- Cite every fact as markdown links: *[Wikipedia](https://wikipedia.org)*, *[NDTV](https://ndtv.com)* — use actual source URLs.
- Casual Hinglish + emojis when fitting 😄
- Match user's language and energy
- Add 1 bonus insight user didn't ask but would appreciate
- Casual query → concise | Technical → thorough with detail
- Never announce searching — do it silently
- Search queries always in English

FORMATTING (VERY IMPORTANT):
- Always break response into short paragraphs — max 2-3 sentences per paragraph
- Use bullet points or numbered lists for multiple items
- Never dump everything into one paragraph
- Add a blank line between every paragraph
- For long answers: use bold headers to separate sections

SEARCH: Max 3 times. After 1st result, check if complete — if not, search again differently.
SEARCH FOR: news, prices, scores, weather, current leaders, exam results, products
SKIP: coding, math, definitions, creative writing, casual chat, creator questions`;

const CLASSIFIER_PROMPT = `
Need realtime web/tools?

Reply JSON only:
{"needsTools":true/false,"complexity":"low|medium|high"}

true:
news,current,latest,weather,price,score,result,2025,2026,update,API,release,jobs,visa,scholarship,"kya hua","abhi"

false:
coding,math,writing,history,definitions,conversation

if unsure=true
`;

const TITLE_PROMPT = `5-word max chat title. Title Case. No quotes/punctuation. Specific, not generic. Reply ONLY the title.`;

const GAP_CHECK_PROMPT = `Search done. Answer complete with recent info? Missing anything important?
If incomplete → search again with a DIFFERENT specific query.
If complete → give final answer with *(Source Name)* citations. MAX 3 searches total.`;

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ══════════════════════════════════════════════════════════════════════════════
const Provider = {
  GPT_OSS:    "gpt_oss",    // Tool Calling + Agents  — openai/gpt-oss-120b
  NEMOTRON:   "nemotron",   // Main Conversational    — nvidia/nemotron-3-super-120b
  GLM:        "glm",        // Advanced Agent Backup  — z-ai/glm-4.5-air
  LLAMA_FREE: "llama_free", // General Fallback       — meta-llama/llama-3.3-70b-instruct
  GROQ:       "groq",       // Ultra Fast             — llama-3.3-70b on Groq
};

// Tool calling: gpt-oss first (best native tool support), then fallbacks
const TOOL_PROVIDER_ORDER  = [Provider.GPT_OSS, Provider.NEMOTRON, Provider.GLM, Provider.GROQ];

// Fast chat: Groq first (lowest latency), then free OpenRouter models
const FAST_PROVIDER_ORDER  = [Provider.GROQ, Provider.NEMOTRON, Provider.GLM, Provider.LLAMA_FREE];

const RETRY_AFTER_MINUTES = 2;

const providerState = {
  exhausted:  { gpt_oss: false, nemotron: false, glm: false, llama_free: false, groq: false },
  exhaustedAt:{ gpt_oss: null,  nemotron: null,  glm: null,  llama_free: null,  groq: null  },
};

const isExhausted = (p) => {
  if (!providerState.exhausted[p]) return false;
  const at = providerState.exhaustedAt[p];
  if (at && (Date.now() - at) / 60000 >= RETRY_AFTER_MINUTES) {
    providerState.exhausted[p] = false;
    providerState.exhaustedAt[p] = null;
    console.log(`[AI] ${p} cooldown ended — re-enabled.`);
    return false;
  }
  return true;
};

const markExhausted = (p) => {
  providerState.exhausted[p] = true;
  providerState.exhaustedAt[p] = Date.now();
  console.warn(`[AI] ${p} marked exhausted.`);
};

// ══════════════════════════════════════════════════════════════════════════════
// MODEL FACTORIES
// ══════════════════════════════════════════════════════════════════════════════

// Shared helper — all OpenRouter models use the same base config
const openRouterModel = (modelName) =>
  new ChatOpenAI({
    modelName,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.CLIENT_URL || "https://friday-ai.app",
        "X-Title": "F.R.I.D.A.Y",
      },
    },
    temperature: 0.7,
    maxTokens: 2048,
  });

const makeGptOss    = () => openRouterModel("openai/gpt-oss-120b:free");
const makeNemotron  = () => openRouterModel("nvidia/nemotron-3-super-120b-a12b:free");
const makeGlm       = () => openRouterModel("z-ai/glm-4.5-air:free");
const makeLlamaFree = () => openRouterModel("meta-llama/llama-3.3-70b-instruct:free");

const makeGroq = () =>
  new ChatGroq({
    model: "llama-3.3-70b-versatile",
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.7,
    maxTokens: 2048,
  });

let classifierModel = null;
const getClassifier = () => {
  if (!classifierModel) {
    classifierModel = new ChatGroq({
      model: "llama-3.1-8b-instant",
      apiKey: process.env.GROQ_API_KEY,
      temperature: 0,
      maxTokens: 100,
    });
  }
  return classifierModel;
};

const makeModel = (provider) => {
  if (provider === Provider.GPT_OSS)    return makeGptOss();
  if (provider === Provider.NEMOTRON)   return makeNemotron();
  if (provider === Provider.GLM)        return makeGlm();
  if (provider === Provider.LLAMA_FREE) return makeLlamaFree();
  if (provider === Provider.GROQ)       return makeGroq();
};

// ══════════════════════════════════════════════════════════════════════════════
// QUERY CLASSIFIER
// ══════════════════════════════════════════════════════════════════════════════
const classifyQuery = async (userMessage) => {
  try {
    const res = await getClassifier().invoke([
      new SystemMessage(CLASSIFIER_PROMPT),
      new HumanMessage(`Query: "${userMessage}"`),
    ]);
    const text = res.content?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log(`[Router] needsTools=${parsed.needsTools} | complexity=${parsed.complexity} | ${parsed.reason}`);
    return {
      needsTools: Boolean(parsed.needsTools),
      complexity: parsed.complexity || "medium",
      reason: parsed.reason || "",
    };
  } catch (err) {
    console.warn("[Router] Classifier failed, defaulting safe:", err.message);
    return { needsTools: true, complexity: "medium", reason: "classifier error" };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH — Tavily primary, Serper fallback
// ══════════════════════════════════════════════════════════════════════════════
const SearchProvider = { TAVILY: "tavily", SERPER: "serper" };
const SEARCH_RETRY_MINUTES = 60;

const searchState = {
  current: SearchProvider.TAVILY,
  exhausted: { tavily: false, serper: false },
  exhaustedAt: { tavily: null, serper: null },
};

const isSearchExhausted = (sp) => {
  if (!searchState.exhausted[sp]) return false;
  const at = searchState.exhaustedAt[sp];
  if (at && (Date.now() - at) / 60000 >= SEARCH_RETRY_MINUTES) {
    searchState.exhausted[sp] = false;
    searchState.exhaustedAt[sp] = null;
    console.log(`[Search] ${sp} cooldown ended.`);
    return false;
  }
  return true;
};

const markSearchExhausted = (sp) => {
  searchState.exhausted[sp] = true;
  searchState.exhaustedAt[sp] = Date.now();
  searchState.current =
    sp === SearchProvider.TAVILY ? SearchProvider.SERPER : SearchProvider.TAVILY;
  console.warn(`[Search] ${sp} exhausted — switching.`);
};

const searchWithTavily = async (query) => {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });
  if (res.status === 429 || res.status === 402) {
    markSearchExhausted(SearchProvider.TAVILY);
    throw new Error("EXHAUSTED");
  }
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json();
  const parts = [];
  if (data.answer) parts.push(`DIRECT ANSWER: ${data.answer}`);
  data.results?.slice(0, 5).forEach((r, i) =>
    parts.push(`[${i + 1}] ${r.title}\n${r.content?.slice(0, 600)}\nSOURCE: ${r.url}`)
  );
  return parts.join("\n\n") || "No results found.";
};

const searchWithSerper = async (query) => {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (res.status === 429 || res.status === 402) {
    markSearchExhausted(SearchProvider.SERPER);
    throw new Error("EXHAUSTED");
  }
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = await res.json();
  const parts = [];
  if (data.answerBox)
    parts.push(`DIRECT ANSWER: ${data.answerBox.answer || data.answerBox.snippet}`);
  if (data.knowledgeGraph)
    parts.push(`KNOWLEDGE: ${data.knowledgeGraph.title} — ${data.knowledgeGraph.description || ""}`);
  data.organic?.slice(0, 5).forEach((r, i) =>
    parts.push(`[${i + 1}] ${r.title}\n${r.snippet}\nSOURCE: ${r.link}`)
  );
  return parts.join("\n\n") || "No results found.";
};

const smartSearch = async (query) => {
  const available = [SearchProvider.TAVILY, SearchProvider.SERPER].filter(
    (sp) => !isSearchExhausted(sp)
  );
  const order = available.includes(searchState.current)
    ? [searchState.current, ...available.filter((sp) => sp !== searchState.current)]
    : available;

  for (const sp of order) {
    try {
      const result =
        sp === SearchProvider.TAVILY
          ? await searchWithTavily(query)
          : await searchWithSerper(query);
      console.log(`[Search] ✅ ${sp} | "${query}"`);
      return result;
    } catch (err) {
      if (err.message !== "EXHAUSTED") console.error(`[Search] ${sp} error:`, err.message);
    }
  }
  return "Search unavailable — both providers exhausted.";
};

// ══════════════════════════════════════════════════════════════════════════════
// TOOLS
// ══════════════════════════════════════════════════════════════════════════════
const webSearchTool = tool(
  async ({ query }) => {
    try { return await smartSearch(query); }
    catch (err) { return `Search failed: ${err.message}`; }
  },
  {
    name: "web_search",
    description: "Search the internet for real-time information: news, prices, sports scores, exam results, current events, government, politics, people, products, recent updates. Call multiple times with different queries if first result is incomplete.",
    schema: z.object({
      query: z.string().describe("Search query in English only. Be specific."),
    }),
  }
);

const getWeatherTool = tool(
  async ({ location }) => {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return `${d.name}, ${d.sys.country}: ${d.weather[0].description}, Temp: ${d.main.temp}°C (feels like ${d.main.feels_like}°C), Humidity: ${d.main.humidity}%, Wind: ${d.wind.speed} m/s, Visibility: ${(d.visibility / 1000).toFixed(1)}km`;
    } catch (err) { return `Weather fetch failed: ${err.message}`; }
  },
  {
    name: "get_weather",
    description: "Get current real-time weather for any city or location worldwide.",
    schema: z.object({
      location: z.string().describe("City name e.g. Delhi, Mumbai, New York, London"),
    }),
  }
);

const calculateTool = tool(
  async ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().,% ]/g, "");
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch { return `Could not evaluate: "${expression}"`; }
  },
  {
    name: "calculate",
    description: "Evaluate math expressions accurately: percentages, conversions, formulas.",
    schema: z.object({
      expression: z.string().describe("Math expression e.g. '15% of 85000', '(120 * 3) / 7'"),
    }),
  }
);

const getDatetimeTool = tool(
  async ({ timezone }) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone || "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    }).format(new Date()),
  {
    name: "get_current_datetime",
    description: "Get the current date and time in any timezone.",
    schema: z.object({
      timezone: z
        .string()
        .nullable()
        .optional()
        .describe("IANA timezone string. Defaults to Asia/Kolkata (IST)."),
    }),
  }
);

const TOOLS = [webSearchTool, getWeatherTool, calculateTool, getDatetimeTool];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ══════════════════════════════════════════════════════════════════════════════
// AGENTIC LOOP
// ══════════════════════════════════════════════════════════════════════════════
const runAgenticLoop = async (lcMessages, modelWithTools) => {
  let response = await modelWithTools.invoke(lcMessages);
  let searchCount = 0;
  const MAX_SEARCHES = 3;

  while (response.tool_calls?.length) {
    const webSearchCalls = response.tool_calls.filter((tc) => tc.name === "web_search");
    searchCount += webSearchCalls.length;

    const toolResults = await Promise.all(
      response.tool_calls.map(async (tc) => {
        const handler = TOOL_MAP[tc.name];
        const result = handler ? await handler.invoke(tc.args) : `Tool "${tc.name}" not found.`;
        console.log(`[Tool] ${tc.name} | ${JSON.stringify(tc.args).slice(0, 100)}`);
        return new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      })
    );

    lcMessages.push(response, ...toolResults);

    if (webSearchCalls.length > 0 && searchCount === 1) {
      lcMessages.push(new SystemMessage(GAP_CHECK_PROMPT));
      console.log("[AI] Gap detection injected.");
    }

    if (searchCount >= MAX_SEARCHES) {
      lcMessages.push(
        new SystemMessage(
          "Max searches reached. NOW synthesize all results into a complete, cited final answer. Use *(Source Name)* for citations. Do NOT search again."
        )
      );
      console.log("[AI] Max searches — forcing final answer.");
    }

    response = await modelWithTools.invoke(lcMessages);
  }

  return response.content?.trim() || "I couldn't generate a response.";
};

// ══════════════════════════════════════════════════════════════════════════════
// GROQ TOOL-CALL FALLBACK
// ══════════════════════════════════════════════════════════════════════════════
const runGroqToolPath = async (lcMessages) => {
  const model = makeGroq();
  try {
    return await runAgenticLoop([...lcMessages], model.bindTools(TOOLS));
  } catch (err) {
    const isToolFailed =
      err?.error?.error?.code === "tool_use_failed" ||
      err?.message?.includes("tool_use_failed") ||
      err?.message?.includes("Failed to call a function") ||
      err?.status === 400;
    if (!isToolFailed) throw err;

    console.warn("[AI] Groq tool_use_failed — manual search fallback.");
    const lastUser = [...lcMessages].reverse().find((m) => m._getType?.() === "human");
    const query = typeof lastUser?.content === "string" ? lastUser.content : "general query";
    const searchResult = await smartSearch(query).catch(() => "");

    const msgs = searchResult
      ? [
          new SystemMessage(
            SYSTEM_PROMPT + `\n\nREAL-TIME SEARCH RESULTS (use ONLY this for factual answers, cite inline):\n${searchResult}`
          ),
          ...lcMessages.slice(1),
        ]
      : lcMessages;

    const response = await model.invoke(msgs);
    return response.content?.trim() || "I couldn't generate a response.";
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════════════
const shouldFallback = (err) => {
  const msg = err?.message || "";
  const code = err?.error?.error?.code || "";
  return (
    err?.status === 429 ||
    err?.status === 402 ||
    err?.status === 503 ||
    err?.status === 404 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("Too Many Requests") ||
    msg.includes("rate limit") ||
    msg.includes("EXHAUSTED") ||
    msg.includes("tool_use_failed") ||
    msg.includes("Failed to call a function") ||
    msg.includes("overloaded") ||
    msg.includes("No endpoints found") ||
    code === "tool_use_failed"
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TRY A PROVIDER
// ══════════════════════════════════════════════════════════════════════════════
const tryProvider = async (provider, lcMessages, withTools) => {
  console.log(`[AI] Trying ${provider} | tools=${withTools}`);

  if (!withTools) {
    const model = makeModel(provider);
    const response = await model.invoke(lcMessages);
    return response.content?.trim() || "I couldn't generate a response.";
  }

  if (provider === Provider.GROQ) return await runGroqToolPath(lcMessages);

  const model = makeModel(provider);
  return await runAgenticLoop([...lcMessages], model.bindTools(TOOLS));
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ══════════════════════════════════════════════════════════════════════════════
const buildContextMessages = (historyMessages, systemPrompt) => {
  const lcMessages = [new SystemMessage(systemPrompt)];
  for (const msg of historyMessages) {
    if (msg.role === "user") lcMessages.push(new HumanMessage(msg.content));
    else if (msg.role === "ai" || msg.role === "assistant") lcMessages.push(new AIMessage(msg.content));
  }
  return lcMessages;
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
const summarizeOldContext = async (oldMessages) => {
  if (!oldMessages || oldMessages.length === 0) return null;
  try {
    const model = makeGroq();
    const formatted = oldMessages
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");
    const res = await model.invoke([
      new SystemMessage(
        "Summarize this conversation history in 3-5 bullet points. Focus on: topics discussed, user preferences revealed, key facts established, and any ongoing context. Be concise."
      ),
      new HumanMessage(formatted),
    ]);
    return res.content?.trim() || null;
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
export const generateChatTitle = async (message) => {
  try {
    const model = makeGroq();
    const response = await model.invoke([
      new SystemMessage(TITLE_PROMPT),
      new HumanMessage(message),
    ]);
    return response.content?.trim() || "New Chat";
  } catch (err) {
    console.error("[AI] generateChatTitle error:", err.message);
    return "New Chat";
  }
};

export const generateResponse = async (historyMessages, options = {}) => {
  const { maxRecentMessages = 20, oldMessagesToSummarize = 0 } = options;

  let contextSummary = null;
  let recentMessages = historyMessages;

  if (historyMessages.length > maxRecentMessages + oldMessagesToSummarize) {
    const splitPoint = historyMessages.length - maxRecentMessages;
    const oldMessages = historyMessages.slice(0, splitPoint);
    recentMessages = historyMessages.slice(splitPoint);
    if (oldMessages.length > 0) {
      console.log(`[AI] Summarizing ${oldMessages.length} old messages for context.`);
      contextSummary = await summarizeOldContext(oldMessages);
    }
  }

  let systemPrompt = SYSTEM_PROMPT;
  if (contextSummary) {
    systemPrompt += `\n\n## EARLIER CONVERSATION SUMMARY\n${contextSummary}\n\nUse this background context to give more personalized, relevant answers.`;
  }

  const lcMessages = buildContextMessages(recentMessages, systemPrompt);
  const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content || "";

  if (!userText) return "Kuch toh bolo bhai! 😄 Kya help chahiye?";

  const { needsTools, complexity } = await classifyQuery(userText);
  console.log(`[AI] complexity=${complexity} | needsTools=${needsTools}`);

  const providerOrder = needsTools ? TOOL_PROVIDER_ORDER : FAST_PROVIDER_ORDER;

  for (const provider of providerOrder) {
    if (isExhausted(provider)) {
      console.log(`[AI] Skipping ${provider} — exhausted.`);
      continue;
    }
    try {
      const result = await tryProvider(provider, lcMessages, needsTools);
      console.log(`[AI] ✅ Response from ${provider}`);
      return result;
    } catch (err) {
      console.error(`[AI] ${provider} failed:`, err.message);
      if (shouldFallback(err)) markExhausted(provider);
      else throw err;
    }
  }

  return "Yaar, abhi saare AI providers busy hain 😅 Thodi der baad try karo!";
};