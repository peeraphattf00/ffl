declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LINE_CHANNEL_TOKEN?: string;
    LINE_CHANNEL_SECRET?: string;
    LINE_GROUP_ID?: string;
  }
}
