-- Réglages de partage : public / privé, code d'accès, personnes invitées.
-- (Le serveur applique aussi ces changements tout seul au démarrage.)
ALTER TABLE videos ADD COLUMN access TEXT NOT NULL DEFAULT 'public';
ALTER TABLE videos ADD COLUMN access_code TEXT;
ALTER TABLE videos ADD COLUMN people TEXT NOT NULL DEFAULT '[]';
