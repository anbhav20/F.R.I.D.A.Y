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
import { evaluate } from "mathjs";

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
const SYSTEM_PROMPT = `You are F.R.I.D.A.Y, an elite AI made by Anbhav. Be smart, accurate, and conversational.

IDENTITY: Made by Anbhav (real name Abhishek). Never claim to be ChatGPT/Claude/Gemini.
CREATOR INFO:
${creatorInfo}
When asked about creator, use ONLY the above info. Never search for it.

## CONTEXT AWARENESS — CRITICAL
- Always read the full conversation history before responding.
- If user says "what about X?" or "aur X?" — understand they are continuing the PREVIOUS topic.
- Example: If last topic was "current affairs" and user says "what about NEET 2026?" → they want NEET 2026 NEWS/UPDATES, not eligibility info.
- Connect follow-up questions to the ongoing topic intelligently.
- Never repeat information already given.
- Detect user type (student/dev/professional) from conversation and adjust depth.

## RESPONSE FORMAT — STRICT RULES
- Use clean markdown: headings (##, ###), bullet points, bold for key terms.
- NEVER use ASCII tables (|---|---|) unless user explicitly asks for a table.
- NEVER output raw JSON or escaped strings like \\n.
- Separate each major point/section with a blank line.
- For news/current affairs: each item gets its own ### heading with source link below it.
- Cite sources as markdown links: [Source Name](URL) — never as *(Source)*.
- Casual Hinglish + emojis when tone matches 😄
- Match user's language and energy.
- NEVER announce searching — do it silently. Search queries always in English.

## FACTUALITY — STRICT
- ONLY use facts from tool results. Never invent news, dates, stats, or political outcomes.
- If you can't verify something from tools, say: "I couldn't verify this from current sources."
- Never mix training knowledge with real-time claims.

## SEARCH STRATEGY
- Max 3 searches. After 1st result, check if answer is complete. If not → search again with a DIFFERENT query.
- Search for: news, prices, scores, weather, current leaders, exam results, products, recent events.
- Skip search for: coding, math, definitions, creative writing, casual chat, creator questions.`;

// ══════════════════════════════════════════════════════════════════════════════
// CLASSIFIER PROMPT — Now receives conversation context
// ══════════════════════════════════════════════════════════════════════════════
const CLASSIFIER_PROMPT = `You are a smart query classifier. You see the last few messages of a conversation.

Your job: decide if the LATEST user message needs real-time web/tool search.

CRITICAL CONTEXT RULE:
- If earlier messages discussed current affairs, news, or recent events → follow-up questions almost certainly need search too.
- "what about X?", "aur X?", "X ke baare mein?" in a news/current affairs conversation = needs search for X's latest news.
- Don't classify follow-ups as "educational" if the conversation context is clearly about current events.

Reply ONLY valid JSON (no markdown, no explanation):
{"needsTools": true/false, "complexity": "low|medium|high", "intent": "one line describing what user actually wants"}

NEEDS SEARCH (true): news, current events, prices, scores, weather, recent results, "latest/current/2025/2026/aaj/abhi/update/kaun/kya hua"
SKIP SEARCH (false): coding, math, writing help, definitions, stable history, casual chat, follow-up on AI's own previous answer
When in doubt → true`;

// ══════════════════════════════════════════════════════════════════════════════
// TITLE PROMPT
// ══════════════════════════════════════════════════════════════════════════════
const TITLE_PROMPT = `Generate a chat title in max 5 words. Title Case. No quotes or punctuation. Be specific to the topic, not generic. Return ONLY the title.`;

// ══════════════════════════════════════════════════════════════════════════════
// GAP CHECK — after first search
// ══════════════════════════════════════════════════════════════════════════════
const GAP_CHECK_PROMPT = `Search done. Is the answer complete with recent, accurate info?

If INCOMPLETE → do ONE more web_search with a completely different, more specific query.

If COMPLETE → write the final answer now:
- Use ## and ### headings
- Bullet points for details
- Each news item as its own section
- Cite sources as markdown links: [Source Name](URL)
- NO ASCII tables, NO raw JSON, NO escaped characters
- MAX 3 searches total`;

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ══════════════════════════════════════════════════════════════════════════════
const Provider = {
  GPT_OSS:    "gpt_oss",
  NEMOTRON:   "nemotron",
  GLM:        "glm",
  LLAMA_FREE: "llama_free",
  GROQ:       "groq",
};

