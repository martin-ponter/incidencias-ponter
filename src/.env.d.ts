/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SMTP_HOST: string;
  readonly SMTP_PORT: string;
  readonly SMTP_USER: string;
  readonly SMTP_PASS: string;
  readonly SMTP_FROM: string;

  readonly INTERNAL_REVIEWER_EMAIL: string;

  readonly SUPPORT_OFFICE: string;
  readonly SUPPORT_BITRIX: string;
  readonly SUPPORT_HARDWARE: string;
  readonly SUPPORT_CORREO: string;
  readonly SUPPORT_OTRO: string;

  readonly ALLOWED_EMAIL_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}