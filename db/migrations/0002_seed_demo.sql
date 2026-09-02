-- ============================================================================
-- Cockpit — 0002_seed_demo.sql
-- Jeu de données de DÉMONSTRATION (environnement de dev uniquement).
--
-- Idempotent : les ids sont fixes, chaque insert passe par ON CONFLICT DO
-- NOTHING. Vous pouvez donc le relancer sans risque.
--
-- Ce jeu est conçu pour réveiller immédiatement le tableau de bord :
--   * des échéances dans les 7 jours et une échéance dépassée  -> alerte
--   * des projets sans activité depuis > 14 jours              -> alerte
--   * des factures partielles (montant_facture < contractualisé) -> alerte
--   * deux intégrations de type 'fake' : le job de sync produit un flux
--     d'activité sans aucun jeton GitHub/Vercel réel.
-- Les intégrations github/vercel sont présentes mais inactives : passez-les
-- à actif = true et renseignez les jetons pour brancher le monde réel.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CLIENTS (6 verticaux couverts)
-- ---------------------------------------------------------------------------
insert into clients (id, nom, vertical, contact_principal, email, telephone,
                     date_dernier_contact, statut, notes) values
  ('10000000-0000-0000-0000-000000000001', 'Étude Maillard & Fils',
   'huissiers', 'Claire Maillard', 'c.maillard@etude-maillard.be',
   '+32 2 111 11 11', now() - interval '2 days', 'actif',
   'Vertical prioritaire. Contrat de maintenance 420 EUR/mois depuis janvier 2026.'),
  ('10000000-0000-0000-0000-000000000002', 'Secrétariat Social Horizon',
   'secretariats_sociaux', 'Thomas Verhoeven', 't.verhoeven@ss-horizon.be',
   '+32 2 222 22 22', now() - interval '6 days', 'actif',
   'RGPD strict : aucune donnée de paie hors UE.'),
  ('10000000-0000-0000-0000-000000000003', 'PharmaCare Group',
   'achats_pharmaceutiques', 'Inès De Smet', 'ines@pharmacare-group.be',
   '+32 9 333 33 33', now() - interval '20 days', 'actif',
   'Plateforme de commande mutualisée, secteur réglementé (AFMPS).'),
  ('10000000-0000-0000-0000-000000000004', 'Léa Moreau Coaching',
   'coachs_sportifs', 'Léa Moreau', 'lea@moreau-coaching.be',
   '+32 477 44 44 44', now() - interval '1 day', 'actif', null),
  ('10000000-0000-0000-0000-000000000005', 'Institut Zen & Spa',
   'bien_etre', 'Sarah Janssens', 'sarah@zen-spa.be',
   '+32 2 555 55 55', now() - interval '35 days', 'suspendu',
   'Suspendu : projet réservation en pause, relance à programmer.'),
  ('10000000-0000-0000-0000-000000000006', 'AstroLune Média',
   'astrologie', 'Nicolas Petit', 'nicolas@astrolune.media',
   '+32 471 66 66 66', now() - interval '1 day', 'actif',
   'Gros volume de génération de textes, faible sensibilité.'),
  ('10000000-0000-0000-0000-000000000007', 'Cabinets Associés De Vos',
   'huissiers', 'Marc De Vos', 'marc@cabinet-devos.be',
   '+32 4 777 77 77', now() - interval '60 days', 'prospect',
   'Audit de cadrage envoyé, en attente de retour.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PROJETS
-- ---------------------------------------------------------------------------
insert into projets (id, client_id, nom, vertical, statut, depot_github,
                     url_production, environnements, montant_contractualise,
                     montant_facture, date_debut, date_echeance,
                     date_derniere_activite, notes) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Terra Sense — extraction de dossiers', 'huissiers', 'en_cours',
   'duonexia/terra-sense', 'https://terra-sense.vercel.app',
   '{"production": {"url": "https://terra-sense.vercel.app", "region": "bru1"}}'::jsonb,
   18500.00, 9250.00, '2026-01-12', (now() + interval '5 days')::date,
   now() - interval '3 hours',
   'Projet de référence : le test d''acceptation du Cockpit, « où en est Terra Sense ? », doit répondre en une phrase.'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'Suivi de créances — générateur de courriers', 'huissiers', 'en_cours',
   'duonexia/suivi-creances', 'https://creances.etude-maillard.be',
   '{"production": {"url": "https://creances.etude-maillard.be"}}'::jsonb,
   12400.00, 12400.00, '2025-11-03', (now() + interval '30 days')::date,
   now() - interval '1 day',
   'Facturé en intégralité. Phase 2 (relances intelligentes) en discussion.'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   'Tri des e-mails entrants', 'secretariats_sociaux', 'en_pause',
   'duonexia/ss-horizon-triage', 'https://triage.ss-horizon.be',
   '{"production": {"url": "https://triage.ss-horizon.be"}}'::jsonb,
   15800.00, 11850.00, '2026-01-05', (now() + interval '25 days')::date,
   now() - interval '21 days',
   'En pause (disponibilité client). Aucune activité depuis 3 semaines : à relancer.'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002',
   'Extraction de fiches de paie', 'secretariats_sociaux', 'en_cours',
   'duonexia/ss-horizon-paie', 'https://paie.ss-horizon.be',
   '{"production": {"url": "https://paie.ss-horizon.be", "region": "bru1"}}'::jsonb,
   22000.00, 0.00, '2026-02-02', (now() + interval '3 days')::date,
   now() - interval '2 days',
   'Acompte à encaisser. Échéance serrée : livraison du socle extraction.'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003',
   'Plateforme de commande groupée', 'achats_pharmaceutiques', 'en_cours',
   'duonexia/pharmacare-commande', 'https://commande.pharmacare-group.be',
   '{"production": {"url": "https://commande.pharmacare-group.be"}, "staging": {"url": "https://staging.commande.pharmacare-group.be"}}'::jsonb,
   38500.00, 30800.00, '2025-10-20', (now() - interval '2 days')::date,
   now() - interval '30 hours',
   'Échéance dépassée de 2 jours : signature du PV de réception en attente côté client.'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004',
   'Générateur de programmes fitness', 'coachs_sportifs', 'en_cours',
   'duonexia/lea-fitness', 'https://programmes.moreau-coaching.be',
   '{"production": {"url": "https://programmes.moreau-coaching.be"}}'::jsonb,
   6800.00, 5100.00, '2026-01-18', (now() + interval '45 days')::date,
   now() - interval '6 hours',
   'Maintenance mensuelle 120 EUR incluse dans le forfait.'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005',
   'Réservation en ligne de l''institut', 'bien_etre', 'termine',
   'duonexia/zen-resa', 'https://resa.zen-spa.be',
   '{"production": {"url": "https://resa.zen-spa.be"}}'::jsonb,
   5400.00, 5400.00, '2025-09-01', '2025-12-20',
   now() - interval '70 days',
   'Terminé. Relance d''un contrat de maintenance en cours.'),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000006',
   'Réseau de sites astro + textes personnalisés', 'astrologie', 'en_cours',
   'duonexia/astrolune-sites', 'https://www.astrolune.media',
   '{"production": {"url": "https://www.astrolune.media"}}'::jsonb,
   9200.00, 6900.00, '2025-12-01', (now() + interval '60 days')::date,
   now() - interval '9 hours',
   'Volume important, données non sensibles : bon candidat aux modèles d''inférence UE.'),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000005',
   'Contenu SEO bien-être', 'bien_etre', 'en_pause',
   'duonexia/zen-seo', null,
   '{}'::jsonb,
   2400.00, 2400.00, '2025-10-01', '2026-02-15',
   now() - interval '40 days',
   'Suspendu avec le client ; facturé intégralement.'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000003',
   'Comparateur de prix catalogue', 'achats_pharmaceutiques', 'en_cours',
   'duonexia/pharmacare-prix', null,
   '{"preview": {"url": "https://pharmacare-prix-git-preview.vercel.app"}}'::jsonb,
   7600.00, 3800.00, '2026-02-10', (now() + interval '20 days')::date,
   now() - interval '26 hours',
   'Première tranche livrée en preview.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- INTEGRATIONS
