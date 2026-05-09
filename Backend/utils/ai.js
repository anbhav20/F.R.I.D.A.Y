import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import nodemailer from "nodemailer";

// ── Models ───────────────────────────────────────────────────────────────────
const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
  temperature: 0.7,
  maxTokens: 2048,
});

const titleModel = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
  temperature: 0.3,
  maxTokens: 20,
});

// ── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an advanced AI assistant with access to real-time tools.

## When to use web_search
Only search when the answer genuinely requires real-time or specific external data. Use your own knowledge confidently for everything else.

SEARCH when the query is about:
- Current news, recent events, live scores, breaking news
- Today's weather (use get_weather tool instead)
- Prices that change — stock, crypto, petrol, gold
- Exam results, answer keys, cutoff marks, admit cards
- Specific syllabus of a real exam (SSC CGL, UPSC, JEE, etc.)
- A specific product, movie release date, recent update
- Anything that could have changed in the last 1-2 years
- Statistics or facts you are not fully confident about

DO NOT SEARCH for:
- General advice, opinions, lifestyle questions ("chai piyun ya khana khayun", "subah kya khayein")
- Math, calculations, coding, logic
- Writing help, grammar, translation
- Well-known history, science, geography (capitals, formulas, wars, etc.)
- Definitions and concepts
- Personal advice or casual conversation
- Anything you can answer confidently from your training

## Other rules
- Use tools silently — don't narrate "I am searching..."
- When you do search, queries MUST be in English only, even if user wrote in Hindi/Hinglish. Translate the intent. Example: "iss waqt chai pina sahi h?" → do NOT search, just answer. "SSC CGL 2024 syllabus kya h?" → search query: "SSC CGL 2024 syllabus".
- Respond in the same language the user used (Hindi, Hinglish, English).
- Use markdown only when it genuinely helps (tables, code blocks, lists).
- Never fabricate facts. If unsure, say so.

