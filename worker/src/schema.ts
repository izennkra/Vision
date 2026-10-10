// Généré depuis worker/schema.sql : le serveur crée ses tables tout seul au premier démarrage
// (« IF NOT EXISTS » : sans effet si elles existent déjà).
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS clients ( id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL )",
  "CREATE TABLE IF NOT EXISTS videos ( id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', client_id TEXT, duration REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL, share_token TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, chunk_count INTEGER NOT NULL DEFAULT 0, thumbnail_key TEXT, view_count INTEGER NOT NULL DEFAULT 0, comment_count INTEGER NOT NULL DEFAULT 0, width INTEGER, height INTEGER, object_key TEXT NOT NULL, upload_id TEXT )",
  "CREATE INDEX IF NOT EXISTS videos_created ON videos (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS videos_client ON videos (client_id)",
  "CREATE TABLE IF NOT EXISTS parts ( video_id TEXT NOT NULL, idx INTEGER NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY (video_id, idx) )",
  "CREATE TABLE IF NOT EXISTS comments ( id TEXT PRIMARY KEY, video_id TEXT NOT NULL, parent_id TEXT, author_name TEXT NOT NULL, author_initials TEXT NOT NULL, text TEXT NOT NULL, timestamp REAL, created_at TEXT NOT NULL, by_owner INTEGER NOT NULL DEFAULT 0 )",
  "CREATE INDEX IF NOT EXISTS comments_video ON comments (video_id, created_at)",
  "CREATE TABLE IF NOT EXISTS views ( id TEXT PRIMARY KEY, video_id TEXT NOT NULL, viewer_id TEXT NOT NULL, viewer TEXT NOT NULL, started_at TEXT NOT NULL, watched_ratio REAL NOT NULL DEFAULT 0 )",
  "CREATE INDEX IF NOT EXISTS views_video ON views (video_id, started_at DESC)",
  "CREATE INDEX IF NOT EXISTS views_viewer ON views (viewer_id)",
  "CREATE TABLE IF NOT EXISTS notifications ( id TEXT PRIMARY KEY, type TEXT NOT NULL, video_id TEXT NOT NULL, video_title TEXT NOT NULL, actor TEXT NOT NULL, text TEXT, created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0 )",
  "CREATE INDEX IF NOT EXISTS notifications_created ON notifications (created_at DESC)",
  "CREATE TABLE IF NOT EXISTS transcript_chunks ( video_id TEXT NOT NULL, idx INTEGER NOT NULL, start REAL NOT NULL, status TEXT NOT NULL, language TEXT, cues TEXT NOT NULL DEFAULT '[]', voices TEXT, PRIMARY KEY (video_id, idx) )",
  "CREATE TABLE IF NOT EXISTS transcript_translations ( video_id TEXT NOT NULL, idx INTEGER NOT NULL, lang TEXT NOT NULL, cues TEXT NOT NULL, PRIMARY KEY (video_id, idx, lang) )",
  "CREATE TABLE IF NOT EXISTS renditions ( video_id TEXT NOT NULL, quality INTEGER NOT NULL, object_key TEXT NOT NULL, upload_id TEXT, status TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (video_id, quality) )",
  "CREATE TABLE IF NOT EXISTS rendition_parts ( video_id TEXT NOT NULL, quality INTEGER NOT NULL, idx INTEGER NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY (video_id, quality, idx) )",
]
