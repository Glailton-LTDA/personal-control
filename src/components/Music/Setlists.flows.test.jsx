import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import Setlists from "./Setlists";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const first = {
  id: "first",
  title: "First song",
  artist: "Artist",
  type: "cifra",
  user_id: "owner",
};
beforeEach(() => {
  state.server = createQueryServer();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.server.tables = {
    music_setlists: [
      {
        id: "setlist",
        user_id: "owner",
        name: "My setlist",
        description: "Description",
      },
    ],
    music_setlist_songs: [
      {
        setlist_id: "setlist",
        song_id: "first",
        order_index: 1,
        music_songs: first,
      },
      {
        setlist_id: "setlist",
        song_id: "second",
        order_index: 2,
        music_songs: {
          ...first,
          id: "second",
          title: "Second song",
          type: "partitura",
        },
      },
    ],
    music_songs: [first, { ...first, id: "third", title: "Third song" }],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function open() {
  const onSelectSong = vi.fn();
  const result = render(
    <Setlists user={{ id: "owner" }} onSelectSong={onSelectSong} />,
  );
  await screen.findByText("My setlist");
  return { ...result, onSelectSong };
}
for (const failure of [false, true])
  it(`creates setlist, failure=${failure}`, async () => {
    const { container } = await open();
    fireEvent.click(screen.getByText("Novo Setlist"));
    const name = screen.getByPlaceholderText("Ex: Show Acústico 2026");
    fireEvent.submit(name.closest("form"));
    expect(toast.error).toHaveBeenCalledWith("Informe o nome do setlist.");
    fireEvent.change(name, { target: { value: " New setlist " } });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Ex: Repertório para o show de sexta no pub.",
      ),
      { target: { value: "Description" } },
    );
    if (failure) state.server.failures["music_setlists:insert"] = "denied";
    fireEvent.submit(container.querySelector("form"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao salvar setlist." : "Setlist criado com sucesso!",
      ),
    );
  });
for (const failure of [false, true])
  it(`confirms deletion, failure=${failure}`, async () => {
    await open();
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle("Excluir Setlist"));
    expect(state.server.tables.music_setlists).toHaveLength(1);
    if (failure) state.server.failures["music_setlists:delete"] = "denied";
    fireEvent.click(screen.getByTitle("Excluir Setlist"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao excluir setlist." : "Setlist excluído!",
      ),
    );
  });
for (const failure of [false, true])
  it(`moves, selects and removes songs, failure=${failure}`, async () => {
    const { onSelectSong } = await open();
    fireEvent.click(screen.getByText("My setlist"));
    await screen.findByText("First song");
    if (failure) state.server.failures["music_setlist_songs:update"] = "denied";
    fireEvent.click(screen.getAllByTitle("Mover para baixo")[0]);
    await waitFor(() =>
      expect(state.server.calls.some((x) => x[1] === "update")).toBe(true),
    );
    if (failure)
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Erro ao reordenar músicas."),
      );
    else
      await waitFor(() =>
        expect(
          state.server.tables.music_setlist_songs.find(
            (x) => x.song_id === "first",
          ).order_index,
        ).toBe(2),
      );
    fireEvent.click(screen.getAllByTitle("Executar / Visualizar")[0]);
    expect(onSelectSong).toHaveBeenCalledWith(first);
    if (failure) state.server.failures["music_setlist_songs:delete"] = "denied";
    fireEvent.click(screen.getAllByTitle("Remover do Setlist")[0]);
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure
          ? "Erro ao remover música do setlist."
          : "Música removida do setlist.",
      ),
    );
  });
for (const failure of [false, true])
  it(`filters repertoire and adds a song, failure=${failure}`, async () => {
    await open();
    fireEvent.click(screen.getByText("My setlist"));
    await screen.findByText("First song");
    fireEvent.click(screen.getByText("Adicionar Música"));
    const third = await screen.findByText("Third song");
    if (failure) state.server.failures["music_setlist_songs:insert"] = "denied";
    fireEvent.click(
      third.closest("div").querySelector("button") ||
        third.parentElement.parentElement.querySelector("button"),
    );
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao adicionar música." : "Third song adicionada!",
      ),
    );
    const search = screen.getByPlaceholderText("Buscar título ou artista...");
    vi.useFakeTimers();
    fireEvent.change(search, { target: { value: "Artist" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(state.server.calls.some((x) => x[1] === "or")).toBe(true);
    vi.useRealTimers();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "cifra" },
    });
    expect(state.server.calls).toContainEqual([
      "music_songs",
      "eq",
      "type",
      "cifra",
    ]);
  });
