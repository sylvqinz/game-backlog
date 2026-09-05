import { StrictMode, useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  ExternalLink,
  Gamepad2,
  Plus,
  Save,
  Search,
  Trash2,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Game, GameStatus } from "./types";
import { fromGameRow, isSupabaseConfigured, supabase, type GameRow } from "./supabase";
import "./styles.css";

const LOCAL_GAMES_KEY = "game-backlog.local-games";
const DELETED_GAMES_KEY = "game-backlog.deleted-games";
const fallbackCover =
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80";

const statusLabels: Record<GameStatus, string> = {
  todo: "À faire",
  playing: "En cours",
  done: "Terminé",
};

const statusIcons = {
  todo: CircleDashed,
  playing: Clock3,
  done: CheckCircle2,
};

const allStatuses: Array<GameStatus | "all"> = [
  "all",
  "todo",
  "playing",
  "done",
];

const supportOptions = ["PC", "Switch", "PS1", "PS2", "PSP", "GameCube", "GBA"];
const deviceOptions = ["PC", "Switch", "Retroid Pocket Flip 2", "Retroid Pocket 6"];
const deviceAliases: Record<string, string> = {
  "FLIP 2": "Retroid Pocket Flip 2",
  RP6: "Retroid Pocket 6",
};

function App() {
  const [route, setRoute] = useState(() => getCurrentRoute());
  const [baseGames, setBaseGames] = useState<Game[]>([]);
  const [localGames, setLocalGames] = useState<Game[]>(() => readLocalGames());
  const [deletedGameIds, setDeletedGameIds] = useState<string[]>(() => readDeletedGameIds());
  const [activeStatus, setActiveStatus] = useState<GameStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    function syncRoute() {
      setRoute(getCurrentRoute());
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadSupabaseGames();
      return;
    }

    fetch("./games.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Impossible de charger les jeux");
        }
        return response.json() as Promise<Game[]>;
      })
      .then(setBaseGames)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_GAMES_KEY, JSON.stringify(localGames));
  }, [localGames]);

  useEffect(() => {
    localStorage.setItem(DELETED_GAMES_KEY, JSON.stringify(deletedGameIds));
  }, [deletedGameIds]);

  const games = useMemo(() => {
    if (isSupabaseConfigured) {
      return baseGames;
    }

    return [...baseGames, ...localGames].filter(
      (game) => !deletedGameIds.includes(game.id),
    );
  }, [baseGames, deletedGameIds, localGames]);

  const heroCover = useMemo(() => {
    const mgs3 = games.find((game) =>
      game.title.toLowerCase().includes("metal gear solid 3"),
    );

    return mgs3?.cover || fallbackCover;
  }, [games]);

  const deviceFilters = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          games.flatMap((game) => [
            getGameSupport(game),
            ...getGameDevices(game),
          ]),
        ),
      )
        .filter(Boolean)
        .sort(),
    ],
    [games],
  );

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return games.filter((game) => {
      const matchesStatus = matchesGameStatusFilter(game, activeStatus);
      const matchesPlatform =
        platform === "all" ||
        getGameSupport(game) === platform ||
        getGameDevices(game).includes(platform);
      const searchable = [
        game.title,
        getGameSupport(game),
        ...getGameDevices(game),
        game.developer,
        game.publisher,
        game.personalNote,
        hasBeenCompleted(game) ? "terminé déjà terminé fini completed" : "",
        ...game.genres,
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && matchesPlatform && searchable.includes(normalizedQuery);
    });
  }, [activeStatus, games, platform, query]);

  const stats = useMemo(
    () => ({
      total: games.length,
      done: games.filter((game) => game.status === "done" || hasBeenCompleted(game))
        .length,
      playing: games.filter((game) => game.status === "playing").length,
      todo: games.filter((game) => game.status === "todo").length,
    }),
    [games],
  );
  const isAdminRoute = route === "admin";
  const canManageGames = isAdminRoute && (!isSupabaseConfigured || Boolean(userEmail));

  async function loadSupabaseGames() {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(true);
      setStatusMessage(error.message);
      return;
    }

    setBaseGames((data as GameRow[]).map(fromGameRow));
    setLoadError(false);
  }

  async function addTodoGame(
    title: string,
    support: string,
    gameDevices: string[],
    status: GameStatus,
    completedOnce: boolean,
  ) {
    const nextCompletedOnce = status === "done" || completedOnce;
    const nextActiveStatus = nextCompletedOnce ? "done" : status;

    if (supabase) {
      setIsMutating(true);
      setStatusMessage("Recherche RAWG en cours...");

      const { data, error } = await supabase.functions.invoke("add-game", {
        body: { title, support, platforms: gameDevices, status, completedOnce: nextCompletedOnce },
      });

      setIsMutating(false);

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      const addedGame = {
        ...fromGameRow(data.game as GameRow),
        status,
        completedOnce: nextCompletedOnce,
      };

      const { error: syncError } = await supabase
        .from("games")
        .update({
          status,
          completed_once: nextCompletedOnce,
        })
        .eq("id", addedGame.id);

      if (syncError) {
        setStatusMessage(syncError.message);
        return;
      }

      setBaseGames((currentGames) => [addedGame, ...currentGames]);
      setActiveStatus(nextActiveStatus);
      setPlatform(gameDevices[0] || "all");
      setStatusMessage("Jeu ajouté et enrichi.");
      return;
    }

    const game: Game = {
      id: `local-${slugify(title)}-${Date.now()}`,
      title,
      status,
      completedOnce: nextCompletedOnce,
      support,
      platform: gameDevices[0] || support || "Non défini",
      platforms: gameDevices,
      priority: "medium",
      personalRating: null,
      personalNote: "Ajouté depuis l'app. À enrichir avec RAWG lors du prochain export.",
      cover: fallbackCover,
      description: "Jeu ajouté manuellement, en attente d'enrichissement.",
      released: "",
      genres: [],
      developer: "Inconnu",
      publisher: "Inconnu",
    };

    setLocalGames((currentGames) => [game, ...currentGames]);
    setActiveStatus(nextActiveStatus);
    setPlatform(gameDevices[0] || "all");
  }

  async function updateGame(updatedGame: Game) {
    if (supabase) {
      setIsMutating(true);
      const { error } = await supabase
        .from("games")
        .update(toGameUpdateRow(updatedGame))
        .eq("id", updatedGame.id);
      setIsMutating(false);

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      setBaseGames((currentGames) =>
        currentGames.map((game) => (game.id === updatedGame.id ? updatedGame : game)),
      );
      setSelectedGame(updatedGame);
      setStatusMessage("Jeu mis à jour.");
      return;
    }

    setLocalGames((currentGames) =>
      currentGames.map((game) => (game.id === updatedGame.id ? updatedGame : game)),
    );
    setBaseGames((currentGames) =>
      currentGames.map((game) => (game.id === updatedGame.id ? updatedGame : game)),
    );
    setSelectedGame(updatedGame);
  }

  function exportGames() {
    const blob = new Blob([`${JSON.stringify(games, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "games.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deleteGame(game: Game) {
    const shouldDelete = window.confirm(`Supprimer "${game.title}" du backlog ?`);

    if (!shouldDelete) {
      return;
    }

    if (supabase) {
      setIsMutating(true);
      const { error } = await supabase.from("games").delete().eq("id", game.id);
      setIsMutating(false);

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      setBaseGames((currentGames) =>
        currentGames.filter((currentGame) => currentGame.id !== game.id),
      );
      setSelectedGame((currentGame) => (currentGame?.id === game.id ? null : currentGame));
      setStatusMessage("Jeu supprimé.");
      return;
    }

    setLocalGames((currentGames) =>
      currentGames.filter((currentGame) => currentGame.id !== game.id),
    );
    setDeletedGameIds((currentIds) =>
      currentIds.includes(game.id) ? currentIds : [...currentIds, game.id],
    );
    setSelectedGame((currentGame) => (currentGame?.id === game.id ? null : currentGame));
  }

  async function requestLogin(email: string, password: string) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setStatusMessage(error ? error.message : "Connecté.");
  }

  async function logout() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStatusMessage("Déconnecté.");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-cover" aria-hidden="true">
          <img src={heroCover} alt="" />
        </div>
        <div className="hero-copy">
          <h1>Game Backlog</h1>
        </div>

        <div className="stats" aria-label="Statistiques du backlog">
          <Stat icon={Gamepad2} label="Total" value={stats.total} />
          <Stat icon={CircleDashed} label="À faire" value={stats.todo} />
          <Stat icon={Trophy} label="Terminé" value={stats.done} />
          <Stat icon={Clock3} label="En cours" value={stats.playing} />
        </div>
      </section>

      {isAdminRoute && isSupabaseConfigured ? (
        <section className="admin-session" aria-label="Session administrateur">
          <div>
            <span>Admin</span>
            <strong>{userEmail ? "Session active" : "Connexion requise"}</strong>
          </div>
          <AuthPanel
            userEmail={userEmail}
            onLogin={requestLogin}
            onLogout={logout}
          />
        </section>
      ) : null}

      {isAdminRoute ? (
        <section
          className={`add-panel ${!isSupabaseConfigured ? "with-export" : ""}`}
          aria-label="Administration du backlog"
        >
          <AddGameForm
            isDisabled={isSupabaseConfigured && !userEmail}
            isSubmitting={isMutating}
            onAdd={addTodoGame}
          />
          {!isSupabaseConfigured ? (
            <button className="export-button" type="button" onClick={exportGames}>
              <Download size={18} aria-hidden="true" />
              Exporter le JSON
            </button>
          ) : null}
        </section>
      ) : null}

      {isAdminRoute && statusMessage ? (
        <p className="status-message">{statusMessage}</p>
      ) : null}

      <section className="controls" aria-label="Filtres">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Rechercher</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un jeu, genre, studio..."
          />
        </label>

        <div className="status-tabs" aria-label="Statut">
          {allStatuses.map((status) => (
            <button
              key={status}
              className={activeStatus === status ? "active" : ""}
              type="button"
              onClick={() => setActiveStatus(status)}
            >
              {status === "all" ? "Tous" : statusLabels[status]}
            </button>
          ))}
        </div>

        <label className="select-field">
          <span>Support</span>
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {deviceFilters.map((platformName) => (
              <option key={platformName} value={platformName}>
                {platformName === "all" ? "Tous" : platformName}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loadError ? (
        <p className="empty-state">Impossible de charger le fichier games.json.</p>
      ) : (
        <section className="game-grid" aria-label="Liste des jeux">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              canDelete={canManageGames}
              onDelete={() => deleteGame(game)}
              onSelect={() => setSelectedGame(game)}
            />
          ))}
        </section>
      )}

      {!loadError && filteredGames.length === 0 ? (
        <p className="empty-state">Aucun jeu ne correspond aux filtres.</p>
      ) : null}

      {selectedGame ? (
        <GameDialog
          game={selectedGame}
          canDelete={canManageGames}
          canEdit={canManageGames}
          onClose={() => setSelectedGame(null)}
          onDelete={() => deleteGame(selectedGame)}
          onSave={updateGame}
        />
      ) : null}

      <footer>
        Données enrichies via RAWG lorsque disponibles.
        {!isSupabaseConfigured ? (
          <>
            {" "}
            Mets à jour le catalogue dans <code>public/games.json</code>.
          </>
        ) : null}
      </footer>
    </main>
  );
}

type IconComponent = LucideIcon;

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: number;
}) {
  return (
    <div className="stat">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuthPanel({
  userEmail,
  onLogin,
  onLogout,
}: {
  userEmail: string | null;
  onLogin: (email: string, password: string) => void;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email.trim() && password) {
      onLogin(email.trim(), password);
    }
  }

  if (userEmail) {
    return (
      <div className="auth-panel">
        <span>{userEmail}</span>
        <button className="logout-button" type="button" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    );
  }

  return (
    <form className="auth-panel" onSubmit={submitForm}>
      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email admin"
        type="email"
      />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Mot de passe"
        type="password"
      />
      <button type="submit">Connexion</button>
    </form>
  );
}

function AddGameForm({
  isDisabled,
  isSubmitting,
  onAdd,
}: {
  isDisabled: boolean;
  isSubmitting: boolean;
  onAdd: (
    title: string,
    support: string,
    platforms: string[],
    status: GameStatus,
    completedOnce: boolean,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [support, setSupport] = useState("");
  const [status, setStatus] = useState<GameStatus>("todo");
  const [completedOnce, setCompletedOnce] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const isCompletedOnceChecked = status === "done" || completedOnce;

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const platforms = normalizePlatforms(selectedPlatforms);

    if (!trimmedTitle) {
      return;
    }

    void onAdd(trimmedTitle, support, platforms, status, isCompletedOnceChecked);
    setTitle("");
    setStatus("todo");
    setCompletedOnce(false);
  }

  return (
    <form className="add-form" onSubmit={submitForm}>
      <label>
        <span>Jeu</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isDisabled || isSubmitting}
          placeholder="Ex: Chrono Trigger"
        />
      </label>
      <label>
        <span>Version</span>
        <select
          value={support}
          onChange={(event) => setSupport(event.target.value)}
          disabled={isDisabled || isSubmitting}
        >
          <option value="">Aucune</option>
          {supportOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Statut</span>
        <select
          value={status}
          onChange={(event) => {
            const nextStatus = event.target.value as GameStatus;
            setStatus(nextStatus);
            setCompletedOnce(nextStatus === "done" || completedOnce);
          }}
          disabled={isDisabled || isSubmitting}
        >
          {allStatuses
            .filter((currentStatus) => currentStatus !== "all")
            .map((currentStatus) => (
              <option key={currentStatus} value={currentStatus}>
                {statusLabels[currentStatus]}
              </option>
            ))}
        </select>
      </label>
      <label className="add-completed-toggle">
        <input
          checked={isCompletedOnceChecked}
          disabled={isDisabled || isSubmitting}
          type="checkbox"
          onChange={(event) => {
            setCompletedOnce(event.target.checked);

            if (!event.target.checked && status === "done") {
              setStatus("todo");
            }
          }}
        />
        <span>Déjà terminé</span>
      </label>
      <PlatformPicker
        disabled={isDisabled || isSubmitting}
        selectedPlatforms={selectedPlatforms}
        onChange={setSelectedPlatforms}
      />
      <button type="submit" disabled={isDisabled || isSubmitting}>
        <Plus size={18} aria-hidden="true" />
        {isSubmitting ? "Ajout..." : "Ajouter"}
      </button>
    </form>
  );
}

function GameCard({
  game,
  canDelete,
  onDelete,
  onSelect,
}: {
  game: Game;
  canDelete: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const StatusIcon = statusIcons[game.status];
  const statusLabel = getDisplayStatusLabel(game);

  return (
    <article className="game-card">
      {canDelete ? (
        <button
          className="icon-button delete-card-button"
          type="button"
          onClick={onDelete}
          title="Supprimer"
        >
          <Trash2 size={18} aria-label="Supprimer" />
        </button>
      ) : null}
      <button className="cover-button" type="button" onClick={onSelect}>
        <img src={game.cover} alt="" loading="lazy" />
        <span className={`status-pill ${game.status}`}>
          <StatusIcon size={15} aria-hidden="true" />
          {statusLabel}
        </span>
        {hasBeenCompleted(game) ? (
          <span className="completion-trophy">
            <Trophy size={17} aria-label="Terminé" />
          </span>
        ) : null}
      </button>
      <div className="game-card-body">
        <div>
          <h2>{game.title}</h2>
          <p>{game.description}</p>
        </div>
        <div className="meta-row">
          {getGameSupport(game) ? <span>{getGameSupport(game)}</span> : null}
          {getGameDevices(game).length ? <span>Sur {formatDevices(game)}</span> : null}
        </div>
      </div>
    </article>
  );
}

function GameDialog({
  game,
  canDelete,
  canEdit,
  onClose,
  onDelete,
  onSave,
}: {
  game: Game;
  canDelete: boolean;
  canEdit: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (game: Game) => Promise<void>;
}) {
  const StatusIcon = statusIcons[game.status];
  const statusLabel = getDisplayStatusLabel(game);
  const [draft, setDraft] = useState<Game>(() => ({
    ...game,
    platforms: getGameDevices(game),
    support: getGameSupport(game),
  }));

  useEffect(() => {
    setDraft({ ...game, platforms: getGameDevices(game), support: getGameSupport(game) });
  }, [game]);

  function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const devices = normalizePlatforms(draft.platforms || []);
    const support = getGameSupport(draft);

    void onSave({
      ...draft,
      support,
      platform: devices[0] || support || "Non défini",
      platforms: devices,
      completedOnce: draft.status === "done" || draft.completedOnce,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button close-button" type="button" onClick={onClose}>
          <XCircle size={22} aria-label="Fermer" />
        </button>
        <img className="dialog-cover" src={game.cover} alt="" />
        <div className="dialog-content">
          <span className={`status-pill ${game.status}`}>
            <StatusIcon size={15} aria-hidden="true" />
            {statusLabel}
          </span>
          {hasBeenCompleted(game) ? (
            <span className="completion-pill inline">
              <Trophy size={14} aria-hidden="true" />
              Terminé
            </span>
          ) : null}
          <h2 id="dialog-title">{game.title}</h2>
          <p>{game.description}</p>

          {canEdit ? (
            <form className="edit-form" onSubmit={saveChanges}>
              <div className="edit-grid">
                <label>
                  <span>Titre</span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </label>
                <label>
                  <span>Statut</span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: event.target.value as GameStatus,
                        completedOnce:
                          event.target.value === "done" ? true : draft.completedOnce,
                      })
                    }
                  >
                    {allStatuses
                      .filter((status) => status !== "all")
                      .map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Version</span>
                  <input
                    value={draft.support || ""}
                    onChange={(event) =>
                      setDraft({ ...draft, support: event.target.value })
                    }
                  />
                </label>
              </div>
              <span className="edit-caption">Sur</span>
              <PlatformPicker
                selectedPlatforms={getGameDevices(draft)}
                onChange={(platforms) =>
                  setDraft({
                    ...draft,
                    platform: platforms[0] || getGameSupport(draft),
                    platforms,
                  })
                }
              />
              <label className="completed-toggle">
                <input
                  checked={Boolean(draft.completedOnce)}
                  type="checkbox"
                  onChange={(event) =>
                    setDraft({ ...draft, completedOnce: event.target.checked })
                  }
                />
                <span>Déjà terminé</span>
              </label>
              <label className="note-field">
                <span>Note</span>
                <textarea
                  value={draft.personalNote}
                  onChange={(event) =>
                    setDraft({ ...draft, personalNote: event.target.value })
                  }
                />
              </label>
              <button className="save-dialog-button" type="submit">
                <Save size={18} aria-hidden="true" />
                Enregistrer
              </button>
            </form>
          ) : (
            <dl className="detail-list">
              <div>
                <dt>Version</dt>
                <dd>{getGameSupport(game) || "Non définie"}</dd>
              </div>
              <div>
                <dt>Sur</dt>
                <dd>{getGameDevices(game).length ? formatDevices(game) : "Non défini"}</dd>
              </div>
              <div>
                <dt>Sortie</dt>
                <dd>
                  <CalendarDays size={15} aria-hidden="true" />
                  {formatDate(game.released)}
                </dd>
              </div>
              <div>
                <dt>Studio</dt>
                <dd>{game.developer}</dd>
              </div>
              <div>
                <dt>Éditeur</dt>
                <dd>{game.publisher}</dd>
              </div>
              <div>
                <dt>Genres</dt>
                <dd>{game.genres.length ? game.genres.join(", ") : "Inconnus"}</dd>
              </div>
            </dl>
          )}

          <div className="tag-list">
            {game.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>

          <blockquote>{game.personalNote}</blockquote>

          {game.rawgUrl ? (
            <a className="source-link" href={game.rawgUrl} target="_blank" rel="noreferrer">
              Source RAWG
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : null}

          {canDelete ? (
            <button className="delete-dialog-button" type="button" onClick={onDelete}>
              <Trash2 size={18} aria-hidden="true" />
              Supprimer du backlog
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) {
    return "Inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function matchesGameStatusFilter(game: Game, status: GameStatus | "all") {
  if (status === "all") {
    return true;
  }

  if (status === "done") {
    return game.status === "done" || hasBeenCompleted(game);
  }

  return game.status === status;
}

function getDisplayStatusLabel(game: Game) {
  if (game.status === "todo" && hasBeenCompleted(game)) {
    return "À refaire";
  }

  return statusLabels[game.status];
}

function readLocalGames() {
  try {
    const savedGames = localStorage.getItem(LOCAL_GAMES_KEY);
    if (!savedGames) {
      return [];
    }

    return JSON.parse(savedGames) as Game[];
  } catch {
    return [];
  }
}

function readDeletedGameIds() {
  try {
    const savedIds = localStorage.getItem(DELETED_GAMES_KEY);
    if (!savedIds) {
      return [];
    }

    return JSON.parse(savedIds) as string[];
  } catch {
    return [];
  }
}

function PlatformPicker({
  disabled = false,
  selectedPlatforms,
  onChange,
}: {
  disabled?: boolean;
  selectedPlatforms: string[];
  onChange: (platforms: string[]) => void;
}) {
  function togglePlatform(platform: string) {
    if (selectedPlatforms.includes(platform)) {
      onChange(selectedPlatforms.filter((currentPlatform) => currentPlatform !== platform));
      return;
    }

    onChange([...selectedPlatforms, platform]);
  }

  return (
    <div className="platform-picker" aria-label="Consoles">
      {deviceOptions.map((platform) => (
        <label key={platform}>
          <input
            checked={selectedPlatforms.includes(platform)}
            disabled={disabled}
            type="checkbox"
            onChange={() => togglePlatform(platform)}
          />
          <span>{platform}</span>
        </label>
      ))}
    </div>
  );
}

function getGameDevices(game: Game) {
  const support = getGameSupport(game);
  const explicitDevices = game.platforms?.length ? game.platforms : [];
  const legacyDevices = game.platform && game.platform !== support ? [game.platform] : [];
  const devices = normalizePlatforms(
    explicitDevices.length ? explicitDevices : legacyDevices,
  ).map((device) => deviceAliases[device] || device);

  return devices.filter(
    (device) =>
      device !== "Non défini" && (deviceOptions.includes(device) || device !== support),
  );
}

function getGameSupport(game: Game) {
  if (game.support !== undefined) {
    return game.support.trim();
  }

  return game.platform === "Non défini" ? "" : game.platform;
}

function formatDevices(game: Game) {
  return getGameDevices(game).join(", ");
}

function normalizePlatforms(platforms: string[]) {
  return Array.from(
    new Set(
      platforms
        .map((platform) => platform.trim())
        .filter((platform) => platform && platform !== "Non défini"),
    ),
  );
}

function toGameUpdateRow(game: Game) {
  const devices = getGameDevices(game);
  const support = getGameSupport(game);

  return {
    status: game.status,
    title: game.title,
    completed_once: hasBeenCompleted(game),
    support,
    platform: devices[0] || support || "Non défini",
    platforms: devices,
    personal_note: game.personalNote,
  };
}

function hasBeenCompleted(game: Game) {
  return Boolean(game.completedOnce || game.status === "done");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getCurrentRoute() {
  return window.location.hash.replace("#/", "") === "admin" ? "admin" : "public";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
