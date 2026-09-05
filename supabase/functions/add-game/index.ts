import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AddGamePayload = {
  title: string;
  support?: string;
  platform?: string;
  platforms?: string[];
};

const fallbackCover =
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80";
const defaultAllowedOrigin = "https://sylvqinz.github.io";

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rawgApiKey = Deno.env.get("RAWG_API_KEY");

  if (!supabaseUrl || !secretKey || !rawgApiKey) {
    return json({ error: "Missing server configuration" }, 500, corsHeaders);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Authentication required" }, 401, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, secretKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user?.email) {
    return json({ error: "Invalid session" }, 401, corsHeaders);
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError) {
    return json({ error: adminError.message }, 500, corsHeaders);
  }

  if (!adminRow) {
    return json({ error: "Admin access required" }, 403, corsHeaders);
  }

  const payload = (await request.json()) as AddGamePayload;
  const title = payload.title?.trim();
  const platforms = normalizePlatforms(payload.platforms, payload.platform);
  const support = payload.support?.trim() || "";
  const platform = platforms[0] || support || "Non défini";

  if (!title) {
    return json({ error: "Title is required" }, 400, corsHeaders);
  }

  const rawgGame = await findRawgGame(title, rawgApiKey);
  const game = {
    id: `${slugify(rawgGame?.slug || title)}-${Date.now()}`,
    title,
    status: "todo",
    completed_once: false,
    support,
    platform,
    platforms,
    priority: "medium",
    personal_rating: null,
    personal_note: rawgGame
      ? "Ajouté depuis l'app et enrichi avec RAWG."
      : "Ajouté depuis l'app. Aucun résultat RAWG trouvé.",
    cover: rawgGame?.background_image || fallbackCover,
    description:
      rawgGame?.description ||
      "Jeu ajouté manuellement, sans description disponible pour le moment.",
    released: rawgGame?.released || "",
    genres: rawgGame?.genres || [],
    developer: rawgGame?.developer || "Inconnu",
    publisher: rawgGame?.publisher || "Inconnu",
    rawg_url: rawgGame?.slug ? `https://rawg.io/games/${rawgGame.slug}` : null,
    owner_email: userData.user.email,
  };

  const { data, error } = await supabase.from("games").insert(game).select().single();

  if (error) {
    return json({ error: error.message }, 500, corsHeaders);
  }

  return json({ game: data }, 200, corsHeaders);
});

async function findRawgGame(title: string, apiKey: string) {
  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", title);
  searchUrl.searchParams.set("search_precise", "true");
  searchUrl.searchParams.set("page_size", "1");

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    throw new Error(`RAWG search failed: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  const match = searchData.results?.[0];

  if (!match) {
    return null;
  }

  const detailUrl = new URL(`https://api.rawg.io/api/games/${match.id}`);
  detailUrl.searchParams.set("key", apiKey);

  const detailResponse = await fetch(detailUrl);
  if (!detailResponse.ok) {
    throw new Error(`RAWG details failed: ${detailResponse.status}`);
  }

  const details = await detailResponse.json();

  return {
    slug: details.slug,
    background_image: details.background_image,
    description: stripHtml(details.description_raw || details.description),
    released: details.released,
    genres: details.genres?.map((genre: { name: string }) => genre.name) || [],
    developer: details.developers?.[0]?.name,
    publisher: details.publishers?.[0]?.name,
  };
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGIN") || defaultAllowedOrigin)
    .split(",")
    .map((allowedOrigin) => allowedOrigin.trim())
    .filter(Boolean);
  const responseOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || defaultAllowedOrigin;

  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function stripHtml(value: string) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizePlatforms(platforms?: string[], legacyPlatform?: string) {
  return Array.from(
    new Set(
      [...(platforms || []), legacyPlatform || ""]
        .map((platform) => platform.trim())
        .filter(Boolean),
    ),
  );
}