const TOOL_PROVIDER_ORDER = [Provider.GPT_OSS, Provider.NEMOTRON, Provider.GLM, Provider.GROQ];
const FAST_PROVIDER_ORDER = [Provider.GROQ, Provider.NEMOTRON, Provider.GLM, Provider.LLAMA_FREE];
const RETRY_AFTER_MINUTES = 2;

const providerState = {
  exhausted:   { gpt_oss: false, nemotron: false, glm: false, llama_free: false, groq: false },
  exhaustedAt: { gpt_oss: null,  nemotron: null,  glm: null,  llama_free: null,  groq: null  },
};

const isExhausted = (p) => {
  if (!providerState.exhausted[p]) return false;
  const at = providerState.exhaustedAt[p];
  if (at && (Date.now() - at) / 60000 >= RETRY_AFTER_MINUTES) {
    providerState.exhausted[p] = false;
    providerState.exhaustedAt[p] = null;
    console.log(`[AI] ${p} cooldown ended.`);
    return false;
  }
  return true;
};

const markExhausted = (p) => {
  providerState.exhausted[p] = true;
  providerState.exhaustedAt[p] = Date.now();
  console.warn(`[AI] ${p} exhausted.`);
};

// ══════════════════════════════════════════════════════════════════════════════
// MODEL FACTORIES
// ══════════════════════════════════════════════════════════════════════════════
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
    maxTokens: 4096,
  });

const makeGptOss    = () => openRouterModel("openai/gpt-oss-120b:free");
const makeNemotron  = () => openRouterModel("nvidia/nemotron-3-super-120b-a12b:free");
const makeGlm       = () => openRouterModel("z-ai/glm-4.5-air:free");
const makeLlamaFree = () => openRouterModel("meta-llama/llama-3.3-70b-instruct:free");

const makeGroq = () =>
  new ChatGroq({
    model: "llama-3.3-70b-versatile",
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.2,
    maxTokens: 2048,
  });

let _classifier = null;
const getClassifier = () => {
  if (!_classifier) {
    _classifier = new ChatGroq({
      model: "llama-3.1-8b-instant",
      apiKey: process.env.GROQ_API_KEY,
      temperature: 0,
      maxTokens: 120,
    });
  }
  return _classifier;
};

