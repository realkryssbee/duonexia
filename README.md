# Cockpit — poste de pilotage Duonexia

**Socle V1 : lecture seule, fiable, déployable.** Une couche unique de lecture
au-dessus de GitHub, Vercel, Supabase et (plus tard) Jira, le NAS et la
messagerie — sans aucune action mutante sur les systèmes externes.

> Document de référence : `../cockpit-specification.md` (spec) et
> `../business-plan.md` (contexte et arbitrage RGPD sur les modèles).

---

## 1. Vue d'ensemble

Trois couches strictement séparées :

```
┌────────────────────────────────────────────────────────────┐
│  INTERFACE  web/  (React 18 + Vite + Tailwind, sur Vercel)  │
│  Ne connaît QUE l'API du backend. Aucun secret.             │
└──────────────────────────┬─────────────────────────────────┘
                           │  HTTPS / JSON (cookie de session)
┌──────────────────────────▼─────────────────────────────────┐
│  ORCHESTRATION  server/  (Node + Fastify, sur VPS)          │
│  Détient tous les secrets · registre d'outils · journal     │
│  intégral · permissions · ModelRouter (jamais d'appel       │
│  fournisseur direct)                                        │
└──────────────────────────┬─────────────────────────────────┘
                           │  HttpTransport journalisée (lecture seule)
┌──────────────────────────▼─────────────────────────────────┐
│  INTÉGRATIONS  server/src/integrations/                     │
│  Un module par service derrière IntegrationService :        │
│  GitHub · Vercel · fake (module factice)                    │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  Supabase (Postgres managé)
                  db/migrations/0001_init.sql
```

**Règle d'or du socle** : la V1 ne peut rien casser. L'API expose des lectures,
une connexion, et un déclencheur de synchronisation qui n'écrit que dans la
base interne.

---

## 2. Arborescence

```
cockpit/
├─ README.md                        ← ce document
├─ docs/inventaire-reel.md          # gabarit de saisie des clients/projets réels
├─ deploy/                          # déploiement : systemd, nginx, checklist
├─ db/
│  ├─ migrations/0001_init.sql      # schéma réel (5 tables + index)
│  └─ seeds/demo.sql                # données de démo, dev uniquement (db:seed)
├─ server/                          # ORCHESTRATION + INTÉGRATIONS
│  ├─ .env.example                  # chaque variable documentée
│  ├─ package.json / tsconfig.json
│  ├─ scripts/run-migrations.ts     # db:migrate (schéma) / db:seed (démo)
│  └─ src/
│     ├─ index.ts                   # boot : env → pool → scheduler → API
│     ├─ config/env.ts              # validation stricte de l'environnement
│     ├─ types.ts                   # formes de lignes de la base
│     ├─ db/pool.ts                 # pool pg (Supabase, modes SSL)
│     ├─ db/queries.ts              # toutes les requêtes SQL de lecture
│     ├─ http/
│     │  ├─ server.ts               # Fastify, contextes public/protégé
│     │  ├─ auth.ts                 # session cookie signée HMAC (HttpOnly)
│     │  ├─ helpers.ts
│     │  └─ routes/                 # dashboard, clients, projets, activites,
│     │                             # recherche, journal, outils, sync, auth
│     ├─ orchestration/
│     │  ├─ journal.ts              # journal_outils : ouvre/ferme chaque appel
│     │  ├─ registry.ts             # registre d'outils (source de vérité)
│     │  ├─ permissions.ts          # intentions explicites d'agrégation
│     │  ├─ transports.ts           # HttpTransport journalisée (aux modules)
│     │  ├─ context-builder.ts      # V2 : donnée externe ≠ instruction
│     │  └─ model/
│     │     ├─ model-router.ts      # INTERFACE ModelRouter (signature stable)
│     │     ├─ policy.ts            # routage sensibilité / complexité / budget
│     │     ├─ providers/anthropic.ts    # impl. 1 — propriétaire (non sensible)
│     │     ├─ providers/deepseek-eu.ts  # impl. 2 — poids ouverts, inférence UE
│     │     └─ index.ts             # usine : createModelRouter()
│     ├─ integrations/
│     │  ├─ integration.ts          # INTERFACE IntegrationService + HttpTransport
│     │  ├─ index.ts                # usine type → module (seul point à toucher)
│     │  ├─ github/                 # dépôts, commits, PR, branches actives
│     │  ├─ vercel/                 # déploiements, statut, domaines
│     │  └─ fake/                   # module factice (prouve l'interface)
│     └─ jobs/
│        ├─ scheduler.ts            # node-cron (RUN_JOBS, SYNC_CRON)
│        └─ sync-activities.ts      # intégrations → activites (dédupliqué)
└─ web/                             # INTERFACE (React 18 + Vite + Tailwind)
   ├─ .env.example                  # VITE_API_URL (seule variable)
   ├─ package.json / tsconfig.json / vite.config.ts
   ├─ tailwind.config.js / postcss.config.js / index.html
   └─ src/
      ├─ main.tsx / App.tsx         # session → connexion ou pages
      ├─ api/client.ts              # le SEUL contact avec le backend
      ├─ auth/AuthContext.tsx       # état de session global
      ├─ components/                # Layout, ui, ActiviteItem…
      ├─ lib/                       # format fr-BE, libellés, messages activité
      ├─ pages/                     # Dashboard, Clients, Client, Projet, Recherche
      └─ types.ts                   # contrats des réponses API
```

