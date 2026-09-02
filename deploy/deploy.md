# Cockpit — Guide de déploiement (Vercel + VPS)

Objectif : interface sur **Vercel**, API sur un **VPS** derrière nginx en
HTTPS. Les deux partagent le domaine racine `duonexia.be` (indispensable pour
le cookie de session `SameSite=Lax`) :

| Côté | Adresse | Hébergement |
|---|---|---|
| Interface | `https://cockpit.duonexia.be` | Vercel (statique, dossier `web/`) |
| API | `https://api.duonexia.be` | VPS (Node, dossier `server/`) |

---

## 1. Côté Vercel (interface)

1. Import du dépôt sur Vercel.
2. **Root Directory** : `web`.
3. Framework preset : *Vite* (détection auto). Build : `npm ci && npm run build` — sortie `dist`.
4. Variable d'environnement :
   ```
   VITE_API_URL=https://api.duonexia.be
   ```
5. Domaine personnalisé : `cockpit.duonexia.be` (DNS chez ton registrar).

> Aucun secret ici : l'interface ne contient que l'adresse de l'API.

## 2. Côté VPS (API)

### 2.1 Provisionner

```bash
# Débian/Ubuntu, en root
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx ufw curl git

# Node 20 LTS (nodesource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # >= 20.6 attendu
```

### 2.2 Utilisateur dédié + code

```bash
useradd --create-home --shell /bin/bash cockpit
mkdir -p /opt/cockpit && chown cockpit:cockpit /opt/cockpit
su - cockpit
git clone <URL-DU-DEPOT> /opt/cockpit      # ou copie manuelle
cd /opt/cockpit/server
npm ci
npm run build
npm prune --omit=dev       # retire tsx/typescript en production
exit
```

### 2.3 Environnement de production

```bash
cp /opt/cockpit/server/.env.example /opt/cockpit/server/.env
chmod 600 /opt/cockpit/server/.env
nano /opt/cockpit/server/.env
```

Valeurs attendues (différences par rapport au dev) :

```ini
NODE_ENV=production
HOST=127.0.0.1          # uniquement accessible via nginx
PORT=4000

DATABASE_URL=postgresql://postgres.XXXX:mdp@db.XXXX.supabase.co:5432/postgres
PGSSLMODE=require       # ou verify-full si la chaîne Supabase l'exige

COCKPIT_USERS=a@duonexia.be:motdepasse-fort;b@duonexia.be:motdepasse-fort
COCKPIT_SESSION_SECRET=<48 caractères aléatoires>

# Cookie Secure : activé automatiquement car NODE_ENV=production.
WEB_ORIGINS=https://cockpit.duonexia.be

RUN_JOBS=true
SYNC_CRON=*/15 * * * *

GITHUB_TOKEN=github_pat_…
VERCEL_TOKEN=vcp_…
VERCEL_TEAM_ID=team_…        # obligatoire si projets sous équipe
```

### 2.4 Migrations

La base est Supabase (distante) : on migre **depuis sa machine de dev**,
jamais depuis le VPS (le VPS n'a pas besoin des scripts de migration).

```bash
# machine de dev, dossier server/
$env:DATABASE_URL='postgresql://…' ; $env:PGSSLMODE='require'
npm run db:migrate
```

### 2.5 Service + nginx + HTTPS

```bash
cp deploy/cockpit.service /etc/systemd/system/cockpit.service
systemctl daemon-reload
systemctl enable --now cockpit
systemctl status cockpit        # doit être active (running)

cp deploy/cockpit.nginx.conf /etc/nginx/sites-available/cockpit
ln -s /etc/nginx/sites-available/cockpit /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d api.duonexia.be
```

### 2.6 Pare-feu

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'        # 80 + 443
ufw enable
ufw status                    # 4000 ne doit PAS être ouvert
```

### 2.7 Vérification finale

```bash
curl https://api.duonexia.be/api/health
# {"status":"ok","service":"cockpit-server","lectureSeule":true}

# Connexion + premier sync réel
curl -c /tmp/c.txt -X POST https://api.duonexia.be/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"email":"a@duonexia.be","password":"…"}'
curl -b /tmp/c.txt -X POST https://api.duonexia.be/api/sync/run
# résumé : branchements OK, événements insérés
```

Puis ouvre `https://cockpit.duonexia.be` : connexion, tableau de bord,
premier projet, page Journal.

---

## 3. Opérations courantes

| Action | Commande |
|---|---|
| Voir les logs API | `journalctl -u cockpit -f` |
| Redémarrer l'API | `systemctl restart cockpit` |
| Mettre à jour le code | `su - cockpit` → `git pull && cd server && npm ci && npm run build` → `systemctl restart cockpit` |
| Sauvegarde de la base | Supabase → Table Editor / `pg_dump` vers un fichier, hebdomadaire |
| Vérifier la traçabilité | `GET /api/journal?limit=50` (ou page Journal de l'interface) |

## 4. Dépannage spécifique

- **Cookie absent en navigation** : interface et API doivent partager le même
  domaine racine (`duonexia.be`) ; vérifier `VITE_API_URL` et `WEB_ORIGINS`.
- **401 après connexion** : session expirée (`SESSION_TTL_HOURS`) ou
  `COCKPIT_SESSION_SECRET` changé (invalide les sessions signées).
- **Sync en échec** : lire `journal_outils` (page Journal) — jeton révoqué,
  `owner/repo` mal orthographié, `VERCEL_TEAM_ID` manquant, quota API dépassé.
- **Certificat** : `certbot renew --dry-run` pour vérifier le renouvellement.