const makeModel = (provider) => {
  if (provider === Provider.GPT_OSS)    return makeGptOss();
  if (provider === Provider.NEMOTRON)   return makeNemotron();
  if (provider === Provider.GLM)        return makeGlm();
  if (provider === Provider.LLAMA_FREE) return makeLlamaFree();
  if (provider === Provider.GROQ)       return makeGroq();
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT-AWARE CLASSIFIER
// The KEY fix: classifier now sees last 3 messages, not just current one
// ══════════════════════════════════════════════════════════════════════════════
const classifyQuery = async (recentMessages) => {
  try {
    // Build a mini context string from last 3 messages
    const contextWindow = recentMessages
      .slice(-3) // last 3 messages
      .map((m) => {
        const role = m.role === "user" ? "User" : "AI";
        return `${role}: ${m.content.slice(0, 200)}`;
      })
      .join("\n");

    const res = await getClassifier().invoke([
      new SystemMessage(CLASSIFIER_PROMPT),
      new HumanMessage(`Conversation so far:\n${contextWindow}\n\nClassify the LATEST user message above.`),
    ]);

    const clean = (res.content?.trim() || "{}").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log(`[Router] tools=${parsed.needsTools} | complexity=${parsed.complexity} | intent: ${parsed.intent}`);
    return {
      needsTools: Boolean(parsed.needsTools),
      complexity: parsed.complexity || "medium",
      intent: parsed.intent || "",
    };
  } catch (err) {
    console.warn("[Router] Classifier failed:", err.message);
    return { needsTools: true, complexity: "medium", intent: "unknown" };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH — Tavily → Serper fallback
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
    return false;
  }
  return true;
};

const markSearchExhausted = (sp) => {
  searchState.exhausted[sp] = true;
  searchState.exhaustedAt[sp] = Date.now();
  searchState.current = sp === SearchProvider.TAVILY ? SearchProvider.SERPER : SearchProvider.TAVILY;
  console.warn(`[Search] ${sp} exhausted.`);
};

// Format search results as clean readable text (no JSON, no escapes)
const formatTavilyResults = (data) => {
  const parts = [];
  if (data.answer) parts.push(`Quick Answer: ${data.answer}`);
  data.results?.slice(0, 4).forEach((r, i) => {
    parts.push(`\n[Result ${i + 1}]\nTitle: ${r.title}\nContent: ${r.content?.slice(0, 500)}\nSource URL: ${r.url}`);
  });
  return parts.join("\n") || "No results found.";
};

const formatSerperResults = (data) => {
  const parts = [];
  if (data.answerBox) parts.push(`Quick Answer: ${data.answerBox.answer || data.answerBox.snippet}`);
  if (data.knowledgeGraph) parts.push(`Knowledge: ${data.knowledgeGraph.title} — ${data.knowledgeGraph.description || ""}`);
  data.organic?.slice(0, 4).forEach((r, i) => {
    parts.push(`\n[Result ${i + 1}]\nTitle: ${r.title}\nSnippet: ${r.snippet}\nSource URL: ${r.link}`);
  });
  return parts.join("\n") || "No results found.";
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
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  return formatTavilyResults(await res.json());
};

const searchWithSerper = async (query) => {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (res.status === 429 || res.status === 402) {
    markSearchExhausted(SearchProvider.SERPER);
    throw new Error("EXHAUSTED");
  }
  if (!res.ok) throw new Error(`Serper ${res.status}`);
  return formatSerperResults(await res.json());
};

const smartSearch = async (query) => {
  const available = [SearchProvider.TAVILY, SearchProvider.SERPER].filter((sp) => !isSearchExhausted(sp));
  const order = available.includes(searchState.current)
    ? [searchState.current, ...available.filter((sp) => sp !== searchState.current)]
    : available;

  for (const sp of order) {
    try {
      const result = sp === SearchProvider.TAVILY ? await searchWithTavily(query) : await searchWithSerper(query);
      console.log(`[Search] ✅ ${sp} | "${query}"`);
      return result;
    } catch (err) {
      if (err.message !== "EXHAUSTED") console.error(`[Search] ${sp}:`, err.message);
    }
  }
  return "Search unavailable right now.";
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
    description: "Real-time web search: news, prices, scores, events, current affairs, people, products. Use multiple times with DIFFERENT queries if first result is incomplete.",
    schema: z.object({ query: z.string().describe("Specific English search query") }),
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
      return `${d.name}, ${d.sys.country}: ${d.weather[0].description}, ${d.main.temp}°C (feels ${d.main.feels_like}°C), humidity ${d.main.humidity}%, wind ${d.wind.speed}m/s`;
    } catch (err) { return `Weather failed: ${err.message}`; }
  },
  {
    name: "get_weather",
    description: "Current weather for any city.",
    schema: z.object({ location: z.string().describe("City name e.g. Delhi, Mumbai") }),
  }
);

