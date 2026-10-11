/** Server-Konfiguration aus Umgebungsvariablen. */
export interface ServerConfig {
  port: number;
  /** Development/Test Mode – darf in Produktion NICHT gesetzt sein. */
  devMode: boolean;
  /** Erlaubte Origins für CORS (kommagetrennt), leer = gleiche Origin. */
  corsOrigins: string[];
  /** Verzeichnis mit dem gebauten Frontend (optional). */
  staticDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3001),
    devMode: env.ORLAN_DEV_MODE === 'true',
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    staticDir: env.STATIC_DIR ?? null,
  };
}