-- Deux intégrations 'fake' actives : le job de sync (15 min) produit un flux
-- d'activité de démonstration sans jeton. Les branchements réels GitHub et
-- Vercel sont pré-enregistrés mais inactifs : activez-les (actif = true) et
-- renseignez les jetons dans l''environnement du serveur.
-- ---------------------------------------------------------------------------
insert into integrations (id, projet_id, type, identifiant_externe, metadata, actif) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'fake', 'demo-terra-sense', '{"objet": "flux de démonstration Terra Sense"}'::jsonb, true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004',
   'fake', 'demo-paie', '{"objet": "flux de démonstration extraction paie"}'::jsonb, true),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002',
   'github', 'duonexia/suivi-creances', '{}'::jsonb, false),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000006',
   'vercel', 'prj_lea_fitness', '{}'::jsonb, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ACTIVITES — saisie manuelle de démonstration (48 dernières heures, pour
-- peupler le flux du tableau de bord sans attendre le premier job de sync).
-- Le reste du flux sera produit par les intégrations 'fake'.
-- ---------------------------------------------------------------------------
insert into activites (projet_id, source, type, payload, horodatage, fingerprint) values
  ('20000000-0000-0000-0000-000000000002', 'manuel', 'manuel',
   '{"texte": "Point hebdomadaire avec l''étude Maillard : validation du jeu de courriers.", "auteur": "a@duonexia.be"}'::jsonb,
   now() - interval '26 hours', null),
  ('20000000-0000-0000-0000-000000000005', 'manuel', 'manuel',
   '{"texte": "Relance PharmaCare : signature du PV de réception.", "auteur": "a@duonexia.be"}'::jsonb,
   now() - interval '30 hours', null),
  ('20000000-0000-0000-0000-000000000004', 'manuel', 'manuel',
   '{"texte": "Livraison du socle d''extraction : démo à préparer pour jeudi.", "auteur": "b@duonexia.be"}'::jsonb,
   now() - interval '2 days', null),
  ('20000000-0000-0000-0000-000000000006', 'manuel', 'manuel',
   '{"texte": "Ajout du module de programmes « running débutant » au catalogue.", "auteur": "b@duonexia.be"}'::jsonb,
   now() - interval '40 hours', null)
on conflict do nothing;
