// scripts/smoke-e2e.ts — recette de bout en bout de la V1, exécutée contre
// un serveur réel (`npm run dev` ou dist) et une base migrée + seedée.
//
// Ce script prouve que le socle tient : session, cloisonnement, lectures,
// recherche, journalisation et synchronisation idempotente. Il ne teste pas
// GitHub/Vercel réels (jetons absents en CI) : les intégrations 'fake' du
// seed suffisent à vérifier le contrat.
//
// Usage :
//   $env:DATABASE_URL=...  (non requis : on ne parle qu'à l'API)
//   $env:COCKPIT_API_URL='http://localhost:4000'
//   $env:COCKPIT_EMAIL='a@duonexia.be' ; $env:COCKPIT_PASSWORD='changez-moi'
//   npx tsx scripts/smoke-e2e.ts

const apiUrl = (process.env.COCKPIT_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const email = process.env.COCKPIT_EMAIL ?? 'a@duonexia.be';
const password = process.env.COCKPIT_PASSWORD ?? 'changez-moi';

let echecs = 0;
let jetons = 0;

function verifier(nom: string, condition: boolean, detail = ''): void {
  jetons += 1;
  if (condition) {
    console.log(`  ✓ ${nom}`);
  } else {
    echecs += 1;
    console.error(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

// Petit gestionnaire de cookie (l'API de session repose sur Set-Cookie).
let cookie = '';
async function requete(
  chemin: string,
  options: { methode?: string; corps?: unknown } = {}
): Promise<{ statut: number; corps: unknown }> {
  const reponse = await fetch(`${apiUrl}${chemin}`, {
    method: options.methode ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.corps !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: options.corps !== undefined ? JSON.stringify(options.corps) : undefined,
  });
  const setCookie = reponse.headers.get('set-cookie');
  if (setCookie) {
    const valeur = setCookie.split(';')[0];
    cookie = valeur.includes('=') && !valeur.endsWith('=') ? valeur : '';
  }
  const corps = await reponse.json().catch(() => null);
  return { statut: reponse.status, corps };
}

function objet(corps: unknown): Record<string, unknown> {
  return (corps ?? {}) as Record<string, unknown>;
}

async function main(): Promise<void> {
  console.log(`Recette E2E contre ${apiUrl} (${email})\n`);

  // --- 1. Santé publique ---------------------------------------------------
  const sante = await requete('/api/health');
  verifier('GET /api/health → 200', sante.statut === 200, `statut ${sante.statut}`);
  verifier('service "cockpit-server" annoncé', objet(sante.corps).service === 'cockpit-server');

  // --- 2. Cloisonnement : pas de données sans session ----------------------
  const sansSession = await requete('/api/dashboard');
  verifier('GET /api/dashboard sans session → 401', sansSession.statut === 401, `statut ${sansSession.statut}`);

  // --- 3. Connexion ----------------------------------------------------------
  const mauvais = await requete('/api/auth/login', {
    methode: 'POST',
    corps: { email, password: 'mauvais-mot-de-passe' },
  });
  verifier('POST login avec mauvais mot de passe → 401', mauvais.statut === 401);

  const connexion = await requete('/api/auth/login', {
    methode: 'POST',
    corps: { email, password },
  });
  verifier('POST login → 200 + cookie posé', connexion.statut === 200 && cookie !== '', `statut ${connexion.statut}`);

  const moi = await requete('/api/me');
  verifier('GET /api/me renvoie le bon email', objet(moi.corps).email === email);

  // --- 4. Tableau de bord ------------------------------------------------------
  const tableau = await requete('/api/dashboard');
  const tableauCorps = objet(tableau.corps);
  const projetsActifs = (tableauCorps.projetsActifs ?? []) as unknown[];
  const alertes = objet(tableauCorps.alertes ?? {});
  verifier('GET /api/dashboard → 200', tableau.statut === 200);
  verifier('projetsActifs est une liste (seed)', Array.isArray(projetsActifs) && projetsActifs.length >= 1);
  verifier('3 familles d’alertes présentes', ['projetsInactifs', 'echeancesProches', 'facturesEnAttente'].every((clef) => clef in alertes));
  const flux = (tableauCorps.flux48h ?? []) as unknown[];
  verifier('flux48h présent', Array.isArray(flux));

  // --- 5. Clients ---------------------------------------------------------------
  const clientsReponse = await requete('/api/clients');
  const clients = (objet(clientsReponse.corps).clients ?? []) as Array<Record<string, unknown>>;
  verifier('GET /api/clients → liste non vide (seed)', clients.length >= 1, `${clients.length} client(s)`);
  const client = clients[0] as { id: string };
  const clientVue = await requete(`/api/clients/${client.id}`);
  const clientCorps = objet(clientVue.corps);
  verifier('GET /api/clients/:id → fiche + projets + historique',
    clientVue.statut === 200 &&
      'client' in clientCorps &&
      'projets' in clientCorps &&
      'engagement' in clientCorps);

  // --- 6. Projets et cloisonnement ------------------------------------------------
  const projetsSansFiltre = await requete('/api/projets');
  verifier('GET /api/projets SANS client_id → 400 (cloisonnement)', projetsSansFiltre.statut === 400, `statut ${projetsSansFiltre.statut}`);

  const projetListe = await requete(`/api/projets?client_id=${client.id}`);
  const projets = (objet(projetListe.corps).projets ?? []) as Array<Record<string, unknown>>;
  verifier('GET /api/projets?client_id= → projets du client', projets.length >= 1);

  const projet = projets[0] as { id: string };
  const projetVue = await requete(`/api/projets/${projet.id}`);
  const projetCorps = objet(projetVue.corps);
  verifier('GET /api/projets/:id → fiche + intégrations + état financier',
    projetVue.statut === 200 &&
      'projet' in projetCorps &&
      'integrations' in projetCorps &&
      'etatFinancier' in projetCorps);

  const activitesProjet = await requete(`/api/projets/${projet.id}/activites?limit=50`);
  verifier('GET /api/projets/:id/activites → 200', activitesProjet.statut === 200);

  const sansProjet = await requete('/api/activites');
  verifier('GET /api/activites SANS projet_id → 400', sansProjet.statut === 400);

  // --- 7. Recherche transverse ------------------------------------------------------
  const recherche = await requete('/api/recherche?q=terra');
  const rechercheCorps = objet(recherche.corps);
  verifier('GET /api/recherche → groupes clients/projets/activites',
    recherche.statut === 200 &&
      ['clients', 'projets', 'activites'].every((clef) => clef in rechercheCorps));

  const tropCourte = await requete('/api/recherche?q=a');
  verifier('recherche < 2 caractères → 400', tropCourte.statut === 400);

  // --- 8. Registre d'outils -----------------------------------------------------------
  const outils = await requete('/api/outils');
  const listeOutils = (objet(outils.corps).outils ?? []) as unknown[];
  verifier('GET /api/outils → registre non vide', outils.statut === 200 && listeOutils.length >= 3, `${listeOutils.length} outils`);

  // --- 9. Synchronisation (fake) + idempotence ----------------------------------------
  const sync1 = await requete('/api/sync/run', { methode: 'POST' });
  const sync1Corps = objet(sync1.corps);
  // Le résumé agrège les événements reçus par branchement dans details.
  const details1 = (sync1Corps.details ?? []) as Array<{ evenementsRecus: number }>;
  const recus1 = details1.reduce((somme, detail) => somme + detail.evenementsRecus, 0);
  verifier('POST /api/sync/run → les intégrations fake sont sollicitées', sync1.statut === 200 && recus1 >= 3, `${recus1} événement(s) reçu(s)`);

  const sync2 = await requete('/api/sync/run', { methode: 'POST' });
  const sync2Corps = objet(sync2.corps);
  const inseres2 = Number(sync2Corps.evenementsInseres ?? -1);
  verifier('second passage → 0 insertion (déduplication fingerprint)', inseres2 === 0, `${inseres2} inséré(s)`);

  // --- 10. Journal d'audit ---------------------------------------------------------------
  const journal = await requete('/api/journal?limit=50');
  const entrees = (objet(journal.corps).entrees ?? []) as Array<Record<string, unknown>>;
  verifier('GET /api/journal → 200', journal.statut === 200, `statut ${journal.statut}`);
  verifier('réponse au format attendu {entrees:[…]}', Array.isArray(entrees));
  // Sans jeton GitHub/Vercel, la recette ne déclenche aucun appel externe réel :
  // le journal peut légitimement être vide ici. Le MÉCANISME d'écriture du
  // journal (en_cours → ok/erreur) est vérifié par scripts/test-journal.ts,
  // qui exécute le transport contre un serveur HTTP factice local.

  // --- 11. Session -----------------------------------------------------------------------
  const logout = await requete('/api/auth/logout', { methode: 'POST' });
  verifier('POST /api/auth/logout → 200', logout.statut === 200);
  const apresLogout = await requete('/api/dashboard');
  verifier('après logout, /api/dashboard → 401', apresLogout.statut === 401);

  console.log(`\nRésultat : ${jetons - echecs}/${jetons} vérifications OK${echecs > 0 ? `, ${echecs} échec(s)` : ''}`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Recette en échec technique :', error);
  process.exit(1);
});
