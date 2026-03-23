import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();

  const nombre = String(body.nombre || "");
  const email = String(body.email || "");

  if (!nombre || !email) {
    return new Response(JSON.stringify({ ok: false }), { status: 400 });
  }

  // cookie sesión (simple pero efectiva)
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Set-Cookie": `bitrix_user=${encodeURIComponent(
        JSON.stringify({ nombre, email })
      )}; Path=/; HttpOnly; SameSite=Lax`,
      "Content-Type": "application/json",
    },
  });
};