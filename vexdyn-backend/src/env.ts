/** Cloudflare Worker environment bindings and secrets. */
export type Env = {
  DB: D1Database

  /**
   * Brevo REST API key (header `api-key`).
   * This is NOT the SMTP credential (BREVO_SMTP_KEY).
   * Create at: Brevo → SMTP & API → API Keys.
   */
  BREVO_API_KEY: string

  /** Optional: existing SMTP key kept for reference; not used by this Worker. */
  BREVO_SMTP_KEY?: string

  /** e.g. "VEXDYN <hellovexdyn@gmail.com>" */
  EMAIL_FROM: string

  /** Base URL for links in emails, e.g. https://vexdyn.com */
  APP_BASE_URL: string

  /** Comma-separated CORS allowlist (confirmed VEXDYN product origins only). */
  ALLOWED_ORIGINS: string
}
