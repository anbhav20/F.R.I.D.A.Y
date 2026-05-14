import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { z } from "zod";
import nodemailer from "nodemailer";

// ── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are F.R.I.D.A.Y, an advanced AI assistant with access to real-time tools.

## When to use web_search
Only search when the answer genuinely requires real-time or specific external data.

SEARCH when the query is about:
- Current news, recent events, live scores, breaking news
- Today's weather (use get_weather tool instead)
- Prices that change — stock, crypto, petrol, gold
- Exam results, answer keys, cutoff marks, admit cards
- Specific syllabus of a real exam (SSC CGL, UPSC, JEE, etc.)
- A specific product, movie release date, recent update
- Anything that could have changed in the last 1-2 years
- Current political leaders, government, ministers

DO NOT SEARCH for:
- General advice, opinions, casual conversation
- Math, calculations, coding, logic
- Writing help, grammar, translation
- Well-known history, science, geography
- Definitions and concepts

## Rules
- Use tools silently — never say "I am searching..." or "Let me check..."
- Search queries MUST be in English only, even if user wrote in Hindi/Hinglish
- Respond in the same language the user used
- Use markdown only when it genuinely helps
- Never fabricate facts — if unsure, search or say so`;

// ── Providers ─────────────────────────────────────────────────────────────────
// Strategy:
// 1. Gemini 2.0 Flash — fastest + best multilingual tool calling (primary)
// 2. Mistral Small   — reliable tool calling, good fallback (secondary)
// 3. Groq Llama      — very fast but tool calling unreliable in Hindi (tertiary)
const Provider = { GEMINI: "gemini", MISTRAL: "mistral", GROQ: "groq" };
const FALLBACK_ORDER = [Provider.GEMINI, Provider.MISTRAL, Provider.GROQ];

const providerState = {
  current: Provider.GEMINI,
  exhausted: { gemini: false, mistral: false, groq: false },
  exhaustedAt: { gemini: null, mistral: null, groq: null },
  // Per-minute limits reset in ~1 min, daily limits reset at midnight
  // Keep short so we retry quickly after per-minute limits clear
  retryAfterMinutes: 2,
};

const canRetry = (provider) => {
  const at = providerState.exhaustedAt[provider];
  if (!at) return false;
  return (Date.now() - at) / 60000 >= providerState.retryAfterMinutes;
};

const markExhausted = (provider) => {
  providerState.exhausted[provider] = true;
  providerState.exhaustedAt[provider] = Date.now();
  console.warn(`[AI] ${provider} failed — switching.`);
  const next = FALLBACK_ORDER.find((p) => p !== provider && !providerState.exhausted[p]);
  if (next) {
    providerState.current = next;
    console.log(`[AI] Now using ${next}`);
  } else {
    console.error("[AI] All providers exhausted.");
  }
};

const resetCooldowns = () => {
  for (const p of FALLBACK_ORDER) {
    if (providerState.exhausted[p] && canRetry(p)) {
      providerState.exhausted[p] = false;
      providerState.exhaustedAt[p] = null;
      console.log(`[AI] ${p} re-enabled after cooldown.`);
    }
  }
};

const getActiveProvider = () => {
  resetCooldowns();
  if (providerState.exhausted[providerState.current]) {
    const next = FALLBACK_ORDER.find((p) => !providerState.exhausted[p]);
    if (next) providerState.current = next;
  }
  return providerState.current;
};

// ── Model factories ───────────────────────────────────────────────────────────
const makeGemini = () =>
  new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

const makeMistral = () =>
  new ChatMistralAI({
    model: "mistral-small-latest",  // free tier, reliable tool calling
    apiKey: process.env.MISTRAL_API_KEY,
    temperature: 0.7,
    maxTokens: 2048,
  });

const makeGroq = () =>
  new ChatGroq({
    model: "llama-3.3-70b-versatile",
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.7,
    maxTokens: 2048,
  });

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH — Tavily primary, Serper fallback
// ─────────────────────────────────────────────────────────────────────────────
const SearchProvider = { TAVILY: "tavily", SERPER: "serper" };
const searchState = {
  current: SearchProvider.TAVILY,
  tavilyExhausted: false, serperExhausted: false,
  retryAfterMinutes: 60,
  tavilyExhaustedAt: null, serperExhaustedAt: null,
};

const searchCanRetry = (exhaustedAt) => {
  if (!exhaustedAt) return false;
  return (Date.now() - exhaustedAt) / 60000 >= searchState.retryAfterMinutes;
};

const getActiveSearchProvider = () => {
  if (searchState.tavilyExhausted && searchCanRetry(searchState.tavilyExhaustedAt)) {
    searchState.tavilyExhausted = false;
    searchState.tavilyExhaustedAt = null;
    searchState.current = SearchProvider.TAVILY;
  }
  if (searchState.serperExhausted && searchCanRetry(searchState.serperExhaustedAt)) {
    searchState.serperExhausted = false;
    searchState.serperExhaustedAt = null;
  }
  return searchState.current;
};

const markSearchExhausted = (provider) => {
  if (provider === SearchProvider.TAVILY) {
    searchState.tavilyExhausted = true;
    searchState.tavilyExhaustedAt = Date.now();
    searchState.current = SearchProvider.SERPER;
    console.warn("[Search] Tavily exhausted — switching to Serper.");
  } else {
    searchState.serperExhausted = true;
    searchState.serperExhaustedAt = Date.now();
    searchState.current = SearchProvider.TAVILY;
    console.warn("[Search] Serper exhausted — switching to Tavily.");
  }
};

const searchWithTavily = async (query) => {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 4,        // reduced from 5 — faster, still enough context
      include_answer: true,  // direct answer when available — saves tokens
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
  data.results?.slice(0, 3).forEach((r, i) =>
    parts.push(`[${i + 1}] ${r.title}\n${r.content?.slice(0, 400)}\nURL: ${r.url}`)
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
    body: JSON.stringify({ q: query, num: 4 }),
  });
  if (res.status === 429 || res.status === 402) {
    markSearchExhausted(SearchProvider.SERPER);
    throw new Error("EXHAUSTED");
  }
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = await res.json();
  const parts = [];
  if (data.answerBox) parts.push(`DIRECT ANSWER: ${data.answerBox.answer || data.answerBox.snippet}`);
  if (data.knowledgeGraph) parts.push(`KNOWLEDGE: ${data.knowledgeGraph.title} — ${data.knowledgeGraph.description || ""}`);
  data.organic?.slice(0, 3).forEach((r, i) =>
    parts.push(`[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
  );
  return parts.join("\n\n") || "No results found.";
};

