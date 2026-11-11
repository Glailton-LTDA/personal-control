import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import { db, putMusicSong } from "../../lib/offline/db";
import Music from "./Music";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  server: null,
  rows: [],
  remove: vi.fn(),
  update: vi.fn(),
  invalidate: vi.fn(),
  storageRemove: vi.fn(),
  options: null,
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table) => state.server.from(table),
    storage: { from: () => ({ remove: state.storageRemove }) },
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("../../hooks/useOfflineSongs", () => ({
  useOfflineSongs: (_user, options) => {
    state.options = options;
    return { songs: state.rows, totalCount: 100, isLoading: false };
  },
  useOfflineDeleteSong: () => ({ mutateAsync: state.remove }),
  useOfflineUpdateSong: () => ({ mutateAsync: state.update }),
}));
vi.mock("../../hooks/useOfflineMusic", () => ({
  useOfflineGenres: () => ({ data: [{ id: "rock", name: "Rock" }] }),
  useOfflineUniqueArtists: () => ["Artist", "Other"],
  useOfflineArtistsByLetter: () => [{ artist: "Artist", song_count: 2 }],
  useOfflineChords: () => ({
    data: [
      {
        chord_name: "C",
        music_instruments: { name: "violao" },
        music_chord_variations: [
          { variation_index: 1, frets: [] },
          { variation_index: 0, frets: [] },
        ],
      },
      { chord_name: null },
    ],
  }),
}));
vi.mock("./CifraViewer", () => ({
  default: ({ song, onEdit }) => (
    <div>
      Chord viewer {song.title}
      <button onClick={() => onEdit(song)}>Edit from viewer</button>
    </div>
  ),
}));
vi.mock("./SheetViewer", () => ({
  default: ({ song, onEdit }) => (
    <div>
      PDF viewer {song.title}
      <button onClick={() => onEdit(song)}>Edit from viewer</button>
    </div>
  ),
}));
vi.mock("./SongEditor", () => ({
  default: ({ initialData, onClose, onSaved }) => (
    <div role="dialog">
      {initialData?.title}
      <button onClick={onClose}>Close editor</button>
      <button onClick={() => onSaved(initialData)}>Save editor</button>
    </div>
  ),
}));
vi.mock("./Setlists", () => ({
  default: ({ onSelectSong }) => (
    <button
      onClick={() =>
        onSelectSong({ id: "set-song", title: "Set song", type: "cifra" })
      }
    >
      Open setlist song
    </button>
  ),
}));
vi.mock("./ChordSettings", () => ({
  default: () => <div>Chord settings</div>,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const song = {
  id: "song",
  user_id: "owner",
  title: "Synthetic song",
  type: "cifra",
  artist: "Artist",
  content: "C Am",
};
beforeEach(async () => {
  state.server = createQueryServer();
  state.rows = [
    song,
    {
      ...song,
      id: "pdf",
      title: "PDF",
      type: "partitura",
      storage_type: "cloud",
      file_path: "owner/pdf",
      is_favorite: true,
    },
  ];
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  state.remove.mockResolvedValue({});
  state.update.mockResolvedValue({});
  await db.music_songs.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function open(extra = {}) {
  return render(<Music user={{ id: "owner" }} {...extra} />);
}
for (const failure of [false, true])
  it(`favorites and deletes a cloud PDF, failure=${failure}`, async () => {
    open();
    if (failure) state.update.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(screen.getByTitle("music.mark_favorite"));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        id: "song",
        is_favorite: true,
      }),
    );
    if (failure)
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("music.error_favorite"),
      );
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByTitle("music.delete_song_action")[1]);
    expect(state.remove).not.toHaveBeenCalled();
    if (failure) state.remove.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(screen.getAllByTitle("music.delete_song_action")[1]);
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "music.error_delete_song" : "music.song_deleted",
      ),
    );
    expect(state.storageRemove).toHaveBeenCalledWith(["owner/pdf"]);
  });
for (const source of [
  "complete",
  "cached",
  "remote",
  "offline-missing",
  "server-error",
])
  it(`loads editor safely from ${source}`, async () => {
    state.rows = [
      { ...song, content: source === "complete" ? "C Am" : undefined },
    ];
    if (source === "cached") await putMusicSong(song);
    if (source === "remote") state.server.tables.music_songs = [song];
    if (source === "server-error")
      state.server.failures["music_songs:select"] = "denied";
    if (source === "offline-missing")
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    open();
    fireEvent.click(screen.getByTitle("music.edit_song_action"));
    if (source === "offline-missing" || source === "server-error") {
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("music.song_not_found"),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } else {
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByText("Save editor"));
      expect(state.invalidate).toHaveBeenCalled();
    }
  });
