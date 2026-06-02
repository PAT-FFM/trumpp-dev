import CV from './cv.md';

const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

const PROFILE = {
  name: "Peter Trumpp",
  jobTitle: "Freelance Software Engineer & IT-Consultant",
  location: "Koblenz, Germany — remote & hybrid throughout DACH",
  services: [
    "Software architecture consulting",
    "AI integration for existing products and teams",
    "IT consulting: requirements, architecture decisions, stakeholder alignment",
  ],
  approach:
    "Peter Trumpp asks the questions others skip. He digs until all stakeholders share the same understanding — because misaligned assumptions are where projects quietly go wrong.",
  availability: "Open to mandates of any size, including single consulting sessions.",
  contact: {
    email: "info@trumpp.dev",
    web: "https://trumpp.dev",
    linkedin: "https://www.linkedin.com/in/peter-trumpp-8487b0243/",
  },
};

const TOOLS = [
  {
    name: "get_profile",
    description:
      "Returns structured profile information about Peter Trumpp: services, approach, contact details, and availability.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

const SYSTEM_PROMPT = `You are the chat assistant on Peter Trumpp's website — not a generic helper, but a reflection of how Peter himself would talk in a first client call.

## Voice & tone
You speak directly, with dry wit and genuine curiosity. No filler phrases, no sales talk, no hollow enthusiasm. You're warm but not effusive. When something is clever, you might say so. When something is vague, you say that too.

## How you engage
When a visitor describes a problem or project, your first instinct is to ask one clarifying question — not to immediately offer solutions. Peter's trademark: dig until everyone in the room shares the same mental model. Don't pepper people with multiple questions; pick the one that matters most.

## What you believe
You genuinely believe most software projects fail from miscommunication, not technical problems. You'll say so if it fits the conversation. You're mildly skeptical of AI hype but deeply optimistic about AI done right — and you'll distinguish between the two if asked.

## Personal touches
You have a soft spot for Koblenz and the Rhine. If someone mentions the city or the region, let that show briefly before getting back to business. You also have a thing for Maulbronn — if it comes up, you're genuinely curious whether the visitor has been there.

## Hard rules
- Only state facts explicitly mentioned in Peter's profile and CV below. Never invent, guess, or extrapolate skills, technologies, or past projects.
- If something isn't covered: don't say "I don't have that information." Say something like "That's a good one for Peter directly — I'm just the warm-up act." Then offer the contact.
- Never praise or confirm capabilities you have no evidence for.
- Always respond in the same language the visitor writes in (German or English).
- Keep responses short. 2–3 sentences max, rarely more. This is a chat widget, not a blog post. If you catch yourself writing a fourth sentence: stop, cut, send.
- If the topic is completely off-topic (not software, IT, AI, consulting, or projects), turn it around with a light question: 'Have you been to Koblenz yet?', 'What do you think about Adobe products?', or similar.
- If a visitor is rude or hostile: stay friendly, stop engaging with the substance, and sign off with a randomly made-up quote attributed to a fictional person.

Contact: info@trumpp.dev | LinkedIn: https://www.linkedin.com/in/peter-trumpp-8487b0243/

Peter's profile and CV:
${CV}`;

function reply(payload, { acceptsSse, sessionId } = {}) {
  const headers = { ...CORS_HEADERS, "Mcp-Protocol-Version": PROTOCOL_VERSION };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  if (acceptsSse) {
    headers["Content-Type"] = "text/event-stream";
    headers["Cache-Control"] = "no-cache";
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, { headers });
  }
  headers["Content-Type"] = "application/json";
  return new Response(JSON.stringify(payload), { headers });
}

const result = (id, res, opts) => reply({ jsonrpc: "2.0", id, result: res }, opts);
const rpcError = (id, code, message, opts) =>
  reply({ jsonrpc: "2.0", id, error: { code, message } }, opts);

const ALLOWED_ORIGINS = new Set([
  "https://trumpp.dev",
  "https://www.trumpp.dev",
]);

async function handleChat(request, env, ctx) {
  // Nur Anfragen von der eigenen Domain bedienen – verhindert Browser-Missbrauch
  // des Workers als kostenloser LLM-Proxy von fremden Seiten.
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400, headers: CORS_HEADERS });
  }

  const sessionId = body.sessionId || null;
  const userMessage = [...(body.messages || [])].reverse().find(m => m.role === "user")?.content || "";
  const country = request.cf?.country || null;
  const city = request.cf?.city || null;
  const userAgent = request.headers.get("User-Agent");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(body.messages || []),
  ];

  const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
    stream: true,
    max_tokens: 200,
  });

  const [clientStream, logStream] = stream.tee();

  ctx.waitUntil(
    (async () => {
      const reader = logStream.getReader();
      const decoder = new TextDecoder();
      let buf = "", assistantText = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try { const t = JSON.parse(data).response; if (t) assistantText += t; } catch {}
          }
        }
      } catch {}
      await fetch(`${env.SUPABASE_URL}/rest/v1/chat_logs`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_message: userMessage,
          assistant_message: assistantText,
          country,
          city,
          user_agent: userAgent,
        }),
      });
    })()
  );

  return new Response(clientStream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    const accept = request.headers.get("Accept") || "";
    const acceptsSse = accept.includes("text/event-stream");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === "/chat") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
      }
      return handleChat(request, env, ctx);
    }

    if (request.method === "GET") {
      return new Response(": connected\n\n", {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Mcp-Protocol-Version": PROTOCOL_VERSION,
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return rpcError(null, -32700, "Parse error", { acceptsSse });
    }

    const { id, method, params } = body;

    if (id === undefined) {
      return new Response(null, { status: 202, headers: CORS_HEADERS });
    }

    if (method === "initialize") {
      const requested = params?.protocolVersion;
      const version = SUPPORTED_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
      return result(
        id,
        {
          protocolVersion: version,
          capabilities: { tools: {} },
          serverInfo: { name: "trumpp-dev-mcp", version: "1.0.0" },
        },
        { acceptsSse, sessionId: crypto.randomUUID() }
      );
    }

    if (method === "tools/list") {
      return result(id, { tools: TOOLS }, { acceptsSse });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      if (toolName === "get_profile") {
        return result(
          id,
          { content: [{ type: "text", text: JSON.stringify(PROFILE, null, 2) }] },
          { acceptsSse }
        );
      }
      return rpcError(id, -32602, `Unknown tool: ${toolName}`, { acceptsSse });
    }

    return rpcError(id, -32601, `Method not found: ${method}`, { acceptsSse });
  },
};
