-- Séparation des voix dans la transcription (ajoutée aussi automatiquement par le serveur au démarrage).
ALTER TABLE transcript_chunks ADD COLUMN voices TEXT;