const calculateTool = tool(
  async ({ expression }) => {
    try {
      const result = evaluate(expression);
      return `${expression} = ${result}`;
    } catch { return `Cannot evaluate: "${expression}"`; }
  },
  {
    name: "calculate",
    description: "Evaluate math expressions accurately.",
    schema: z.object({ expression: z.string().describe("e.g. '15% of 85000'") }),
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
    description: "Current date and time.",
    schema: z.object({
      timezone: z.string().nullable().optional().describe("IANA timezone, default Asia/Kolkata"),
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

  while (response.tool_calls?.length) {
    const webCalls = response.tool_calls.filter((tc) => tc.name === "web_search");
    searchCount += webCalls.length;

    const toolResults = await Promise.all(
      response.tool_calls.map(async (tc) => {
        const handler = TOOL_MAP[tc.name];
        const result = handler ? await handler.invoke(tc.args) : `Tool "${tc.name}" not found.`;
        console.log(`[Tool] ${tc.name} | ${JSON.stringify(tc.args).slice(0, 80)}`);
        return new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      })
    );

    lcMessages.push(response, ...toolResults);

    if (webCalls.length > 0 && searchCount === 1) {
      lcMessages.push(new SystemMessage(GAP_CHECK_PROMPT));
      console.log("[AI] Gap check injected.");
    }
    if (searchCount >= 3) {
      lcMessages.push(new SystemMessage(
        "Max searches reached. Give the final answer now using clean markdown. Use [Source Name](URL) for citations. NO tables, NO raw JSON."
      ));
      console.log("[AI] Max searches — final answer forced.");
    }

    response = await modelWithTools.invoke(lcMessages);
  }

  return cleanResponse(response.content?.trim() || "I couldn't generate a response.");
};

// ══════════════════════════════════════════════════════════════════════════════
// RESPONSE CLEANER — strips escaped chars, raw JSON artifacts
// ══════════════════════════════════════════════════════════════════════════════
const cleanResponse = (text) => {
  return text
    .replace(/^["']|["']$/g, "")   // strip wrapping quotes
    .replace(/\\n/g, "\n")          // unescape newlines
    .replace(/\\t/g, "\t")          // unescape tabs
    .replace(/\\\"/g, '"')          // unescape quotes
    .trim();
};

// ══════════════════════════════════════════════════════════════════════════════
// GROQ FALLBACK
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
      ? [new SystemMessage(SYSTEM_PROMPT + `\n\nSEARCH RESULTS (use ONLY this, cite as markdown links):\n${searchResult}`), ...lcMessages.slice(1)]
      : lcMessages;

    const response = await model.invoke(msgs);
    return cleanResponse(response.content?.trim() || "I couldn't generate a response.");
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════════════
const shouldFallback = (err) => {
  const msg = err?.message || "";
  return (
    err?.status === 429 || err?.status === 402 || err?.status === 503 || err?.status === 404 ||
    msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") ||
    msg.includes("Too Many Requests") || msg.includes("overloaded") ||
    msg.includes("tool_use_failed") || msg.includes("Failed to call a function") ||
    msg.includes("No endpoints found") ||
    err?.error?.error?.code === "tool_use_failed"
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TRY PROVIDER
// ══════════════════════════════════════════════════════════════════════════════
const tryProvider = async (provider, lcMessages, withTools) => {
  console.log(`[AI] Trying ${provider} | tools=${withTools}`);
  if (!withTools) {
    const response = await makeModel(provider).invoke(lcMessages);
    return cleanResponse(response.content?.trim() || "I couldn't generate a response.");
  }
  if (provider === Provider.GROQ) return await runGroqToolPath(lcMessages);
  return await runAgenticLoop([...lcMessages], makeModel(provider).bindTools(TOOLS));
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ══════════════════════════════════════════════════════════════════════════════
const buildContextMessages = (history, systemPrompt) => {
  const msgs = [new SystemMessage(systemPrompt)];
  for (const msg of history) {
    if (msg.role === "user") msgs.push(new HumanMessage(msg.content));
    else if (msg.role === "ai" || msg.role === "assistant") msgs.push(new AIMessage(msg.content));
  }
  return msgs;
};

// ══════════════════════════════════════════════════════════════════════════════
// OLD CONTEXT SUMMARIZER
// ══════════════════════════════════════════════════════════════════════════════
const summarizeOldContext = async (oldMessages) => {
  if (!oldMessages?.length) return null;
  try {
    const formatted = oldMessages
      .map((m) => `${m.role === "user" ? "U" : "AI"}: ${m.content.slice(0, 250)}`)
      .join("\n");
    const res = await makeGroq().invoke([
      new SystemMessage("Summarize in 3 bullet points: key topics, user preferences, important facts established. Be very concise."),
      new HumanMessage(formatted),
    ]);
    return res.content?.trim() || null;
  } catch { return null; }
};

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
export const generateChatTitle = async (message) => {
  try {
    const res = await makeGroq().invoke([
      new SystemMessage(TITLE_PROMPT),
      new HumanMessage(message.slice(0, 200)),
    ]);
    return res.content?.trim() || "New Chat";
  } catch (err) {
    console.error("[AI] Title error:", err.message);
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
      console.log(`[AI] Summarizing ${oldMessages.length} old messages.`);
      contextSummary = await summarizeOldContext(oldMessages);
    }
  }

  const systemPrompt = contextSummary
    ? SYSTEM_PROMPT + `\n\n## EARLIER CONTEXT SUMMARY\n${contextSummary}`
    : SYSTEM_PROMPT;

  const lcMessages = buildContextMessages(recentMessages, systemPrompt);

  const lastUserMsg = [...recentMessages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content || "";
  if (!userText) return "Kuch toh bolo bhai! 😄";

  // ✅ KEY FIX: Pass recentMessages (with context) to classifier, not just userText
  const { needsTools, intent } = await classifyQuery(recentMessages);
  console.log(`[AI] intent="${intent}" | needsTools=${needsTools}`);

  const providerOrder = needsTools ? TOOL_PROVIDER_ORDER : FAST_PROVIDER_ORDER;

  for (const provider of providerOrder) {
    if (isExhausted(provider)) continue;
    try {
      const result = await tryProvider(provider, lcMessages, needsTools);
      console.log(`[AI] ✅ ${provider}`);
      return result;
    } catch (err) {
      console.error(`[AI] ${provider} failed:`, err.message);
      if (shouldFallback(err)) markExhausted(provider);
      else throw err;
    }
  }

  return "Yaar, saare providers busy hain 😅 Thodi der baad try karo!";
};