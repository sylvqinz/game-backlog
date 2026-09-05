import { createClient } from "@supabase/supabase-js";
import type { Game, GamePriority, GameStatus } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : null;

export type GameRow = {
  id: string;
  title: string;
  status: GameStatus;
  completed_once: boolean | null;
  support: string | null;
  platform: string;
  platforms: string[] | null;
  priority: GamePriority;
  personal_rating: number | null;
  personal_note: string;
  cover: string;
  description: string;
  released: string;
  genres: string[];
  developer: string;
  publisher: string;
  rawg_url: string | null;
  owner_email: string | null;
  created_at: string;
};

export function fromGameRow(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    completedOnce: Boolean(row.completed_once),
    support: normalizeOptionalValue(row.support),
    platform: row.platform,
    platforms: row.platforms ?? [],
    priority: row.priority,
    personalRating: row.personal_rating,
    personalNote: row.personal_note,
    cover: row.cover,
    description: row.description,
    released: row.released,
    genres: row.genres,
    developer: row.developer,
    publisher: row.publisher,
    rawgUrl: row.rawg_url ?? undefined,
  };
}

function normalizeOptionalValue(value: string | null) {
  const normalizedValue = value?.trim();

  return normalizedValue && normalizedValue !== "Non défini" ? normalizedValue : "";
}
