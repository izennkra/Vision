-- Qualités de lecture (720p, 480p) et archivage (créés aussi automatiquement par le serveur au démarrage).
ALTER TABLE videos ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS renditions (video_id TEXT NOT NULL, quality INTEGER NOT NULL, object_key TEXT NOT NULL, upload_id TEXT, status TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (video_id, quality));
CREATE TABLE IF NOT EXISTS rendition_parts (video_id TEXT NOT NULL, quality INTEGER NOT NULL, idx INTEGER NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY (video_id, quality, idx));
