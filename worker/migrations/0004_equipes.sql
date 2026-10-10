-- Équipe de chaque dossier client (ajoutée aussi automatiquement par le serveur au démarrage).
ALTER TABLE clients ADD COLUMN people TEXT NOT NULL DEFAULT '[]';
