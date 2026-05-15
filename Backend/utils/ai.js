import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { z } from "zod";
import nodemailer from "nodemailer";

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are F.R.I.D.A.Y, an advanced AI assistant created by Anbhav with the access of real-time web search and internet.

If anyone asks who created you, who made you, or who built you — always say: "I was created by Anbhav, a developer who built me as an advanced AI assistant."

If anyone asks who Anbhav is — say: "Anbhav is my creator, a passionate developer and tech enthusiast who built me from scratch."
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

// ══════════════════════════════════════════════════════════════════════════════
// QUERY CLASSIFIER  (runs on Groq — ultra fast, no tools needed)
// Returns: { needsTools: boolean, reason: string }
// ══════════════════════════════════════════════════════════════════════════════
const CLASSIFIER_PROMPT = `You are a query classifier. Decide if a user query needs real-time internet search or external tools.

Answer ONLY with valid JSON: {"needsTools": true/false, "reason": "one short sentence"}

NEEDS TOOLS (needsTools: true):
- Current news, breaking events, live scores
- Weather right now
- Stock/crypto/gold/petrol prices today
- Exam results, answer keys, cutoff marks
- Recent product releases, movie release dates
- Current politicians, ministers, government
- Anything that changes day to day

DOES NOT NEED TOOLS (needsTools: false):
- Casual chat, greetings, opinions
- Coding help, debugging, algorithms
- Math calculations
- Writing help, grammar, translation, creative writing
- Stable history, science, geography, definitions
- Explaining concepts or giving general advice

Be conservative — only set needsTools: true when real-time data is genuinely required.`;

let classifierModel = null;
const getClassifier = () => {
  if (!classifierModel) {
    classifierModel = new ChatGroq({
      model: "llama-3.1-8b-instant", // smallest + fastest Groq model
      apiKey: process.env.GROQ_API_KEY,
      temperature: 0,
      maxTokens: 64,
    });
  }
  return classifierModel;
};