Tools available: web_search, send_email, get_weather, calculate, get_current_datetime.`;

// ─────────────────────────────────────────────────────────────────────────────
// SMART SEARCH PROVIDER — Tavily primary, Serper fallback, auto-switches back
// ─────────────────────────────────────────────────────────────────────────────

const SearchProvider = {
  TAVILY: "tavily",
  SERPER: "serper",
};

// Tracks which provider is currently active and failure state
const searchState = {
  current: SearchProvider.TAVILY,  // Start with Tavily (1000 free credits)
  tavilyExhausted: false,
  serperExhausted: false,
  // After this many minutes, retry an exhausted provider (credits may have reset)
  retryAfterMinutes: 60,
  tavilyExhaustedAt: null,
  serperExhaustedAt: null,
};

// Check if enough time has passed to retry an exhausted provider
const canRetry = (exhaustedAt) => {
  if (!exhaustedAt) return false;
  const elapsed = (Date.now() - exhaustedAt) / 1000 / 60;
  return elapsed >= searchState.retryAfterMinutes;
};

// Decide which provider to use right now
const getActiveProvider = () => {
  // If Tavily was exhausted but retry window passed, try it again
  if (searchState.tavilyExhausted && canRetry(searchState.tavilyExhaustedAt)) {
    console.log("[Search] Retrying Tavily after cooldown...");
    searchState.tavilyExhausted = false;
    searchState.tavilyExhaustedAt = null;
    searchState.current = SearchProvider.TAVILY;
  }

  // If Serper was exhausted but retry window passed, allow it again
  if (searchState.serperExhausted && canRetry(searchState.serperExhaustedAt)) {
    console.log("[Search] Serper cooldown passed, re-enabling as fallback.");
    searchState.serperExhausted = false;
    searchState.serperExhaustedAt = null;
  }

  return searchState.current;
};

// Mark a provider as exhausted and switch to the other
const markExhausted = (provider) => {
  if (provider === SearchProvider.TAVILY) {
    searchState.tavilyExhausted = true;
    searchState.tavilyExhaustedAt = Date.now();
    console.warn("[Search] Tavily exhausted — switching to Serper.");
    searchState.current = SearchProvider.SERPER;
  } else {
    searchState.serperExhausted = true;
    searchState.serperExhaustedAt = Date.now();
    console.warn("[Search] Serper exhausted — switching back to Tavily.");
    searchState.current = SearchProvider.TAVILY;
  }
};

// ── Tavily search ─────────────────────────────────────────────────────────────
const searchWithTavily = async (query) => {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",   // "advanced" costs 2 credits; "basic" costs 1
      max_results: 5,
      include_answer: true,    // Tavily can return a direct AI-generated answer
    }),
  });

  if (response.status === 429 || response.status === 402) {
    markExhausted(SearchProvider.TAVILY);
    throw new Error("EXHAUSTED");
  }
  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);

  const data = await response.json();
  const parts = [];

  if (data.answer) parts.push(`DIRECT ANSWER: ${data.answer}`);

  data.results?.slice(0, 4).forEach((r, i) => {
    parts.push(`[${i + 1}] ${r.title}\n${r.content}\nURL: ${r.url}`);
  });

  return parts.length ? parts.join("\n\n") : "No results found.";
};

// ── Serper search ─────────────────────────────────────────────────────────────
const searchWithSerper = async (query) => {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });

  if (response.status === 429 || response.status === 402) {
    markExhausted(SearchProvider.SERPER);
    throw new Error("EXHAUSTED");
  }
  if (!response.ok) throw new Error(`Serper HTTP ${response.status}`);

  const data = await response.json();
  const parts = [];

  if (data.answerBox) {
    parts.push(`DIRECT ANSWER: ${data.answerBox.answer || data.answerBox.snippet}`);
  }
  if (data.knowledgeGraph) {
    parts.push(`KNOWLEDGE: ${data.knowledgeGraph.title} — ${data.knowledgeGraph.description || ""}`);
  }
  data.organic?.slice(0, 4).forEach((r, i) => {
    parts.push(`[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`);
  });

  return parts.length ? parts.join("\n\n") : "No results found.";
};

// ── Smart search: tries active provider, falls back automatically ─────────────
const smartSearch = async (query) => {
  const primary = getActiveProvider();
  const secondary = primary === SearchProvider.TAVILY ? SearchProvider.SERPER : SearchProvider.TAVILY;

  // Try primary provider
  try {
    console.log(`[Search] Using ${primary} for: "${query}"`);
    if (primary === SearchProvider.TAVILY) return await searchWithTavily(query);
    return await searchWithSerper(query);
  } catch (err) {
    if (err.message !== "EXHAUSTED") {
      console.error(`[Search] ${primary} error:`, err.message);
    }
  }

  // Try secondary provider if primary failed/exhausted
  const secondaryExhausted =
    secondary === SearchProvider.TAVILY ? searchState.tavilyExhausted : searchState.serperExhausted;

  if (!secondaryExhausted) {
    try {
      console.log(`[Search] Falling back to ${secondary} for: "${query}"`);
      if (secondary === SearchProvider.TAVILY) return await searchWithTavily(query);
      return await searchWithSerper(query);
    } catch (err) {
      if (err.message !== "EXHAUSTED") {
        console.error(`[Search] ${secondary} error:`, err.message);
      }
    }
  }

  return "Search unavailable — both providers are currently exhausted. Please try again later.";
};

// ── TOOL: Web Search ──────────────────────────────────────────────────────────
const webSearchTool = tool(
  async ({ query }) => {
    try {
      return await smartSearch(query);
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  },
  {
    name: "web_search",
    description:
      "Search the internet for real-time information. Use for ANY factual question — exams, syllabus, news, prices, current events, sports, government info, etc. Always prefer this over training knowledge.",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
  }
);

// ── TOOL: Send Email ──────────────────────────────────────────────────────────
const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      await transporter.sendMail({
        from: `"AI Assistant" <${process.env.EMAIL_USER}>`,
        to, subject,
        text: body,
        html: body.replace(/\n/g, "<br>"),
      });
      return `Email sent to ${to} with subject "${subject}".`;
    } catch (err) {
      return `Failed to send email: ${err.message}`;
    }
  },
  {
    name: "send_email",
    description: "Send an email. Use when the user wants to send or compose an email.",
    schema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
    }),
  }
);

// ── TOOL: Weather ─────────────────────────────────────────────────────────────
const getWeatherTool = tool(
  async ({ location }) => {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return `Weather in ${d.name}, ${d.sys.country}:
- Condition: ${d.weather[0].description}
- Temp: ${d.main.temp}°C (feels like ${d.main.feels_like}°C)
- Humidity: ${d.main.humidity}%
- Wind: ${d.wind.speed} m/s`;
    } catch (err) {
      return `Weather fetch failed: ${err.message}`;
    }
  },
  {
    name: "get_weather",
    description: "Get real-time weather for any city.",
    schema: z.object({
      location: z.string().describe("City or location name"),
    }),
  }
);

// ── TOOL: Calculator ──────────────────────────────────────────────────────────
const calculateTool = tool(
  async ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().,% ]/g, "");
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Could not evaluate: "${expression}"`;
    }
  },
  {
    name: "calculate",
    description: "Evaluate math expressions accurately.",
    schema: z.object({
      expression: z.string().describe("Math expression e.g. '15% of 85000'"),
    }),
  }
);

