export default async (req, context) => {
  return new Response(
    JSON.stringify({
      resource: "https://trumpp.dev",
      authorization_servers: []
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

export const config = {
  path: "/.well-known/oauth-protected-resource"
};