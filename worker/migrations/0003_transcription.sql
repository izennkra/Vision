-- Transcription et traductions (créées aussi automatiquement par le serveur au démarrage).
ALTER TABLE videos ADD COLUMN audio_chunks INTEGER;
CREATE TABLE IF NOT EXISTS transcript_chunks (video_id TEXT NOT NULL, idx INTEGER NOT NULL, start REAL NOT NULL, status TEXT NOT NULL, language TEXT, cues TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (video_id, idx));
CREATE TABLE IF NOT EXISTS transcript_translations (video_id TEXT NOT NULL, idx INTEGER NOT NULL, lang TEXT NOT NULL, cues TEXT NOT NULL, PRIMARY KEY (video_id, idx, lang));