for (const source of [
  "local",
  "remote",
  "offline-incomplete",
  "offline-missing",
  "error",
])
  it(`opens song route from ${source}`, async () => {
    if (source === "local") await putMusicSong(song);
    if (source === "remote") state.server.tables.music_songs = [song];
    if (source.startsWith("offline")) {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      if (source === "offline-incomplete")
        await putMusicSong({ ...song, content: null });
    }
    if (source === "error")
      state.server.failures["music_songs:select"] = "denied";
    const navigate = vi.fn();
    open({ mode: "song-song", navigate });
    if (source === "error" || source === "offline-missing") {
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("music/repertoire"),
      );
    } else {
      await screen.findByText("Chord viewer Synthetic song");
      fireEvent.click(screen.getByText("Edit from viewer"));
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByText("Close editor"));
      fireEvent.click(screen.getByTitle("music.back_to_repertoire"));
      expect(navigate).toHaveBeenCalledWith("music/repertoire");
    }
  });
it("changes filters, validates page navigation and opens links with/without router", () => {
  const navigate = vi.fn();
  open({ navigate });
  fireEvent.click(screen.getByText("#"));
  expect(navigate).toHaveBeenCalledWith("music/repertoire/letter/num");
  fireEvent.click(screen.getByRole("link", { name: "Synthetic song" }));
  expect(navigate).toHaveBeenCalledWith("music/songs/song");
  const search = screen.getByPlaceholderText("music.search_placeholder");
  fireEvent.change(search, { target: { value: "Artist" } });
  expect(state.options.search).toBe("Artist");
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "partitura" },
  });
  fireEvent.change(screen.getAllByRole("combobox")[1], {
    target: { value: "rock" },
  });
  expect(state.options).toMatchObject({ type: "partitura", genre_id: "rock" });
  const page = screen.getByPlaceholderText("music.page_placeholder");
  fireEvent.change(page, { target: { value: "99" } });
  fireEvent.keyDown(page, { key: "Enter" });
  expect(toast.error).toHaveBeenCalledWith("music.invalid_page");
  fireEvent.change(page, { target: { value: "2" } });
  fireEvent.keyDown(page, { key: "Enter" });
  expect(state.options.page).toBe(1);
  fireEvent.click(screen.getByTitle("music.last_page"));
  expect(state.options.page).toBe(3);
  fireEvent.click(screen.getByTitle("music.first_page"));
  expect(state.options.page).toBe(0);
});
it("opens a setlist song and returns without a router", async () => {
  open({ mode: "setlists" });
  fireEvent.click(screen.getByText("Open setlist song"));
  await screen.findByText("Chord viewer Set song");
  fireEvent.click(screen.getByText("Edit from viewer"));
  fireEvent.click(screen.getByText("Save editor"));
  await screen.findByText("Chord viewer Set song");
  fireEvent.click(screen.getByTitle("music.back_to_setlists"));
  expect(screen.getByText("Open setlist song")).toBeInTheDocument();
});
it("searches the artist dropdown, handles no results, selection and outside dismissal", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "music.all_artists" }));
  const search = screen.getByPlaceholderText("music.search_artist");
  fireEvent.change(search, { target: { value: "Missing" } });
  expect(
    screen.getByText("music.no_artist_found_dropdown"),
  ).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "Other" } });
  const other = screen.getByText("Other");
  fireEvent.mouseEnter(other);
  fireEvent.mouseLeave(other);
  fireEvent.click(other);
  expect(state.options.artist).toBe("Other");
  fireEvent.click(screen.getByRole("button", { name: "Other" }));
  const selected = screen
    .getAllByText("Other")
    .find((el) => el.tagName === "DIV");
  fireEvent.mouseEnter(selected);
  fireEvent.mouseLeave(selected);
  fireEvent.click(screen.getByText("music.all_artists"));
  expect(state.options.artist).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "music.all_artists" }));
  fireEvent.mouseDown(document.body);
  expect(
    screen.queryByPlaceholderText("music.search_artist"),
  ).not.toBeInTheDocument();
});
it("navigates letters and artists without a router and responds to route changes", () => {
  const { rerender } = open();
  fireEvent.click(screen.getByText("A"));
  fireEvent.click(screen.getByRole("link", { name: /Artist/ }));
  expect(state.options.artist).toBe("Artist");
  fireEvent.click(screen.getByTitle("music.back"));
  expect(state.options.artist).toBeUndefined();
  fireEvent.click(screen.getByText("music.clear"));
  expect(screen.queryByTitle("music.back")).not.toBeInTheDocument();
  rerender(<Music user={{ id: "owner" }} mode="repertoire-letter-num" />);
  expect(screen.getByText("music.clear")).toBeInTheDocument();
  rerender(<Music user={{ id: "owner" }} mode="repertoire-artist-Other" />);
  expect(state.options.artist).toBe("Other");
  rerender(<Music user={{ id: "owner" }} mode="repertoire" />);
  expect(state.options.artist).toBeUndefined();
  rerender(<Music user={{ id: "owner" }} mode="setlists" />);
  expect(screen.getByText("Open setlist song")).toBeInTheDocument();
});
it("shows empty filtered results, clears filters and offers song creation", () => {
  state.rows = [];
  open();
  fireEvent.change(screen.getByPlaceholderText("music.search_placeholder"), {
    target: { value: "Missing" },
  });
  fireEvent.click(screen.getByText("music.clear_filters"));
  expect(state.options).toMatchObject({
    search: "",
    type: "all",
    artist: undefined,
    genre_id: undefined,
    page: 0,
  });
});
