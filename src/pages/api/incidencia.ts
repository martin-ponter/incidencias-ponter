import type { APIRoute } from "astro";
import type { Transporter } from "nodemailer";

export const prerender = false;

type IncidenciaBody = {
  nombre?: unknown;
  email?: unknown;
  departamento?: unknown;
  tipo?: unknown;
  prioridad?: unknown;
  asunto?: unknown;
  descripcion?: unknown;
  website?: unknown;
};

type Env = {
  SUPPORT_OFFICE?: string;
  SUPPORT_BITRIX?: string;
  SUPPORT_HARDWARE?: string;
  SUPPORT_CORREO?: string;
  SUPPORT_OTRO?: string;
  ALLOWED_EMAIL_DOMAIN?: string;
  INTERNAL_REVIEWER_EMAIL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

const env = import.meta.env as Env;

const SUPPORT_MAP: Record<string, string | undefined> = {
  office: env.SUPPORT_OFFICE,
  bitrix: env.SUPPORT_BITRIX,
  hardware: env.SUPPORT_HARDWARE,
  correo: env.SUPPORT_CORREO,
  otro: env.SUPPORT_OTRO,
};

function generarTicketId(): string {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INC-${fecha}-${random}`;
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function terminaConDominio(email: string, dominio: string): boolean {
  const sufijo = "@" + dominio;
  return email.slice(-sufijo.length) === sufijo;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { default: nodemailer } = await import("nodemailer");
    const body = (await request.json()) as IncidenciaBody;

    const nombre = String(body.nombre ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const departamento = String(body.departamento ?? "").trim();
    const tipo = String(body.tipo ?? "").trim().toLowerCase();
    const prioridad = String(body.prioridad ?? "").trim();
    const asunto = String(body.asunto ?? "").trim();
    const descripcion = String(body.descripcion ?? "").trim();
    const honeypot = String(body.website ?? "").trim();

    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!nombre || !email || !tipo || !asunto || !descripcion) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Faltan campos obligatorios.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!emailValido(email)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "El email no es válido.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const dominioPermitido = String(env.ALLOWED_EMAIL_DOMAIN ?? "")
      .trim()
      .toLowerCase();

    if (dominioPermitido && !terminaConDominio(email, dominioPermitido)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Debes usar tu correo corporativo @${dominioPermitido}.`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const soporteDestino = SUPPORT_MAP[tipo];
    if (!soporteDestino) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Tipo de incidencia no válido.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const reviewerEmail = String(env.INTERNAL_REVIEWER_EMAIL ?? "").trim();
    const smtpHost = String(env.SMTP_HOST ?? "").trim();
    const smtpPort = Number(env.SMTP_PORT ?? 587);
    const smtpUser = String(env.SMTP_USER ?? "").trim();
    const smtpPass = String(env.SMTP_PASS ?? "").trim();
    const smtpFrom = String(env.SMTP_FROM ?? "").trim();

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Faltan variables SMTP en el .env.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const ticketId = generarTicketId();

    const transporter: Transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const asuntoSeguro = escapeHtml(asunto);
    const nombreSeguro = escapeHtml(nombre);
    const emailSeguro = escapeHtml(email);
    const departamentoSeguro = escapeHtml(departamento || "No indicado");
    const tipoSeguro = escapeHtml(tipo);
    const prioridadSegura = escapeHtml(prioridad || "No indicada");
    const descripcionSegura = escapeHtml(descripcion).replace(/\n/g, "<br>");

    const subject = `[${ticketId}] ${asunto}`;

    const text = `
Nueva incidencia recibida

ID: ${ticketId}
Nombre: ${nombre}
Email: ${email}
Departamento: ${departamento || "No indicado"}
Tipo: ${tipo}
Prioridad: ${prioridad || "No indicada"}

Asunto:
${asunto}

Descripción:
${descripcion}
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Nueva incidencia recibida</h2>
        <p><strong>ID:</strong> ${ticketId}</p>
        <p><strong>Nombre:</strong> ${nombreSeguro}</p>
        <p><strong>Email:</strong> ${emailSeguro}</p>
        <p><strong>Departamento:</strong> ${departamentoSeguro}</p>
        <p><strong>Tipo:</strong> ${tipoSeguro}</p>
        <p><strong>Prioridad:</strong> ${prioridadSegura}</p>
        <p><strong>Asunto:</strong> ${asuntoSeguro}</p>
        <p><strong>Descripción:</strong></p>
        <p>${descripcionSegura}</p>
      </div>
    `;

    const ccList = [email, reviewerEmail].filter(Boolean).join(", ");

    await transporter.sendMail({
      from: `"Portal de Incidencias" <${smtpFrom}>`,
      to: soporteDestino,
      cc: ccList || undefined,
      replyTo: [email, reviewerEmail].filter(Boolean).join(", "),
      subject,
      text,
      html,
    });

    return new Response(JSON.stringify({ ok: true, ticketId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error enviando incidencia:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "No se pudo enviar la incidencia.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};