// ── TOOL: Date/Time ───────────────────────────────────────────────────────────
const getDatetimeTool = tool(
  async ({ timezone }) => {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone || "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    }).format(new Date());
  },
  {
    name: "get_current_datetime",
    description: "Get current date and time. Use when the user asks about today's date or current time.",
    schema: z.object({
      timezone: z.string().optional().describe("IANA timezone. Defaults to IST."),
    }),
  }
);

// ── Tool registry ─────────────────────────────────────────────────────────────
const TOOLS = [webSearchTool, sendEmailTool, getWeatherTool, calculateTool, getDatetimeTool];
const modelWithTools = model.bindTools(TOOLS);
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ── Check if error is Groq's tool_use_failed (malformed function call) ────────
const isToolUseFailed = (error) =>
  error?.status === 400 &&
  error?.error?.error?.code === "tool_use_failed";

// ── Agentic loop (shared logic) ───────────────────────────────────────────────
const runAgenticLoop = async (lcMessages, boundModel) => {
  let response = await boundModel.invoke(lcMessages);

  while (response.tool_calls?.length) {
    const toolResults = await Promise.all(
      response.tool_calls.map(async (tc) => {
        const handler = TOOL_MAP[tc.name];
        const result = handler
          ? await handler.invoke(tc.args)
          : `Tool "${tc.name}" not available.`;
        return new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      })
    );

    lcMessages.push(response, ...toolResults);
    response = await boundModel.invoke(lcMessages);
  }

  return response.content?.trim() || "I couldn't generate a response. Please try again.";
};

// ── Generate AI Response ───────────────────────────────────────────────────────
export const generateResponse = async (messages) => {
  const lcMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...messages.map(toMessage).filter(Boolean),
  ];

  // ── Attempt 1: Full agentic loop with tools ──────────────────────────────
  try {
    return await runAgenticLoop([...lcMessages], modelWithTools);
  } catch (error) {
    // ── Groq tool_use_failed: model sent malformed function call (common with
    //    Hinglish/Hindi queries). Retry: manually search using last user message,
    //    inject result, then call plain model (no tools) to compose final answer.
    if (isToolUseFailed(error)) {
      console.warn("[Fallback] tool_use_failed detected — retrying with manual search.");
      try {
        // Extract the last user message to build a search query
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const fallbackQuery = lastUserMsg?.content ?? "general query";

        // Do the search ourselves so the model doesn't have to form a tool call
        const searchResult = await smartSearch(fallbackQuery);

        // Build a fresh prompt: give the model the search results directly
        const fallbackMessages = [
          new SystemMessage(
            `You are a helpful AI assistant. The user sent a message (possibly in Hindi/Hinglish). ` +
            `Below are real-time web search results fetched for their query. ` +
            `Use these results to give a clear, helpful answer. Respond in the same language the user used.\n\n` +
            `SEARCH RESULTS:\n${searchResult}`
          ),
          ...messages.map(toMessage).filter(Boolean),
        ];

        // Plain model call — no tools, so no risk of malformed tool call
        const response = await model.invoke(fallbackMessages);
        return response.content?.trim() || "I couldn't generate a response. Please try again.";
      } catch (fallbackError) {
        console.error("[Fallback] Manual search fallback also failed:", fallbackError.message);
        // Last resort: answer without search
        try {
          const response = await model.invoke(lcMessages);
          return response.content?.trim() || "I couldn't generate a response. Please try again.";
        } catch {
          throw new Error("AI response generation failed.");
        }
      }
    }

    // Any other error — rethrow
    console.error("generateResponse error:", error);
    throw new Error("AI response generation failed.");
  }
};

// ── Generate Chat Title ───────────────────────────────────────────────────────
export const generateChatTitle = async (message) => {
  try {
    const res = await titleModel.invoke([
      new SystemMessage("Generate a 2-5 word chat title. No emojis, quotes, or punctuation. Title case. Be specific."),
      new HumanMessage(`Title for: "${message}"`),
    ]);
    const title = res.content?.trim();
    return !title || title.split(" ").length > 8 ? "New Chat" : title;
  } catch {
    return "New Chat";
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────
const toMessage = (msg) => {
  if (msg.role === "user") return new HumanMessage(msg.content);
  if (msg.role === "ai")   return new AIMessage(msg.content);
  return null;
};