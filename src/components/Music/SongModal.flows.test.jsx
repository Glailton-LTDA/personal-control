import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import { db, putMusicSong, putMusicSetlistSong } from "../../lib/offline/db";
import SongModal from "./SongModal";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  server: null,
  online: true,
  upload: vi.fn(),
  enqueue: vi.fn(),
  destroy: vi.fn(),
  invalidate: vi.fn(),
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table) => state.server.from(table),
    storage: { from: () => ({ upload: state.upload }) },
  },
}));
vi.mock("../../hooks/useOfflineMusic", () => ({
  useOfflineGenres: () => ({ data: [{ id: "rock", name: "Rock" }] }),
  useOfflineSetlists: () => ({ data: [{ id: "new-list", name: "New list" }] }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("../../lib/offline/SyncEngine", () => ({
  SyncEngine: class {
    isOnline = state.online;
    enqueue = state.enqueue;
    destroy = state.destroy;
  },
}));
vi.mock("../ui/MultiSelect", () => ({
  default: ({ onChange, selected }) => (
    <button
      data-selected={selected.join(",")}
      type="button"
      onClick={() => onChange(["new-list"])}
    >
      Choose setlist
    </button>
  ),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
beforeEach(async () => {
  state.server = createQueryServer();
  state.online = true;
  vi.clearAllMocks();
  state.upload.mockResolvedValue({ error: null });
  await Promise.all(
    ["music_songs", "music_setlist_songs"].map((t) => db[t].clear()),
  );
});
afterEach(cleanup);
function open(extra = {}) {
  const onClose = vi.fn(),
    onRefresh = vi.fn(),
    onSaved = vi.fn();
  return {
    ...render(
      <SongModal
        isOpen
        user={{ id: "owner" }}
        onClose={onClose}
        onRefresh={onRefresh}
        onSaved={onSaved}
        {...extra}
      />,
    ),
    onClose,
    onRefresh,
    onSaved,
  };
}
for (const edit of [false, true])
  for (const online of [false, true])
    it(`saves chord sheets: edit=${edit}, online=${online}`, async () => {
      state.online = online;
      const song = {
        id: "song",
        user_id: "owner",
        title: "Old",
        type: "cifra",
      };
      if (edit) {
        await putMusicSong(song);
        await putMusicSetlistSong({
          setlist_id: "old-list",
          song_id: "song",
          order_index: 1,
        });
        state.server.tables.music_songs = [song];
      }
      const { container, onClose, onSaved } = open({
        initialData: edit ? song : null,
      });
      fireEvent.change(screen.getByPlaceholderText("music.title_placeholder"), {
        target: { value: " New song " },
      });
      fireEvent.change(
        screen.getByPlaceholderText("music.artist_placeholder"),
        { target: { value: " Artist " } },
      );
      fireEvent.change(screen.getByPlaceholderText("music.link_placeholder"), {
        target: { value: "https://example.test" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("music.content_placeholder"),
        { target: { value: "C Am" } },
      );
      fireEvent.change(screen.getAllByRole("combobox")[0], {
        target: { value: "rock" },
      });
      if (edit) {
        await waitFor(() =>
          expect(screen.getByText("Choose setlist")).toHaveAttribute(
            "data-selected",
            "old-list",
          ),
        );
        fireEvent.click(screen.getByText("Choose setlist"));
      }
      fireEvent.submit(container.querySelector("form"));
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      const saved = await db.music_songs.toArray();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        title: "New song",
        artist: "Artist",
        content: "C Am",
        genre_id: "rock",
        storage_type: "local",
      });
      expect(state.destroy).toHaveBeenCalledOnce();
      if (!online)
        expect(state.enqueue).toHaveBeenCalledWith(
          "music_songs",
          expect.any(String),
          edit ? "update" : "insert",
          expect.objectContaining({ title: "New song" }),
        );
      if (edit) {
        expect(onSaved).toHaveBeenCalled();
        expect(await db.music_setlist_songs.toArray()).toMatchObject([
          { setlist_id: "new-list", song_id: "song" },
        ]);
      }
    });
for (const storage of ["local", "cloud"])
  for (const failure of [false, true])
    it(`saves PDF ${storage}, failure=${failure}`, async () => {
      const { container, onClose } = open();
      fireEvent.change(screen.getByPlaceholderText("music.title_placeholder"), {
        target: { value: "Sheet" },
      });
      fireEvent.change(screen.getAllByRole("combobox")[1], {
        target: { value: "partitura" },
      });
      if (storage === "local") {
        if (!failure)
          fireEvent.change(
            screen.getByPlaceholderText("music.local_filename_placeholder"),
            { target: { value: " sheet.pdf " } },
          );
      } else {
        fireEvent.click(screen.getByText("music.cloud_sync"));
        if (failure)
          state.upload.mockResolvedValueOnce({ error: new Error("synthetic") });
        fireEvent.change(container.querySelector('input[type="file"]'), {
          target: {
            files: [
              new File(["synthetic"], "sheet.pdf", { type: "application/pdf" }),
            ],
          },
        });
      }
      fireEvent.submit(container.querySelector("form"));
      if (failure) {
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const [saved] = await db.music_songs.toArray();
        expect(saved).toMatchObject({
          type: "partitura",
          content: null,
          storage_type: storage,
        });
        expect(saved.file_path).toMatch(
          storage === "local" ? /^sheet.pdf$/ : /^owner\/.+_sheet.pdf$/,
        );
      }
    });
it("rejects an empty title and preserves editing when the local write fails", async () => {
  const { container, onClose } = open();
  fireEvent.submit(container.querySelector("form"));
  expect(toast.error).toHaveBeenCalledWith("music.title_required");
  fireEvent.change(screen.getByPlaceholderText("music.title_placeholder"), {
    target: { value: "Song" },
  });
  vi.spyOn(db.music_songs, "put").mockRejectedValueOnce(new Error("synthetic"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.submit(container.querySelector("form"));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("music.error_save_song"),
  );
  expect(onClose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("does not render when closed", () => {
  const { container } = open({ isOpen: false });
  expect(container).toBeEmptyDOMElement();
});
