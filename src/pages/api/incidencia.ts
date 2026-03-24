import type { APIRoute } from "astro";
import type { Transporter } from "nodemailer";

export const prerender = false;

type IncidenciaBody = {
  nombre?: unknown;
  email?: unknown;
  telefono?: unknown;
  departamento?: unknown;
  tipo?: unknown;
  prioridad?: unknown;
  asunto?: unknown;
  descripcion?: unknown;
  anydesk?: unknown;
  colectiva?: unknown;
  website?: unknown;
};

type Env = {
  SUPPORT_EMAIL_OFFICE?: string;
  SUPPORT_CARPETAS?: string;
  SUPPORT_MEETPHONE?: string;
  SUPPORT_IMPRESORA?: string;
  SUPPORT_REDES?: string;
  SUPPORT_CONFIG_USUARIO?: string;
  SUPPORT_REMOTO?: string;
  SUPPORT_UBYQUO?: string;
  ALLOWED_EMAIL_DOMAIN?: string;
  INTERNAL_REVIEWER_EMAIL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  BITRIX_WEBHOOK_URL?: string;
  BITRIX_ENTITY_TYPE_ID?: string;
};

const env = import.meta.env as Env;

const SUPPORT_MAP: Record<string, string | undefined> = {
  email_office: env.SUPPORT_EMAIL_OFFICE,
  carpetas: env.SUPPORT_CARPETAS,
  meetphone: env.SUPPORT_MEETPHONE,
  impresora: env.SUPPORT_IMPRESORA,
  redes: env.SUPPORT_REDES,
  config_usuario: env.SUPPORT_CONFIG_USUARIO,
  remoto: env.SUPPORT_REMOTO,
  ubyquo: env.SUPPORT_UBYQUO,
};

const BITRIX_FIELDS = {
  nombre: "ufCrm21_1774008231",
  email: "ufCrm21_1774008300",
  telefono: "ufCrm21_1774009219",
  departamento: "ufCrm21_1774009235",
  tipo: "ufCrm21_1774009251",
  prioridad: "ufCrm21_1774009277",
  colectiva: "ufCrm21_1774009458",
  asunto: "ufCrm21_1774009494",
  descripcion: "ufCrm21_1774009571",
  ticketIdExterno: "ufCrm21_1774009604",
  emailSoporteDestino: "ufCrm21_1774009639",
};

const BITRIX_ENUMS_TIPO: Record<string, string> = {
  email_office: "4782",
  carpetas: "4783",
  meetphone: "4784",
  impresora: "4785",
  redes: "4786",
  config_usuario: "4787",
  remoto: "4788",
  ubyquo: "4805",
};

const BITRIX_ENUMS_PRIORIDAD: Record<string, string> = {
  baja: "4789",
  media: "4790",
  alta: "4791",
};

const EMAIL_INTRO_TEXT = `Buenos días, Les notificamos la siguiente incidencia por la que solicitamos su asistencia: `;

const EMAIL_INTRO_HTML = `
  <p>Buenos días,</p>
  <p>Les notificamos la siguiente incidencia por la que solicitamos su asistencia:</p>
`;

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

function valorBooleano(valor: unknown): boolean {
  if (typeof valor === "boolean") return valor;

  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();
    return (
      normalizado === "true" ||
      normalizado === "1" ||
      normalizado === "on" ||
      normalizado === "sí" ||
      normalizado === "si"
    );
  }

  if (typeof valor === "number") return valor === 1;

  return false;
}