---

## 3. Démarrage rapide (développement)

Prérequis : Node ≥ 20.6, npm, un projet **Supabase** (n'importe quel plan —
la base n'est utilisée que comme Postgres managé).

### 3.1 La base

1. Dans Supabase (Dashboard → Project Settings → Database), copiez la
   **Connection string (URI)**.
2. `cd server && cp .env.example .env`, renseignez `DATABASE_URL`,
   `COCKPIT_USERS`, `COCKPIT_SESSION_SECRET` (≥ 24 caractères).
3. Appliquez le schéma (et, en développement seulement, le jeu de démo) :
   ```bash
   cd server
   npm install
   npm run db:migrate        # schéma réel : db/migrations/*.sql, dans l'ordre
   npm run db:seed           # OPTIONNEL (dev) : données de démonstration
   ```
   Le runner est idempotent (table `schema_migrations`). Le seed ne se lance
   **jamais** en production. Vous pouvez aussi coller les fichiers SQL dans
   l'éditeur SQL de Supabase, dans l'ordre.

### 3.2 Le serveur

```bash
cd server
npm run dev                  # tsx watch, port 4000
curl http://localhost:4000/api/health
```

Sans jeton GitHub/Vercel, le serveur démarre : le job de synchronisation
ignore proprement les branchements sans jeton (visible dans `journal_outils`).
Les intégrations `fake` du jeu de démonstration produisent un flux d'activité
sans aucun jeton.

### 3.3 L'interface

```bash
cd web
cp .env.example .env.local   # rien à changer en dev : proxy Vite
npm install
npm run dev                  # http://localhost:5173
```

Connectez-vous avec un des comptes de `COCKPIT_USERS` (ex. par défaut
`a@duonexia.be` / `changez-moi` — à changer !).

### 3.4 Déclencher la synchronisation à la main

Depuis l'interface : bouton **« Synchroniser maintenant »** du tableau de bord
(résumé affiché : branchements OK, événements insérés, échecs). En ligne de
commande :

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"email":"a@duonexia.be","password":"changez-moi"}'
curl -b cookies.txt -X POST http://localhost:4000/api/sync/run
```

Chaque appel externe est tracé dans `journal_outils` : consultez-le depuis
l'interface (menu **Journal**) ou via `GET /api/journal?limit=20`.

### 3.5 Recettes de validation (optionnel)

Deux scripts prouvent que le socle tient, contre un serveur réel et une base
migrée + seedée (`db/migrations`). Ils ne requièrent aucun jeton réel (les
intégrations `fake` du seed suffisent) :

```bash
# 1. Recette de bout en bout : session, cloisonnement, lectures, recherche,
#    sync idempotente, journal (26 vérifications)
$env:COCKPIT_API_URL='http://localhost:4000'   # serveur déjà lancé
npx tsx scripts/smoke-e2e.ts

# 2. Mécanisme de journalisation (transport contre un serveur HTTP factice)
$env:DATABASE_URL='…' ; $env:PGSSLMODE='require'
npx tsx scripts/test-journal.ts
```

Exemple de base de test jetable avec Docker :

```bash
docker run -d --name cockpit-pg-test -p 55432:5432 \
  -e POSTGRES_USER=cockpit -e POSTGRES_PASSWORD=cockpit-test -e POSTGRES_DB=cockpit \
  postgres:16-alpine
