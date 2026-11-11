import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import ChordSettings from "./ChordSettings";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  server: null,
  invalidate: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("../../lib/offline/SyncEngine", () => ({
  SyncEngine: class {
    sync = state.sync;
  },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./ChordDiagram", () => ({
  default: ({ name, frets, startFret }) => (
    <output data-testid="chord-diagram">
      {JSON.stringify({ name, frets, startFret })}
    </output>
  ),
}));
const variation = (id, index) => ({
  id,
  variation_index: index,
  frets: [0, 1, 2, 0, 0, 0],
  fingers: [0, 1, 2, 0, 0, 0],
  start_fret: 1,
});
beforeEach(() => {
  state.server = createQueryServer();
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.server.tables = {
    music_instruments: [
      { id: "guitar", name: "violao", user_id: "owner", strings_count: 6 },
    ],
    music_chords: [
      {
        id: "chord",
        instrument_id: "guitar",
        chord_name: "C",
        music_chord_variations: [variation("v2", 1), variation("v1", 0)],
      },
    ],
    music_chord_variations: [
      { ...variation("v1", 0), chord_id: "chord" },
      { ...variation("v2", 1), chord_id: "chord" },
    ],
    music_genres: [{ id: "rock", name: "Rock" }],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  const result = render(<ChordSettings user={{ id: "owner" }} />);
  await screen.findByTitle("Editar");
  return result.container;
}
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`saves chord variations: edit=${edit}, failure=${failure}`, async () => {
      const container = await open();
      fireEvent.click(
        edit ? screen.getByTitle("Editar") : screen.getByText("Criar Acorde"),
      );
      const name = screen.getByPlaceholderText("Ex: D9/F# ou C");
      fireEvent.change(name, { target: { value: "Dm" } });
      const form = name.closest("form");
      const frets = form.querySelectorAll("select");
      fireEvent.change(frets[0], { target: { value: "3" } });
      fireEvent.change(frets[1], { target: { value: "2" } });
      fireEvent.change(frets[0], { target: { value: "0" } });
      fireEvent.change(form.querySelector('input[type="number"]'), {
        target: { value: "5" },
      });
      fireEvent.click(screen.getByText("Nova"));
      fireEvent.click(screen.getByText("Excluir Variação Atual"));
      if (edit) {
        fireEvent.click(screen.getByText("Var. 2"));
        fireEvent.click(screen.getByText("Excluir Variação Atual"));
      }
      if (failure)
        state.server.failures[
          "music_chord_variations:" + (edit ? "update" : "insert")
        ] = "denied";
      fireEvent.submit(form);
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
          failure ? "Erro ao salvar acorde." : "Acorde gravado com sucesso!",
        ),
      );
      if (!failure) {
        expect(
          state.server.tables.music_chords.some((x) => x.chord_name === "Dm"),
        ).toBe(true);
        await waitFor(() =>
          expect(state.invalidate).toHaveBeenCalledWith({
            queryKey: ["offline_chords"],
          }),
        );
      }
      expect(container).toBeInTheDocument();
    });
it("switches variations, searches names and cancels edit", async () => {
  await open();
  fireEvent.click(screen.getByTitle("Próxima Variação"));
  expect(screen.getByTitle("Próxima Variação")).toBeDisabled();
  fireEvent.click(screen.getByTitle("Variação Anterior"));
  fireEvent.change(
    screen.getByPlaceholderText("Buscar acorde... (ex: C7, Dm)"),
    { target: { value: "missing" } },
  );
  expect(screen.queryByTitle("Editar")).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByPlaceholderText("Buscar acorde... (ex: C7, Dm)"),
    { target: { value: "C" } },
  );
  fireEvent.click(screen.getByTitle("Editar"));
  fireEvent.click(screen.getByText("Cancelar"));
  expect(
    screen.queryByPlaceholderText("Ex: D9/F# ou C"),
  ).not.toBeInTheDocument();
});
for (const failure of [false, true])
  it(`deletes a chord only after confirmation, failure=${failure}`, async () => {
    await open();
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle("Excluir"));
    expect(state.server.tables.music_chords).toHaveLength(1);
    if (failure) state.server.failures["music_chords:delete"] = "denied";
    fireEvent.click(screen.getByTitle("Excluir"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao excluir acorde." : "Acorde excluído!",
      ),
    );
  });
for (const failure of [false, true])
  it(`creates and removes genre, failure=${failure}`, async () => {
    await open();
    fireEvent.click(screen.getByText("Gêneros Musicais"));
    const input = await screen.findByPlaceholderText("Ex: MPB, Rock, Jazz...");
    fireEvent.change(input, { target: { value: " Jazz " } });
    if (failure) state.server.failures["music_genres:insert"] = "denied";
    fireEvent.submit(input.closest("form"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure
          ? "Erro ao cadastrar gênero."
          : "Gênero adicionado com sucesso!",
      ),
    );
    if (failure) state.server.failures["music_genres:delete"] = "denied";
    fireEvent.click(screen.getAllByTitle("Excluir Gênero")[0]);
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao excluir gênero." : "Gênero excluído com sucesso!",
      ),
    );
  });