const smartSearch = async (query) => {
  const primary = getActiveSearchProvider();
  const secondary = primary === SearchProvider.TAVILY ? SearchProvider.SERPER : SearchProvider.TAVILY;
  try {
    return primary === SearchProvider.TAVILY
      ? await searchWithTavily(query)
      : await searchWithSerper(query);
  } catch (err) {
    if (err.message !== "EXHAUSTED") console.error(`[Search] ${primary} error:`, err.message);
  }
  const secExhausted = secondary === SearchProvider.TAVILY
    ? searchState.tavilyExhausted
    : searchState.serperExhausted;
  if (!secExhausted) {
    try {
      return secondary === SearchProvider.TAVILY
        ? await searchWithTavily(query)
        : await searchWithSerper(query);
    } catch (err) {
      if (err.message !== "EXHAUSTED") console.error(`[Search] ${secondary} error:`, err.message);
    }
  }
  return "Search unavailable — both providers exhausted.";
};

// ── Tools ─────────────────────────────────────────────────────────────────────
const webSearchTool = tool(
  async ({ query }) => {
    try { return await smartSearch(query); }
    catch (err) { return `Search failed: ${err.message}`; }
  },
  {
    name: "web_search",
    description: "Search the internet for real-time info: news, prices, sports, exams, current events, government, politics, people, products.",
    schema: z.object({ query: z.string().describe("Search query in English") }),
  }
);

const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await transporter.sendMail({
        from: `"F.R.I.D.A.Y" <${process.env.EMAIL_USER}>`,
        to, subject, text: body,
        html: body.replace(/\n/g, "<br>"),
      });
      return `Email sent to ${to}.`;
    } catch (err) { return `Failed to send: ${err.message}`; }
  },
  {
    name: "send_email",
    description: "Send an email on behalf of the user.",
    schema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
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
      return `${d.name}, ${d.sys.country}: ${d.weather[0].description}, ${d.main.temp}°C (feels like ${d.main.feels_like}°C), humidity ${d.main.humidity}%, wind ${d.wind.speed} m/s`;
    } catch (err) { return `Weather fetch failed: ${err.message}`; }
  },
  {
    name: "get_weather",
    description: "Get real-time weather for any city or location.",
    schema: z.object({ location: z.string().describe("City name e.g. Delhi, Mumbai, New York") }),
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
    description: "Evaluate math expressions accurately.",
    schema: z.object({ expression: z.string().describe("e.g. '15% of 85000'") }),
  }
);

const getDatetimeTool = tool(
  async ({ timezone }) => new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone || "Asia/Kolkata",
    dateStyle: "full", timeStyle: "long",
  }).format(new Date()),
  {
    name: "get_current_datetime",
    description: "Get the current date and time.",
    schema: z.object({
      timezone: z.string().optional().describe("IANA timezone. Defaults to Asia/Kolkata (IST)."),
    }),
  }
);

