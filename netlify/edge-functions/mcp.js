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

const result = (id, result, opts) => reply({ jsonrpc: "2.0", id, result }, opts);
const rpcError = (id, code, message, opts) =>
  reply({ jsonrpc: "2.0", id, error: { code, message } }, opts);

export default async (req) => {
  const accept = req.headers.get("Accept") || "";
  const acceptsSse = accept.includes("text/event-stream");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", { acceptsSse });
  }

  const { id, method, params } = body;

  // Notifications (kein id-Feld, z.B. notifications/initialized) → 202 ohne Body.
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
};

export const config = { path: "/mcp" };