const classifyQuery = async (userMessage) => {
  try {
    const res = await getClassifier().invoke([
      new SystemMessage(CLASSIFIER_PROMPT),
      new HumanMessage(`Query: "${userMessage}"`),
    ]);
    const text = res.content?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log(`[Router] needsTools=${parsed.needsTools} | ${parsed.reason}`);
    return { needsTools: Boolean(parsed.needsTools), reason: parsed.reason || "" };
  } catch (err) {
    console.warn("[Router] Classifier failed, defaulting to tools=false:", err.message);
    return { needsTools: false, reason: "classifier error" };
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// PROVIDER STATE — separate pools for tool & no-tool paths
// ══════════════════════════════════════════════════════════════════════════════
const Provider = { GEMINI: "gemini", MISTRAL: "mistral", GROQ: "groq" };

// Tool path: Gemini → Mistral → Groq
const TOOL_PROVIDER_ORDER = [Provider.GROQ, Provider.MISTRAL, Provider.GEMINI];
// No-tool path: Groq → Mistral → Gemini  (fast first, expensive last)
const FAST_PROVIDER_ORDER = [Provider.GROQ, Provider.MISTRAL, Provider.GEMINI];

const RETRY_AFTER_MINUTES = 2;

const providerState = {
  exhausted: { gemini: false, mistral: false, groq: false },
  exhaustedAt: { gemini: null, mistral: null, groq: null },
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
const makeGemini = () =>
  new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

const makeMistral = () =>
  new ChatMistralAI({
    model: "mistral-small-latest",
    apiKey: process.env.MISTRAL_API_KEY,
    temperature: 0.7,
    maxTokens: 2048,
  });

const makeGroq = (large = false) =>
  new ChatGroq({
    model: large ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0.7,
    maxTokens: 2048,
  });

const makeModel = (provider, withTools) => {
  // For no-tool fast path, use smaller Groq model
  if (provider === Provider.GROQ) return makeGroq(!withTools === false);
  if (provider === Provider.GEMINI) return makeGemini();
  if (provider === Provider.MISTRAL) return makeMistral();
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
      max_results: 4,
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
  if (data.answerBox)
    parts.push(`DIRECT ANSWER: ${data.answerBox.answer || data.answerBox.snippet}`);
  if (data.knowledgeGraph)
    parts.push(`KNOWLEDGE: ${data.knowledgeGraph.title} — ${data.knowledgeGraph.description || ""}`);
  data.organic?.slice(0, 3).forEach((r, i) =>
    parts.push(`[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
  );
  return parts.join("\n\n") || "No results found.";
};

const smartSearch = async (query) => {
  const order = isSearchExhausted(searchState.current)
    ? [SearchProvider.TAVILY, SearchProvider.SERPER].filter((sp) => !isSearchExhausted(sp))
    : [searchState.current, searchState.current === SearchProvider.TAVILY
        ? SearchProvider.SERPER : SearchProvider.TAVILY];

  for (const sp of order) {
    try {
      return sp === SearchProvider.TAVILY
        ? await searchWithTavily(query)
        : await searchWithSerper(query);
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
    description:
      "Search the internet for real-time info: news, prices, sports, exams, current events, government, politics, people, products.",
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
    schema: z.object({
      location: z.string().describe("City name e.g. Delhi, Mumbai, New York"),
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
    description: "Get the current date and time.",
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone. Defaults to Asia/Kolkata (IST)."),
    }),
  }
);

const TOOLS = [webSearchTool, sendEmailTool, getWeatherTool, calculateTool, getDatetimeTool];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ══════════════════════════════════════════════════════════════════════════════
// AGENTIC LOOP  (for tool-enabled paths)
// ══════════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════════════
// GROQ TOOL-CALL FALLBACK
// Groq tool calling unreliable in Hindi/Hinglish — manual search inject
// ══════════════════════════════════════════════════════════════════════════════
const runGroqToolPath = async (lcMessages) => {
  const model = makeGroq(true); // 70b for tool path
  try {
    return await runAgenticLoop([...lcMessages], model.bindTools(TOOLS));
  } catch (err) {
    const isToolFailed =
      err?.error?.error?.code === "tool_use_failed" ||
      err?.message?.includes("tool_use_failed") ||
      err?.message?.includes("Failed to call a function") ||
      err?.status === 400;
    if (!isToolFailed) throw err;

    console.warn("[AI] Groq tool_use_failed — injecting manual search.");
    const lastUser = [...lcMessages].reverse().find((m) => m._getType?.() === "human");
    const query = typeof lastUser?.content === "string" ? lastUser.content : "general query";
    const searchResult = await smartSearch(query).catch(() => "");

    const msgs = searchResult
      ? [
          new SystemMessage(
            SYSTEM_PROMPT +
              `\n\nREAL-TIME SEARCH RESULTS (use ONLY this for factual answers):\n${searchResult}`
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
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("Too Many Requests") ||
    msg.includes("rate limit") ||
    msg.includes("EXHAUSTED") ||
    msg.includes("tool_use_failed") ||
    msg.includes("Failed to call a function") ||
    code === "tool_use_failed"
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TRY A PROVIDER
// ══════════════════════════════════════════════════════════════════════════════
const tryProvider = async (provider, lcMessages, withTools) => {
  console.log(`[AI] Trying ${provider} | tools=${withTools}`);

  if (!withTools) {
    // FAST PATH — no tools, just invoke directly
    const model = makeModel(provider, false);
    const response = await model.invoke(lcMessages);
    return response.content?.trim() || "I couldn't generate a response.";
  }

  // TOOL PATH
  if (provider === Provider.GROQ) return await runGroqToolPath(lcMessages);
  const model = makeModel(provider, true);
  return await runAgenticLoop([...lcMessages], model.bindTools(TOOLS));
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: generateResponse  — Intelligent router entry point
// ══════════════════════════════════════════════════════════════════════════════
export const generateResponse = async (messages) => {
  const lcMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...messages.map(toMessage).filter(Boolean),
  ];

  // Extract last user message for classification
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content || "";

  // ── Step 1: classify query ─────────────────────────────────────────────────
  const { needsTools } = await classifyQuery(userText);

  // ── Step 2: pick provider order based on classification ────────────────────
  const order = needsTools ? TOOL_PROVIDER_ORDER : FAST_PROVIDER_ORDER;

  // ── Step 3: try providers with auto-fallback ───────────────────────────────
  for (const p of order) {
    if (isExhausted(p)) continue;
    try {
      const result = await tryProvider(p, lcMessages, needsTools);
      return result;
    } catch (err) {
      console.error(`[AI] ${p} error: ${err?.message}`);
      if (shouldFallback(err)) {
        markExhausted(p);
      } else {
        // Unexpected error — still mark exhausted to skip on retry
        markExhausted(p);
      }
    }
  }

  // ── Step 4: last resort — try opposite path ────────────────────────────────
  // e.g. if tool providers all failed, try fast providers without tools
  const fallbackOrder = needsTools ? FAST_PROVIDER_ORDER : TOOL_PROVIDER_ORDER;
  console.warn("[AI] Primary order exhausted — trying fallback path.");
  for (const p of fallbackOrder) {
    if (isExhausted(p)) continue;
    try {
      return await tryProvider(p, lcMessages, false); // no tools in last resort
    } catch (err) {
      markExhausted(p);
    }
  }

  throw new Error("All AI providers failed. Please try again later.");
};

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE CHAT TITLE — fastest available
// ══════════════════════════════════════════════════════════════════════════════
export const generateChatTitle = async (message) => {
  const titlePrompt = [
    new SystemMessage(
      "Generate a 2-5 word chat title. No emojis, no quotes, no punctuation. Title Case. Be specific to the topic."
    ),
    new HumanMessage(`Title for: "${message}"`),
  ];

  // Groq first (fastest), then Mistral, then Gemini
  for (const makeModelFn of [() => makeGroq(false), makeMistral, makeGemini]) {
    if (makeModelFn === (() => makeGroq(false)) && isExhausted(Provider.GROQ)) continue;
    if (makeModelFn === makeMistral && isExhausted(Provider.MISTRAL)) continue;
    if (makeModelFn === makeGemini && isExhausted(Provider.GEMINI)) continue;
    try {
      const model = makeModelFn();
      const res = await model.invoke(titlePrompt);
      const title = res.content?.trim();
      if (title && title.split(" ").length <= 8) return title;
    } catch {
      continue;
    }
  }
  return "New Chat";
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════════════════════════════════════
const toMessage = (msg) => {
  if (msg.role === "user") return new HumanMessage(msg.content);
  if (msg.role === "ai") return new AIMessage(msg.content);
  return null;
};