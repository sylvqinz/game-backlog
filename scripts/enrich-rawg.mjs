import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.RAWG_API_KEY;
const sourcePath = new URL("../public/games.json", import.meta.url);

if (!apiKey) {
  console.error("RAWG_API_KEY est manquant. Exemple: RAWG_API_KEY=xxx npm run enrich");
  process.exit(1);
}

const games = JSON.parse(await readFile(sourcePath, "utf8"));

const enrichedGames = [];

for (const game of games) {
  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", game.title);
  searchUrl.searchParams.set("search_precise", "true");
  searchUrl.searchParams.set("page_size", "1");

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error(`RAWG search failed for ${game.title}: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  const match = searchData.results?.[0];

  if (!match) {
    console.warn(`Aucun résultat RAWG pour ${game.title}`);
    enrichedGames.push(game);
    continue;
  }

  const detailUrl = new URL(`https://api.rawg.io/api/games/${match.id}`);
  detailUrl.searchParams.set("key", apiKey);

  const detailResponse = await fetch(detailUrl);
  if (!detailResponse.ok) {
    throw new Error(`RAWG details failed for ${game.title}: ${detailResponse.status}`);
  }

  const details = await detailResponse.json();

  enrichedGames.push({
    ...game,
    id: game.id || details.slug,
    title: game.title || details.name,
    cover: details.background_image || game.cover,
    description: stripHtml(details.description_raw || details.description || game.description),
    released: details.released || game.released,
    genres: details.genres?.map((genre) => genre.name) || game.genres,
    developer: details.developers?.[0]?.name || game.developer,
    publisher: details.publishers?.[0]?.name || game.publisher,
    rawgUrl: `https://rawg.io/games/${details.slug}`,
  });

  console.log(`Enrichi: ${game.title}`);
}

await writeFile(sourcePath, `${JSON.stringify(enrichedGames, null, 2)}\n`);

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
