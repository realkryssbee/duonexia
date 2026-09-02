-- ============================================================================
-- Cockpit — 0001_init.sql
-- Socle V1 en lecture seule : les cinq tables exigées + leurs index.
--
-- Décisions d'architecture (commentées pour les deux associés) :
--   * Ids UUID (gen_random_uuid) plutôt que séquentiels : interchangeables
--     avec Supabase Auth le jour où on cloisonne par utilisateur.
--   * Valeurs de référence en slugs ASCII (pas d'accents, pas de casse) ;
--     les libellés d'affichage français vivent dans le code applicatif.
--   * Text + CHECK plutôt qu'enum Postgres : ajouter une valeur ne demande
--     pas de migration ALTER TYPE (créer le 7e vertical restera trivial).
--   * Aucune suppression en cascade sur clients -> projets : on archive,
--     on ne détruit jamais la donnée de pilotage.
--   * Dénormalisation assumée : projets.vertical est copié du client à la
--     création, pour que le reporting par vertical n'exige pas de jointure.
--   * "factures en attente" = montant_facture < montant_contractualise,
--     avec garde-fou montant_facture <= montant_contractualise. Retirer la
--     garde-fou le jour où on facture des périmètres au-delà du contrat.
--
-- Le type 'fake' (integrations/activites) est l'intégration factice qui
-- prouve que l'interface d'intégration tient : elle permet de faire vivre
-- le tableau de bord sans aucun jeton réel (voir 0002_seed_demo.sql).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CLIENTS — une entité par client du studio.
-- ---------------------------------------------------------------------------
create table clients (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,
  vertical              text not null check (vertical in (
                          'huissiers', 'secretariats_sociaux',
                          'achats_pharmaceutiques', 'coachs_sportifs',
                          'bien_etre', 'astrologie')),
  contact_principal     text,
  email                 text,
  telephone             text,
  date_dernier_contact  timestamptz,   -- maintenu manuellement en V1
  statut                text not null default 'actif' check (statut in (
                          'prospect', 'actif', 'suspendu', 'ancien')),
  notes                 text,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROJETS — l'unité centrale de pilotage.
-- ---------------------------------------------------------------------------
create table projets (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references clients (id)
                            on delete restrict,  -- on archive, on ne détruit pas
  nom                     text not null,
  vertical                text not null check (vertical in (
                            'huissiers', 'secretariats_sociaux',
                            'achats_pharmaceutiques', 'coachs_sportifs',
                            'bien_etre', 'astrologie')),
  statut                  text not null default 'en_cours' check (statut in (
                            'en_cours', 'en_pause', 'termine', 'archive')),
  depot_github            text,        -- slug "owner/repo", clé du mapping GitHub
  url_production          text,
  environnements          jsonb not null default '{}'::jsonb,
                            -- ex. {"production": {"url": "...", "region": "..."},
                            --      "preview": {"url": "..."}}
  montant_contractualise  numeric(12, 2) not null default 0 check (montant_contractualise >= 0),
  montant_facture         numeric(12, 2) not null default 0 check (montant_facture >= 0),
  date_debut              date,
  date_echeance           date,
  date_derniere_activite  timestamptz,  -- alimenté par le job de sync
                            -- (commits, déploiements) ; base des alertes 14 jours
  notes                   text,
  created_at              timestamptz not null default now(),
  check (montant_facture <= montant_contractualise)
);

-- ---------------------------------------------------------------------------
-- INTEGRATIONS — branchements projet <-> système externe.
-- metadata = dernier instantané "aperçu" horodaté produit par le module
-- d'intégration (ex. Vercel : {pulledAt, domains, project}) ; chaque module
-- documente sa structure dans son propre dossier.
-- ---------------------------------------------------------------------------
create table integrations (
  id                   uuid primary key default gen_random_uuid(),
  projet_id            uuid not null references projets (id) on delete cascade,
  type                 text not null check (type in (
                         'github', 'vercel', 'jira', 'supabase', 'nas',
                         'mail', 'fake')),
  identifiant_externe  text not null,  -- ex. "owner/repo" (GitHub), "prj_xxx" (Vercel)
  metadata             jsonb not null default '{}'::jsonb,
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (projet_id, type, identifiant_externe)  -- pas de branchement dupliqué
);

-- ---------------------------------------------------------------------------
-- ACTIVITES — flux consolidé : commits, déploiements, tickets, alertes.
-- On n'insère QUE des événements pour des projets connus.
-- fingerprint = empreinte de (source, projet, type, identifiant externe) :
-- rend le job de sync idempotent (relancer ne crée jamais de doublon).
-- ---------------------------------------------------------------------------
create table activites (
  id          bigint generated always as identity primary key,
  projet_id   uuid not null references projets (id) on delete cascade,
  source      text not null check (source in (
                'github', 'vercel', 'jira', 'supabase', 'nas', 'mail',
                'manuel', 'fake')),
  type        text not null check (type in (
                'commit', 'pull_request', 'deployment', 'issue', 'alerte',
                'manuel')),
  payload     jsonb not null default '{}'::jsonb,
                -- structure propre à chaque source, documentée dans le module
                -- (ex. github.commit : {sha, auteur, message, url})
  horodatage  timestamptz not null default now(),
  fingerprint text
);

-- ---------------------------------------------------------------------------
-- JOURNAL_OUTILS — trace de TOUT appel à un service externe.
-- Règle d'or : on insère une ligne en 'en_cours' AVANT l'appel, on la
-- referme (ok/erreur) après. Jamais de secret dans arguments/resultat.
-- ---------------------------------------------------------------------------
create table journal_outils (
  id          bigint generated always as identity primary key,
  outil       text not null,      -- ex. 'github.list_commits' (registre d'outils)
  arguments   jsonb not null default '{}'::jsonb,
  resultat    jsonb,              -- résumé structuré, jamais le corps brut volumineux
  duree_ms    integer,
  statut      text check (statut in ('en_cours', 'ok', 'erreur')),
  horodatage  timestamptz not null default now(),
  utilisateur text not null default 'system'  -- email de l'associé, ou 'system' (jobs)
);

-- ============================================================================
-- INDEX — sur les colonnes de filtrage et de tri.
-- Les données sont minuscules en V1, mais ces index servent les tris du
-- tableau de bord et les jointures dès la saisie manuelle, sans coût notable.
-- ============================================================================

create index idx_clients_vertical            on clients (vertical);
create index idx_clients_statut              on clients (statut);

create index idx_projets_client              on projets (client_id);
create index idx_projets_statut              on projets (statut);
create index idx_projets_vertical            on projets (vertical);
create index idx_projets_derniere_activite   on projets (date_derniere_activite desc);
create index idx_projets_echeance            on projets (date_echeance);

create index idx_integrations_projet         on integrations (projet_id);
create index idx_integrations_type           on integrations (type);

-- Flux du tableau de bord : chronologique par projet + flux global 48 h.
create index idx_activites_projet_horodatage on activites (projet_id, horodatage desc);
create index idx_activites_horodatage        on activites (horodatage desc);
create index idx_activites_source            on activites (source);
-- Déduplication du job de sync (fingerprint NULL pour la saisie manuelle).
create unique index ux_activites_source_fingerprint
  on activites (source, fingerprint) where fingerprint is not null;

create index idx_journal_horodatage on journal_outils (horodatage desc);
create index idx_journal_outil      on journal_outils (outil, horodatage desc);