$env:DATABASE_URL='postgresql://cockpit:cockpit-test@localhost:55432/cockpit'
$env:PGSSLMODE='disable'
npm run db:migrate && npm run db:seed && npm run dev
```

---

## 4. API (V1)

Toutes les routes sont sous `/api`, en lecture seule, derrière le cookie de
session (sauf `/api/health` et `/api/auth/login`).

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | état du service (public) |
| POST | `/api/auth/login` | connexion (public, pose le cookie) |
| POST | `/api/auth/logout` | déconnexion |
| GET | `/api/me` | session courante |
| GET | `/api/dashboard` | alertes + projets actifs + flux 48 h *(agrégat voulu)* |
| GET | `/api/clients?vertical=&statut=` | registre des clients |
| GET | `/api/clients/:id` | fiche + projets + historique + engagement |
| GET | `/api/projets?client_id=` | projets d'un client *(client_id obligatoire)* |
| GET | `/api/projets/:id` | fiche projet + intégrations + état financier |
| GET | `/api/projets/:id/activites?limit=` | activité du projet |
| GET | `/api/projets/:id/integrations` | branchements + aperçus |
| GET | `/api/activites?projet_id=&depuis=` | flux ciblé sur un projet |
| GET | `/api/recherche?q=` | recherche transverse *(agrégat voulu)* |
| GET | `/api/journal?outil=&limit=` | journal d'audit des appels d'outils |
| GET | `/api/outils` | registre d'outils exposé par l'orchestrateur |
| POST | `/api/sync/run` | synchronisation manuelle (écritures internes) |

**Cloisonnement par client** : le tableau de bord, la recherche, le journal
et le registre d'outils sont les seuls points d'agrégation multi-clients —
l'« intention explicite » exigée par la spec (vérifiée par
`requireAggregateIntention`). Toute autre lecture passe par une entité
(`client_id`, `/projets/:id`).

---

## 5. Synchronisation (GitHub + Vercel)

Le job (toutes les 15 min par défaut, `SYNC_CRON`) parcourt les lignes de
`integrations` **actives** :

1. `fetchActivities` du module → commits (GitHub) / déploiements (Vercel) ;
2. insertion dans `activites`, **dédupliquée** par empreinte
   `sha256(type:projet:type_activite:id_externe)` — relancer ne crée aucun
   doublon (index unique partiel) ;
3. mise à jour de `projets.date_derniere_activite` (base des alertes 14 j) ;
4. rafraîchissement de l'**aperçu** dans `integrations.metadata` :
   - GitHub → `{pulledAt, repo, openPullRequests, activeBranches}` ;
   - Vercel → `{pulledAt, project, domains}`.

Structure des payloads d'activité (V1) :

```jsonc
// activites.payload, github (type commit)
{ "sha": "…", "message": "feat: …", "auteur": { "nom": "…", "email": "…" }, "url": "…" }
// activites.payload, vercel (type deployment)
{ "deploymentId": "dpl_…", "url": "…", "environnement": "production", "etat": "READY" }
// activites.payload, saisie manuelle (source manuel, type manuel)
{ "texte": "Point hebdo…", "auteur": "a@duonexia.be" }
```

### Saisie manuelle (recommandée en attendant la V2 d'édition)

Utilisez l'**éditeur de table** de Supabase ou des `INSERT` SQL : c'est la
méthode prévue par la spec pour la première saisie des quinze projets
(« schéma + saisie manuelle »). Le seed `db/seeds/demo.sql` (via `npm run
db:seed`, dev uniquement) montre le format exact (montants en `numeric`,
`environnements` en jsonb).

---

## 6. Sécurité — comment c'est appliqué

| Exigence | Où c'est appliqué |
|---|---|
| Aucun secret dans le code ni le frontend | `server/.env` uniquement ; l'interface n'a que `VITE_API_URL` ; secrets résolus et validés dans `config/env.ts` |
| Tout appel externe journalisé | `orchestration/transports.ts` : les modules ne font **jamais** de fetch eux-mêmes, ils reçoivent une `HttpTransport` qui ouvre/ferme `journal_outils` (`en_cours` → `ok`/`erreur`) |
| Contenu externe = donnée, jamais instruction | `orchestration/context-builder.ts` : balises `<donnee source=…>`, prompt système d'ignorance, pas de concaténation brute dans le prompt système (V2) |
| Cloisonnement par client | `orchestration/permissions.ts` + routes : seuls 5 points d'agrégation explicites ; listes de projets soumises à `client_id` |
| Aucun appel fournisseur direct | `ModelRouter` (interface stable) + `PolicyRouter` : la sensibilité `client/sensitive` est **refusée** si aucun routeur UE n'est configuré |
| Session | cookie `HttpOnly` `SameSite=Lax`, signé HMAC, durée `SESSION_TTL_HOURS` ; pas de secret dans le bundle |

### RGPD et routeur de modèles (décision structurante)

Les verticaux huissiers / secrétariats sociaux manipulent des données
sensibles. L'API officielle DeepSeek étant opérée depuis la Chine, la politique
de routage (`policy.ts`) n'envoie **jamais** de donnée client vers un routeur
hors UE : `DEEPSEEK_EU_BASE_URL` doit pointer vers un fournisseur d'inférence
européen (OpenAI-compatible). Sans lui, une tâche sur données client est
refusée, pas redirigée. Les deux implémentations (`anthropic`, `deepseek-eu`)
existent derrière la même interface ; la V1 ne les appelle pas (lecture seule,
pas d'agent).

---

## 7. Ajouter un service externe (Jira, Supabase, NAS, messagerie)

1. **Module** : créer `server/src/integrations/<service>/` implémentant
   `IntegrationService` (interface dans `integration.ts`) + un fichier
   `tool-names.ts` (noms canoniques des outils).
2. **Usine** : une ligne dans `integrations/index.ts`.
3. **Schéma** : ajouter le type aux contraintes `integrations.type` et
   `activites.source` (migration `0003_…`).
4. **Enregistrer les branchements** dans la table `integrations`
   (`projet_id`, `type`, `identifiant_externe`, `actif`).

Aucune modification des couches Interface ni Orchestration. Le module factice
`integrations/fake/` est l'exemple minimal à reproduire.

## 8. Ajouter un fournisseur de modèles (V2)

1. Implémenter `ModelRouter` dans
   `server/src/orchestration/model/providers/<fournisseur>.ts`.
2. L'ajouter à l'usine `model/index.ts` (avec ses variables d'environnement,
   documentées dans `.env.example`).
3. La politique de routage s'en sert sans modification — c'est le contrat.

---

## 9. Déploiement

> La procédure complète et vérifiable vit dans **`deploy/deploy.md`**
> (fichiers prêts à l'emploi : `deploy/cockpit.service`, `deploy/cockpit.nginx.conf`).

### 9.1 Interface — Vercel

- Repo → import du dossier `web/` (ou racine du repo avec `web` comme
  racine de build : `npm install`, `npm run build`, output `dist`).
- Variables : `VITE_API_URL=https://api.votre-domaine.be` (voir 9.3 pour le
  cookie inter-domaines).

