export type GameStatus =
  | "todo"
  | "playing"
  | "done";
export type GamePriority = "low" | "medium" | "high";

export type Game = {
  id: string;
  title: string;
  status: GameStatus;
  completedOnce?: boolean;
  support?: string;
  platform: string;
  platforms?: string[];
  priority: GamePriority;
  personalRating: number | null;
  personalNote: string;
  cover: string;
  description: string;
  released: string;
  genres: string[];
  developer: string;
  publisher: string;
  rawgUrl?: string;
};
