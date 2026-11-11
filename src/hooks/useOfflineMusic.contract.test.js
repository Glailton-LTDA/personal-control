import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import * as hooks from "./useOfflineMusic";
import {
  db,
  putMusicSong,
  putMusicSetlist,
  putMusicGenre,
  putMusicChord,
} from "../lib/offline/db";
const state = vi.hoisted(() => ({
  options: null,
  data: undefined,
  rows: [],
  error: null,
  calls: [],
  client: { invalidateQueries: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options) => {
    state.options = options;
    return { data: state.data, ...options };
  },
  useQueryClient: () => state.client,
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (table) => {
      const q = {};
      for (const method of ["select", "eq", "ilike", "or"])
        q[method] = (...args) => {
          state.calls.push([table, method, ...args]);
          return q;
        };
      q.then = (resolve, reject) =>
        Promise.resolve({ data: state.rows, error: state.error }).then(
          resolve,
          reject,
        );
      return q;
    },
  },
}));
const tables = [
  "music_songs",
  "music_setlists",
  "music_setlist_songs",
  "music_genres",
  "music_chords",
];
beforeEach(async () => {
  await Promise.all(tables.map((t) => db[t].clear()));
  state.options = null;
  state.data = undefined;
  state.rows = [];
  state.error = null;
  state.calls = [];
  vi.clearAllMocks();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const songs = [
  { artist: "Alpha" },
  { artist: "Alpha" },
  { artist: "Beta" },
  { artist: "1 Band" },
  { artist: "!Band" },
  { artist: "" },
  { artist: " " },
  { artist: null },
];
async function seed() {
  await Promise.all(
    songs.map((s, i) =>
      putMusicSong({ ...s, id: `song-${i}`, user_id: "owner" }),
    ),
  );
  await putMusicSong({ id: "foreign", artist: "Other", user_id: "other" });
}
describe("offline music catalog", () => {
  it("reads genres and chords from the real local database", async () => {
    await putMusicGenre({ id: "rock", name: "Rock" });
    await putMusicChord({ id: "c", chord_name: "C" });
    expect(await hooks.useOfflineGenres().queryFn()).toEqual([
      { id: "rock", name: "Rock" },
    ]);
    expect(await hooks.useOfflineChords().queryFn()).toEqual([
      { id: "c", chord_name: "C" },
    ]);
  });
  it("stores, updates and removes setlist relations while invalidating both views", async () => {
    await putMusicSetlist({ id: "list", user_id: "owner" });
    await putMusicSetlist({ id: "other-list", user_id: "other" });
    const save = hooks.useSaveSetlistSong();
    expect(await save("list", "song", 1)).toEqual({
      setlist_id: "list",
      song_id: "song",
      order_index: 1,
    });
    await save("list", "song", 2);
    expect(await hooks.useOfflineSetlistSongs("list").queryFn()).toEqual([
      { id: "list_song", setlist_id: "list", song_id: "song", order_index: 2 },
    ]);
    expect(await hooks.useOfflineSetlists("owner").queryFn()).toHaveLength(1);
    expect(
      await hooks.useOfflineAllSetlistSongs("owner").queryFn(),
    ).toHaveLength(1);
    expect(await hooks.useOfflineAllSetlistSongs("nobody").queryFn()).toEqual(
      [],
    );
    await hooks.useRemoveSetlistSong()("list", "song");
    expect(await hooks.useOfflineSetlistSongs("list").queryFn()).toEqual([]);
    expect(state.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["offline_setlist_songs"],
    });
    expect(state.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["offline_all_setlist_songs"],
    });
  });
  it("disables queries without their parent identifier", () => {
    expect(hooks.useOfflineSetlists().enabled).toBe(false);
    expect(hooks.useOfflineSetlistSongs().enabled).toBe(false);
    expect(hooks.useOfflineAllSetlistSongs().enabled).toBe(false);
  });
  for (const mode of ["offline", "server-error", "online"])
    for (const search of ["", " ALp "])
      it(`deduplicates artists: ${mode}, search ${search}`, async () => {
        await seed();
        if (mode === "offline")
          vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        if (mode === "server-error") state.error = new Error("synthetic");
        state.rows = search
          ? [{ artist: "Alpha" }, { artist: "Alpha" }]
          : songs;
        expect(hooks.useOfflineUniqueArtists("owner", search)).toEqual([]);
        const result = await state.options.queryFn();
        expect(result).toEqual(
          search ? ["Alpha"] : ["!Band", "1 Band", "Alpha", "Beta"],
        );
        expect(result).not.toContain("Other");
        if (mode !== "offline") {
          expect(state.calls).toContainEqual([
            "music_songs",
            "eq",
            "user_id",
            "owner",
          ]);
          if (search)
            expect(state.calls).toContainEqual([
              "music_songs",
              "ilike",
              "artist",
              "%ALp%",
            ]);
        }
      });
  for (const mode of ["offline", "server-error", "online"])
    for (const letter of ["A", "#"])
      it(`counts artists by initial: ${mode}, ${letter}`, async () => {
        await seed();
        if (mode === "offline")
          vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        if (mode === "server-error") state.error = new Error("synthetic");
        state.rows =
          letter === "A"
            ? [{ artist: "Alpha" }, { artist: "Alpha" }, { artist: null }]
            : songs;
        hooks.useOfflineArtistsByLetter("owner", letter);
        const result = await state.options.queryFn();
        expect(result).toEqual(
          letter === "A"
            ? [{ artist: "Alpha", song_count: 2 }]
            : [
                { artist: "!Band", song_count: 1 },
                { artist: "1 Band", song_count: 1 },
              ],
        );
        if (mode === "online")
          expect(
            state.calls.some((x) => x[1] === (letter === "#" ? "or" : "ilike")),
          ).toBe(true);
      });
  it("handles absent identity, letter and server rows; returns cached data", async () => {
    expect(hooks.useOfflineUniqueArtists()).toEqual([]);
    expect(state.options.enabled).toBe(false);
    expect(await state.options.queryFn()).toEqual([]);
    hooks.useOfflineArtistsByLetter("owner", "");
    expect(state.options.enabled).toBe(false);
    expect(await state.options.queryFn()).toEqual([]);
    hooks.useOfflineArtistsByLetter(undefined, "A");
    expect(await state.options.queryFn()).toEqual([]);
    state.rows = null;
    hooks.useOfflineUniqueArtists("owner");
    expect(await state.options.queryFn()).toEqual([]);
    hooks.useOfflineArtistsByLetter("owner", "A");
    expect(await state.options.queryFn()).toEqual([]);
    state.data = ["Alpha"];
    expect(hooks.useOfflineUniqueArtists("owner")).toEqual(["Alpha"]);
  });
});
