-- Ordre des dossiers et réglages du propriétaire (créés aussi automatiquement par le serveur au démarrage).
ALTER TABLE clients ADD COLUMN position REAL;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
