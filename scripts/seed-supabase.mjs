import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const sourcePath = new URL("../public/games.json", import.meta.url);

if (!supabaseUrl || !secretKey || !adminEmail) {
  console.error(
    "Variables manquantes. Exemple: SUPABASE_URL=... SUPABASE_SECRET_KEY=... ADMIN_EMAIL=... npm run seed:supabase",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey);
const games = JSON.parse(await readFile(sourcePath, "utf8"));

const rows = games.map((game) => ({
  id: game.id,
  title: game.title,
  status: game.status,
  completed_once: Boolean(game.completedOnce || game.status === "done"),
  support: game.support || game.platforms?.[0] || game.platform,
  platform: game.platforms?.[0] || game.platform,
  platforms: game.platforms?.length ? game.platforms : [game.platform],
  priority: game.priority,
  personal_rating: game.personalRating,
  personal_note: game.personalNote,
  cover: game.cover,
  description: game.description,
  released: game.released,
  genres: game.genres,
  developer: game.developer,
  publisher: game.publisher,
  rawg_url: game.rawgUrl ?? null,
  owner_email: adminEmail,
}));

const { error } = await supabase.from("games").upsert(rows, { onConflict: "id" });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`${rows.length} jeux importés dans Supabase.`);
