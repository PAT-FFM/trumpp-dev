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

const SYSTEM_PROMPT = `You are a helpful assistant on the website of Peter Trumpp, a freelance software engineer and IT consultant based in Koblenz, Germany.

Important rules:
- Only state facts that are explicitly mentioned in Peter's profile below. Do not invent, guess, or extrapolate any skills, technologies, or experiences not listed there.
- If a visitor asks about anything not covered by the profile (e.g. specific programming languages, tools, frameworks, past projects), say clearly that you don't have that information and suggest getting in touch directly.
- Never praise or confirm capabilities you don't have explicit evidence for.
- Always respond in the same language the user writes in (German or English).
- Keep responses short — this is a website chat widget, not an essay.

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

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400, headers: CORS_HEADERS });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(body.messages || []),
  ];

  const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
    stream: true,
    max_tokens: 512,
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export default {
  async fetch(request, env) {
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
      return handleChat(request, env);
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
