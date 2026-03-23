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
};

const BITRIX_ENUMS_PRIORIDAD: Record<string, string> = {
  baja: "4789",
  media: "4790",
  alta: "4791",
};

const EMAIL_INTRO_TEXT = `Buenos días,

Les notificamos la siguiente incidencia por la que solicitamos su asistencia:
`;

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

async function crearIncidenciaEnBitrix(params: any): Promise<void> {
  const webhookUrl = String(env.BITRIX_WEBHOOK_URL ?? "").trim();
  const entityTypeId = Number(env.BITRIX_ENTITY_TYPE_ID ?? 0);

  if (!webhookUrl || !entityTypeId) {
    throw new Error("Faltan variables Bitrix");
  }

  const payload = {
    entityTypeId,
    fields: {
      title: `[${params.ticketId}] ${params.asunto}`,
      opened: "Y",
      [BITRIX_FIELDS.nombre]: params.nombre,
      [BITRIX_FIELDS.email]: params.email,
      [BITRIX_FIELDS.telefono]: params.telefono || "",
      [BITRIX_FIELDS.departamento]: params.departamento || "",
      [BITRIX_FIELDS.tipo]: BITRIX_ENUMS_TIPO[params.tipo],
      [BITRIX_FIELDS.prioridad]:
        BITRIX_ENUMS_PRIORIDAD[params.prioridad?.toLowerCase()] || null,
      [BITRIX_FIELDS.colectiva]: params.colectiva ? 1 : 0,
      [BITRIX_FIELDS.asunto]: params.asunto,
      [BITRIX_FIELDS.descripcion]: params.descripcion,
      [BITRIX_FIELDS.ticketIdExterno]: params.ticketId,
      [BITRIX_FIELDS.emailSoporteDestino]: params.soporteDestino,
    },
  };

  await fetch(`${webhookUrl}crm.item.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const session = cookies.get("bitrix_user");

    if (!session) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Acceso no autorizado (solo desde Bitrix)",
        }),
        { status: 401 }
      );
    }

    const user = JSON.parse(session.value);

    const { default: nodemailer } = await import("nodemailer");
    const body = (await request.json()) as IncidenciaBody;

    // 🔐 SOLO confiar en Bitrix
    const nombre = user.nombre;
    const email = user.email;

    const telefono = String(body.telefono ?? "").trim();
    const departamento = String(body.departamento ?? "").trim();
    const tipo = String(body.tipo ?? "").trim().toLowerCase();
    const prioridad = String(body.prioridad ?? "").trim();
    const asunto = String(body.asunto ?? "").trim();
    const descripcion = String(body.descripcion ?? "").trim();
    const anydesk = String(body.anydesk ?? "").trim();
    const colectiva = valorBooleano(body.colectiva);

    if (!tipo || !asunto || !descripcion) {
      return new Response(JSON.stringify({ ok: false, error: "Campos faltantes" }), { status: 400 });
    }

    const soporteDestino = SUPPORT_MAP[tipo];

    if (!soporteDestino) {
      return new Response(JSON.stringify({ ok: false, error: "Tipo inválido" }), { status: 400 });
    }

    const ticketId = generarTicketId();

    const transporter: Transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT ?? 587),
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    const text = `
${EMAIL_INTRO_TEXT}

ID: ${ticketId}
Nombre: ${nombre}
Email: ${email}
Teléfono: ${telefono}
Departamento: ${departamento}

${descripcion}
`;

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: soporteDestino,
      subject: `[${ticketId}] ${asunto}`,
      text,
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

    return new Response(JSON.stringify({ ok: true, ticketId }));

  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};