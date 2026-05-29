export default async (req, context) => {
    return new Response(
      JSON.stringify({
        issuer: "https://trumpp.dev",
        authorization_endpoint: "https://trumpp.dev/oauth/authorize",
        token_endpoint: "https://trumpp.dev/oauth/token",
        code_challenge_methods_supported: ["S256"]
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
    path: "/.well-known/oauth-authorization-server"
  };