### 9.2 Serveur — VPS (exemple systemd)

```ini
# /etc/systemd/system/cockpit.service
[Unit]
Description=Cockpit API (Duonexia)
After=network.target

[Service]
WorkingDirectory=/opt/cockpit/server
ExecStart=/usr/bin/node dist/index.js
EnvironmentFile=/opt/cockpit/server/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
cd server && npm ci && npm run build
sudo systemctl enable --now cockpit
```

Derrière nginx/Caddy en TLS (`trustProxy` est activé). Les migrations se
lancent depuis une machine de dev (`npm run db:migrate`) : la base est
dans Supabase, distante.

### 9.3 Cookies entre Vercel et le VPS

Le cookie de session est `SameSite=Lax` : il voyage si l'interface et l'API
partagent le **même domaine racine**. Exemple recommandé :
`cockpit.duonexia.be` (Vercel, `VITE_API_URL=https://api.duonexia.be`) et
`api.duonexia.be` (VPS). Mettez `NODE_ENV=production` (cookie `Secure`) et
ajoutez l'origine de l'interface à `WEB_ORIGINS`.

---

## 10. Limites de la V1 et suite

- **Lecture seule** : aucune édition depuis l'interface (saisie manuelle par
  SQL/éditeur Supabase), aucun déclencheur d'action sur les systèmes externes.
- **Pas d'agent** : le `ModelRouter`, le registre d'outils et le
  context-builder sont posés, testés au typage, mais non exposés.
- **Recherche** par `ILIKE` (suffisant à cette échelle ; passer à `pg_trgm`
  si besoin).
- V2 : conversation, génération de livrables, actions confirmées ; V3 :
  veille (SSL, sauvegardes, dépendances), rituels hebdomadaires — voir la
  spec §2.

## 11. Dépannage

| Symptôme | Cause probable / remède |
|---|---|
| Le serveur refuse de démarrer | variable manquante dans `.env` (message explicite) ou base injoignable |
| Pas de flux dans le tableau de bord | `RUN_JOBS=false` ? intégrations inactives ? jeton absent (lire `GET /api/journal`) |
| `sync/run` : échec GitHub 401 | jeton invalide ou permissions `repo:read` manquantes |
| L'interface reste sur la page de connexion | `COCKPIT_USERS` ne contient pas le compte, ou cookie bloqué (voir 9.3) |
| La page affiche 401 en navigation | session expirée : reconnectez-vous |
