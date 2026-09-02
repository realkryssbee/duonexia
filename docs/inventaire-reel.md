# Cockpit — Inventaire réel (à remplir)

Document de travail **interne** pour la saisie des clients, projets et
branchements réels dans Supabase (Table Editor ou SQL, en s'inspirant de
`db/seeds/demo.sql`, appliqué en dev par `npm run db:seed`).

Rappel des slugs autorisés (contraintes SQL) :

- `vertical` : `huissiers` · `secretariats_sociaux` · `achats_pharmaceutiques` · `coachs_sportifs` · `bien_etre` · `astrologie`
- `clients.statut` : `prospect` · `actif` · `suspendu` · `ancien`
- `projets.statut` : `en_cours` · `en_pause` · `termine` · `archive`

---

## 1. Clients

| nom | vertical | contact_principal | email | telephone | date_dernier_contact | statut | notes (engagement récurrent, RGPD…) |
|---|---|---|---|---|---|---|---|
| Ex. : Étude Maillard | huissiers | Claire Maillard | c.maillard@… | +32 2 … | 2026-08-25 | actif | Contrat maintenance 420 €/mois |
| | | | | | | | |
| | | | | | | | |

## 2. Projets

| nom | client_id* | vertical | statut | depot_github (`owner/repo`) | url_production | montant_contractualise | montant_facture | date_debut | date_echeance | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |
| | | | | | | | | | | |

\* `client_id` : coller l'uuid du client de la table 1 (visible dans Supabase → Table Editor).

## 3. Branchements externes (table `integrations`)

Remplir après le tableau 2 (besoin des `projet_id`). Une ligne par système
branché au projet. `actif` = true.

| projet_id* | type | identifiant_externe | actif |
|---|---|---|---|
| | `github` | `owner/repo` — ex. `realkryssbee/Secretariat-social-HR` | true |
| | `vercel` | id du projet Vercel — ex. `prj_…` (plus fiable que le nom) | true |

\* coller l'uuid du projet.

---

## 4. Référence des systèmes découverts (compte realkryssbee — à révoquer et recréer)

> Ces listes servent de mémo pour le mapping ; aucun secret ici.

**Dépôts GitHub accessibles** : `optima-mind-v2`, `Task-manager`, `pontarika`,
`estethichiennes`, `learning-Ai`, `Secretariat-social-HR`, `RH`,
`Odoo_design_balsat`, `Odoo_design_exercice`, `WebKryss`, `website-builder`,
`Vehicle-management-system`.

**Projets Vercel** (ids disponibles dans le tableau de bord Vercel ou via
l'API) : `optima-mind`, `optima-mind-v2`, `optima-mind-v3`, `optima-mind-v4`,
`optima-mind-v5`, `task-manager`, `task-manager_2`, `pontarika`,
`learning-ai`, `kryssbee-learning` — le tout sous l'équipe
`realkryssbee-6635s-projects` (`VERCEL_TEAM_ID` à renseigner côté serveur).

**Pistes de couverture verticale** (à confirmer — simple aide-mémoire) :
`Secretariat-social-HR` / `RH` semblent relever des secrétariats sociaux ;
`pontarika` et `estethichiennes` à rattacher selon le client réel ;
`optima-mind-*` et `task-manager*` probablement des produits internes ou
clients — décision du studio.

---

## 5. Après la saisie

1. Relancer la synchronisation : bouton « Synchroniser maintenant » du
   tableau de bord (ou `POST /api/sync/run`).
2. Vérifier la page Journal : les appels `github.*` / `vercel.*` passent en `ok`.
3. Vérifier la vue projet : aperçu PR ouvertes / branches actives / domaines.
4. Purger les données de démonstration si le seed 0002 a été appliqué :
   ```sql
   truncate activites, integrations, journal_outils;
   delete from projets;   -- vider projets AVANT clients (contrainte restrict)
   delete from clients;
   ```