const TOOLS = [webSearchTool, sendEmailTool, getWeatherTool, calculateTool, getDatetimeTool];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ── Agentic loop ──────────────────────────────────────────────────────────────
const runAgenticLoop = async (lcMessages, modelWithTools) => {
  let response = await modelWithTools.invoke(lcMessages);
  while (response.tool_calls?.length) {
    const toolResults = await Promise.all(
      response.tool_calls.map(async (tc) => {
        const handler = TOOL_MAP[tc.name];
        const result = handler
          ? await handler.invoke(tc.args)
          : `Tool "${tc.name}" not found.`;
        return new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      })
    );
    lcMessages.push(response, ...toolResults);
    response = await modelWithTools.invoke(lcMessages);
  }
  return response.content?.trim() || "I couldn't generate a response.";
};

// ── Groq — tool calling unreliable in Hindi, auto-fallback to manual search ───
const runGroqWithFallback = async (lcMessages) => {
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

    console.warn("[AI] Groq tool_use_failed — retrying with manual search.");
    const lastUser = [...lcMessages].reverse().find((m) => m._getType?.() === "human");
    const query = typeof lastUser?.content === "string" ? lastUser.content : "general query";
    const searchResult = await smartSearch(query).catch(() => "");

    const msgs = searchResult
      ? [
          new SystemMessage(SYSTEM_PROMPT +
            `\n\nREAL-TIME SEARCH RESULTS (use ONLY this for factual answers):\n${searchResult}`
          ),
          ...lcMessages.slice(1),
        ]
      : lcMessages;

    const response = await model.invoke(msgs);
    return response.content?.trim() || "I couldn't generate a response.";
  }
};

// ── Error classification ──────────────────────────────────────────────────────
const shouldFallback = (err) => {
  const msg = err?.message || "";
  const code = err?.error?.error?.code || "";
  return (
    err?.status === 429 || err?.status === 402 ||
    msg.includes("429") || msg.includes("quota") ||
    msg.includes("Too Many Requests") ||
    msg.includes("rate limit") || msg.includes("EXHAUSTED") ||
    msg.includes("tool_use_failed") ||
    msg.includes("Failed to call a function") ||
    code === "tool_use_failed"
  );
};

// ── Try a specific provider ───────────────────────────────────────────────────
const tryProvider = async (provider, lcMessages) => {
  console.log(`[AI] Using ${provider}...`);

  if (provider === Provider.GEMINI) {
    // Fastest + best multilingual tool calling
    return await runAgenticLoop([...lcMessages], makeGemini().bindTools(TOOLS));
  }

  if (provider === Provider.MISTRAL) {
    // Reliable tool calling, good multilingual support
    return await runAgenticLoop([...lcMessages], makeMistral().bindTools(TOOLS));
  }

  if (provider === Provider.GROQ) {
    // Fastest raw speed but tool calling unreliable in Hindi/Hinglish
    return await runGroqWithFallback(lcMessages);
  }
};

// ── Main: generate response with auto-fallback ────────────────────────────────
export const generateResponse = async (messages) => {
  const lcMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...messages.map(toMessage).filter(Boolean),
  ];

  const active = getActiveProvider();
  const orderedProviders = [active, ...FALLBACK_ORDER.filter((p) => p !== active)];

  for (const p of orderedProviders) {
    if (providerState.exhausted[p]) continue;
    try {
      const result = await tryProvider(p, lcMessages);
      providerState.current = p;
      return result;
    } catch (err) {
      console.error(`[AI] ${p} error: ${err?.message}`);
      if (shouldFallback(err)) {
        markExhausted(p);
      } else {
        console.error(`[AI] ${p} unexpected:`, err);
        markExhausted(p);
      }
    }
  }

  throw new Error("All AI providers failed. Please try again later.");
};

// ── Generate chat title — use fastest available ───────────────────────────────
export const generateChatTitle = async (message) => {
  for (const makeModel of [makeGemini, makeMistral, makeGroq]) {
    try {
      const model = makeModel();
      const res = await model.invoke([
        new SystemMessage(
          "Generate a 2-5 word chat title. No emojis, no quotes, no punctuation. Title Case. Be specific to the topic."
        ),
        new HumanMessage(`Title for: "${message}"`),
      ]);
      const title = res.content?.trim();
      if (title && title.split(" ").length <= 8) return title;
    } catch {
      continue;
    }
  }
  return "New Chat";
};

// ── Helper ────────────────────────────────────────────────────────────────────
const toMessage = (msg) => {
  if (msg.role === "user") return new HumanMessage(msg.content);
  if (msg.role === "ai")   return new AIMessage(msg.content);
  return null;
};