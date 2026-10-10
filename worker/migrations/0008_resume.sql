-- Résumé automatique (ajouté aussi automatiquement par le serveur au démarrage).
ALTER TABLE videos ADD COLUMN summary TEXT;
ALTER TABLE videos ADD COLUMN summary_state TEXT;