async function crearIncidenciaEnBitrix(params: {
  ticketId: string;
  nombre: string;
  email: string;
  telefono: string;
  departamento: string;
  tipo: string;
  prioridad: string;
  asunto: string;
  descripcion: string;
  anydesk: string;
  colectiva: boolean;
  soporteDestino: string;
}): Promise<void> {
  const webhookUrl = String(env.BITRIX_WEBHOOK_URL ?? "").trim();
  const entityTypeId = Number(env.BITRIX_ENTITY_TYPE_ID ?? 0);

  if (!webhookUrl || !entityTypeId) {
    throw new Error(
      "Faltan BITRIX_WEBHOOK_URL o BITRIX_ENTITY_TYPE_ID en el .env."
    );
  }

  const prioridadNormalizada = params.prioridad.trim().toLowerCase();
  const tipoEnumId = BITRIX_ENUMS_TIPO[params.tipo];
  const prioridadEnumId = BITRIX_ENUMS_PRIORIDAD[prioridadNormalizada];

  if (!tipoEnumId) {
    throw new Error(`No existe mapeo Bitrix para el tipo "${params.tipo}".`);
  }

  if (params.prioridad && !prioridadEnumId) {
    throw new Error(
      `No existe mapeo Bitrix para la prioridad "${params.prioridad}".`
    );
  }

  const descripcionBitrix = [
    params.descripcion,
    "",
    `Número de AnyDesk: ${params.anydesk || "No indicado"}`,
  ].join("\n");

  const payload = {
    entityTypeId,
    fields: {
      title: `[${params.ticketId}] ${params.asunto}`,
      opened: "Y",
      [BITRIX_FIELDS.nombre]: params.nombre,
      [BITRIX_FIELDS.email]: params.email,
      [BITRIX_FIELDS.telefono]: params.telefono || "",
      [BITRIX_FIELDS.departamento]: params.departamento || "",
      [BITRIX_FIELDS.tipo]: tipoEnumId,
      [BITRIX_FIELDS.prioridad]: prioridadEnumId || null,
      [BITRIX_FIELDS.colectiva]: params.colectiva ? 1 : 0,
      [BITRIX_FIELDS.asunto]: params.asunto,
      [BITRIX_FIELDS.descripcion]: descripcionBitrix,
      [BITRIX_FIELDS.ticketIdExterno]: params.ticketId,
      [BITRIX_FIELDS.emailSoporteDestino]: params.soporteDestino,
      xmlId: params.ticketId,
    },
  };

  const response = await fetch(`${webhookUrl}crm.item.add.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Bitrix no pudo crear la incidencia."
    );
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { default: nodemailer } = await import("nodemailer");
    const body = (await request.json()) as IncidenciaBody;

    const nombre = String(body.nombre ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const telefono = String(body.telefono ?? "").trim();
    const departamento = String(body.departamento ?? "").trim();
    const tipo = String(body.tipo ?? "").trim().toLowerCase();
    const prioridad = String(body.prioridad ?? "").trim();
    const asunto = String(body.asunto ?? "").trim();
    const descripcion = String(body.descripcion ?? "").trim();
    const anydesk = String(body.anydesk ?? "").trim();
    const colectiva = valorBooleano(body.colectiva);
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
    const telefonoSeguro = escapeHtml(telefono || "No indicado");
    const departamentoSeguro = escapeHtml(departamento || "No indicado");
    const tipoSeguro = escapeHtml(tipo);
    const prioridadSegura = escapeHtml(prioridad || "No indicada");
    const colectivaSegura = colectiva ? "Sí" : "No";
    const anydeskSeguro = escapeHtml(anydesk || "No indicado");
    const descripcionSegura = escapeHtml(descripcion).replace(/\n/g, "<br>");

    const subject = `${colectiva ? "[COLECTIVA] " : ""}[${ticketId}] ${asunto}`;

    const text = `
${EMAIL_INTRO_TEXT}
ID: ${ticketId}
Nombre: ${nombre}
Email: ${email}
Teléfono de contacto: ${telefono || "No indicado"}
Departamento: ${departamento || "No indicado"}
Tipo: ${tipo}
Prioridad: ${prioridad || "No indicada"}
Colectiva: ${colectiva ? "Sí" : "No"}
Número de AnyDesk: ${anydesk || "No indicado"}
Asunto: ${asunto}
Descripción: ${descripcion}
    `.trim();

    const html = `
<div style="font-family: Arial, sans-serif; line-height: 1.5;">
  ${EMAIL_INTRO_HTML}
  <h2>Nueva incidencia recibida</h2>
  ${
    colectiva
      ? `<p style="color:#b91c1c; font-weight:bold;">⚠ Incidencia colectiva</p>`
      : ""
  }
  <p><strong>ID:</strong> ${ticketId}</p>
  <p><strong>Nombre:</strong> ${nombreSeguro}</p>
  <p><strong>Email:</strong> ${emailSeguro}</p>
  <p><strong>Teléfono de contacto:</strong> ${telefonoSeguro}</p>
  <p><strong>Departamento:</strong> ${departamentoSeguro}</p>
  <p><strong>Tipo:</strong> ${tipoSeguro}</p>
  <p><strong>Prioridad:</strong> ${prioridadSegura}</p>
  <p><strong>Colectiva:</strong> ${colectivaSegura}</p>
  <p><strong>Número de AnyDesk:</strong> ${anydeskSeguro}</p>
  <p><strong>Asunto:</strong> ${asuntoSeguro}</p>
  <p><strong>Descripción:</strong></p>
  <p>${descripcionSegura}</p>
</div>
    `;

    const ccList = [email, reviewerEmail].filter(Boolean).join(", ");
    const replyToList = [email, reviewerEmail].filter(Boolean).join(", ");

    await transporter.sendMail({
      from: `"Portal de Incidencias" <${smtpFrom}>`,
      to: soporteDestino,
      cc: ccList || undefined,
      replyTo: replyToList || undefined,
      subject,
      text,
      html,
    });

    await crearIncidenciaEnBitrix({
      ticketId,
      nombre,
      email,
      telefono,
      departamento,
      tipo,
      prioridad,
      asunto,
      descripcion,
      anydesk,
      colectiva,
      soporteDestino,
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
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la incidencia.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};