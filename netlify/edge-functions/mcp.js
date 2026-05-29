const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function jsonRpc(id, result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function jsonRpcError(id, code, message) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}

export default async (req) => {
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
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  if (method === "initialize") {
    return jsonRpc(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "trumpp-dev-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return jsonRpc(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    if (toolName === "get_profile") {
      return jsonRpc(id, {
        content: [{ type: "text", text: JSON.stringify(PROFILE, null, 2) }],
      });
    }
    return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
};

export const config = { path: "/mcp" };
