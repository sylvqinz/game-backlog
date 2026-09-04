# Game Backlog 

MVP statique pour publier un backlog de jeux vidéo sur GitHub Pages.

- Vue publique : `/#/`
- Interface admin : `/#/admin`

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Données

Les jeux affichés par l'app sont dans `public/games.json`.

Depuis l'interface, tu peux ajouter un jeu à faire avec son titre et sa console.
Tu peux aussi supprimer un jeu depuis sa carte ou sa fiche détail. Ces changements
sont gardés dans le navigateur avec `localStorage` seulement lorsque Supabase
n'est pas configuré. Dans ce mode fallback, clique sur `Exporter le JSON`,
remplace `public/games.json` avec le fichier exporté, puis pousse le changement.

Champs principaux :

- `title` : nom du jeu
- `status` : `todo`, `playing`, `done`
- `completedOnce` : `true` si le jeu a déjà été terminé au moins une fois
- `support` : version ou support du jeu, par exemple `PS1`
- `platforms` : appareils où tu veux y jouer, par exemple `["Retroid Pocket Flip 2", "Retroid Pocket 6"]`, optionnel
- `platform` : premier appareil, conservé pour compatibilité
- `personalNote` : commentaire personnel

## Enrichissement RAWG

Crée une clé API RAWG, puis lance :

```bash
RAWG_API_KEY=ta_cle npm run enrich
```

Le script met à jour `public/games.json` avec les images, descriptions, genres, studios et liens RAWG quand un résultat existe.

RAWG demande une attribution/backlink lorsque ses données sont utilisées. L'app affiche un lien source dans les fiches de jeux enrichies.

### Automatisation sur GitHub Pages

Ajoute ta clé RAWG dans GitHub :

1. Va dans `Settings` > `Secrets and variables` > `Actions`.
2. Crée un secret nommé `RAWG_API_KEY`.
3. Mets ta clé RAWG comme valeur.
4. Pousse une modification sur `main`.

Le workflow lance automatiquement `npm run enrich` avant `npm run build`.
La clé reste côté GitHub Actions et n'est pas exposée dans le site public.

Important : les jeux ajoutés depuis l'interface restent locaux tant que tu n'as
pas exporté le JSON, remplacé `public/games.json`, puis poussé le fichier.

## Mode Supabase

Quand `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont configurés, l'app
utilise Supabase au lieu du fichier `public/games.json`.

### Installation Supabase

1. Crée un projet Supabase.
2. Lie le repo au projet :

```bash
npx supabase link --project-ref ton-project-ref
```

3. Applique les migrations :

```bash
npx supabase db push --linked
```

4. Ajoute ton email admin sans passer par le SQL Editor :

```bash
SUPABASE_URL=https://ton-projet.supabase.co \
SUPABASE_SECRET_KEY=ta_secret_key \
ADMIN_EMAIL=toi@example.com \
npm run admin:add
```

5. Dans `Authentication` > `Providers`, active Email avec magic links.
6. Dans les secrets de l'Edge Function, ajoute :

```text
RAWG_API_KEY=ta_cle_rawg
ADMIN_EMAIL=toi@example.com
SUPABASE_SECRET_KEY=ta_cle_secret_backend
```

7. Déploie l'Edge Function :

```bash
npx supabase functions deploy add-game
```

8. Côté GitHub Actions, ajoute ces secrets :

```text
VITE_SUPABASE_URL=https://ton-projet.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=ta_cle_publishable_public
```

9. Pour importer le `public/games.json` actuel dans Supabase :

```bash
SUPABASE_URL=https://ton-projet.supabase.co \
SUPABASE_SECRET_KEY=ta_secret_key \
ADMIN_EMAIL=toi@example.com \
npm run seed:supabase
```

Avec ce mode, les visiteurs lisent le backlog public. Toi, tu te connectes avec
ton email admin, tu ajoutes un jeu avec sa version/support, par exemple `PS1`,
et éventuellement l'appareil où tu veux y jouer, par exemple `Retroid Pocket Flip 2`.
L'Edge Function appelle RAWG, puis le jeu enrichi est enregistré dans Supabase.
L'export JSON n'est plus affiché dans ce mode, parce que Supabase devient la
source de vérité.

Sur GitHub Pages, utilise `https://ton-user.github.io/ton-repo/#/admin` pour
ouvrir l'interface admin. Le hash évite les 404 au rechargement.

L'admin utilise une connexion email + mot de passe Supabase, donc tu n'as pas
besoin de configurer de magic link pour le flux principal.

### Migrations

Quand le schéma change, ajoute une migration dans `supabase/migrations`, puis
applique-la avec :

```bash
npx supabase db push --linked
```

Le fichier `supabase/schema.sql` reste une référence lisible du schéma final,
mais les changements doivent passer par les migrations.

## GitHub Pages

Le build produit un dossier `dist/` publiable sur GitHub Pages.

```bash
npm run build
```

Un workflow GitHub Actions est inclus dans `.github/workflows/deploy.yml`.
Dans GitHub, règle Pages sur `GitHub Actions`, puis pousse sur `main`.
