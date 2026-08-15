declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    UPLOADS: R2Bucket;
    INITIAL_ADMIN_PASSWORD?: string;
  }
}
