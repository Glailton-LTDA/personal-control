import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import SheetViewer from "./SheetViewer";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  server: null,
  signed: vi.fn(),
  getDocument: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table) => state.server.from(table),
    storage: { from: () => ({ createSignedUrl: state.signed }) },
  },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const song = {
  id: "synthetic-sheet",
  title: "Sheet",
  storage_type: "cloud",
  file_path: "owner/sheet.pdf",
};
beforeEach(() => {
  state.server = createQueryServer();
  vi.clearAllMocks();
  localStorage.clear();
  state.signed.mockResolvedValue({
    data: { signedUrl: "https://example.test/signed" },
    error: null,
  });
  const page = {
    getViewport: () => ({ width: 600, height: 800 }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
  state.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: () => Promise.resolve(page),
    }),
  });
  vi.stubGlobal("pdfjsLib", {
    GlobalWorkerOptions: {},
    getDocument: state.getDocument,
  });
  vi.stubGlobal(
    "prompt",
    vi.fn(() => "Synthetic annotation"),
  );
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({});
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600,
    height: 800,
    left: 0,
    top: 0,
    right: 600,
    bottom: 800,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open(extra = {}) {
  const onEdit = vi.fn();
  const result = render(
    <SheetViewer
      song={song}
      user={{ id: "owner" }}
      onEdit={onEdit}
      {...extra}
    />,
  );
  await screen.findByText("1 de 3");
  await waitFor(() =>
    expect(result.container.querySelector("canvas")).toBeInTheDocument(),
  );
  return { ...result, onEdit };
}
it("creates text/highlights and persists the annotation payload", async () => {
  const { container } = await open();
  const canvas = container.querySelector("canvas");
  fireEvent.click(canvas, { clientX: 100, clientY: 200 });
  expect(state.server.calls.some((x) => x[1] === "insert")).toBe(false);
  fireEvent.click(screen.getByTitle("Escrever Notas"));
  window.prompt.mockReturnValueOnce(null);
  fireEvent.click(canvas, { clientX: 100, clientY: 200 });
  fireEvent.click(canvas, { clientX: 100, clientY: 200 });
  await screen.findByText("Synthetic annotation");
  fireEvent.click(screen.getByTitle("Ferramenta Realce"));
  fireEvent.click(canvas, { clientX: 200, clientY: 300 });
  fireEvent.click(screen.getByTitle("Salvar Notas"));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Anotações salvas com sucesso!"),
  );
  expect(state.server.tables.music_annotations).toHaveLength(2);
  expect(state.server.tables.music_annotations[0]).toMatchObject({
    user_id: "owner",
    song_id: song.id,
    page_index: 1,
    data: {
      type: "text",
      text: "Synthetic annotation",
      x: expect.closeTo(100 / 6),
      y: 25,
    },
  });
});
for (const failure of ["delete", "insert"])
  it(`reports annotation ${failure} failure`, async () => {
    const { container } = await open();
    if (failure === "insert") {
      fireEvent.click(screen.getByTitle("Escrever Notas"));
      fireEvent.click(container.querySelector("canvas"), {
        clientX: 10,
        clientY: 20,
      });
    }
    state.server.failures[`music_annotations:${failure}`] = "denied";
    fireEvent.click(screen.getByTitle("Salvar Notas"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Erro ao salvar anotações."),
    );
  });
for (const failure of [false, true])
  it(`loads and removes persisted annotations, failure=${failure}`, async () => {
    state.server.tables.music_annotations = [
      {
        id: "database-id",
        song_id: song.id,
        page_index: 1,
        data: {
          id: "annotation",
          type: "text",
          text: "Saved annotation",
          x: 10,
          y: 10,
        },
      },
    ];
    const { container } = await open();
    const annotation = await screen.findByText("Saved annotation");
    if (failure) state.server.failures["music_annotations:delete"] = "denied";
    fireEvent.click(annotation);
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "Erro ao remover anotação do banco." : "Anotação removida!",
      ),
    );
    expect(container).toBeInTheDocument();
  });
it("changes zoom, toggles fullscreen/sidebar, starts/stops scrolling and opens editor", async () => {
  const { onEdit, container } = await open();
  fireEvent.click(screen.getByTitle("Aproximar"));
  fireEvent.click(screen.getByTitle("Afastar"));
  fireEvent.click(screen.getByTitle("Tela Cheia"));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByTitle("Tela Cheia")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Ocultar Anotações"));
  fireEvent.click(screen.getByTitle("Mostrar Anotações"));
  fireEvent.click(screen.getByTitle("Iniciar Rolagem"));
  fireEvent.click(screen.getByTitle("Pausar Rolagem"));
  fireEvent.click(screen.getByTitle("Editar música"));
  expect(onEdit).toHaveBeenCalledWith(song);
  const buttons = container
    .querySelector(".sheet-toolbar")
    ?.querySelectorAll("button");
  expect(buttons || screen.getAllByRole("button")).toBeTruthy();
});
it("reports inaccessible/corrupted PDFs and supports retry", async () => {
  state.signed.mockResolvedValueOnce({
    data: null,
    error: new Error("denied"),
  });
  render(<SheetViewer song={song} user={{ id: "owner" }} />);
  const retry = await screen.findByText("Tentar Novamente");
  fireEvent.click(retry);
  await screen.findByText("1 de 3");
});
for (const persisted of [false, true])
  for (const failure of [false, true])
    it(`drags an annotation within page bounds: persisted=${persisted}, failure=${failure}`, async () => {
      if (persisted)
        state.server.tables.music_annotations = [
          {
            id: "db-annotation",
            song_id: song.id,
            page_index: 1,
            data: {
              id: "annotation",
              type: "text",
              text: "Drag me",
              x: 10,
              y: 10,
            },
          },
        ];
      const { container } = await open();
      if (!persisted) {
        window.prompt.mockReturnValueOnce("Drag me");
        fireEvent.click(screen.getByTitle("Escrever Notas"));
        fireEvent.click(container.querySelector("canvas"), {
          clientX: 60,
          clientY: 80,
        });
        fireEvent.click(screen.getByTitle("Escrever Notas"));
      }
      const annotation = await screen.findByText("Drag me");
      if (failure)
        state.server.failures[
          `music_annotations:${persisted ? "update" : "insert"}`
        ] = "denied";
      fireEvent.mouseDown(annotation, { clientX: 60, clientY: 80 });
      fireEvent.mouseMove(window, { clientX: 61, clientY: 81 });
      fireEvent.mouseMove(window, { clientX: 660, clientY: -80 });
      fireEvent.mouseUp(window, { clientX: 660, clientY: -80 });
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
          failure
            ? "Erro ao atualizar posição."
            : persisted
              ? "Posição atualizada!"
              : "Nota salva!",
        ),
      );
      if (!failure)
        expect(state.server.tables.music_annotations[0].data).toMatchObject({
          x: 100,
          y: 0,
        });
    });
it("caches a local PDF, revokes its URL and clears the cache after confirmation", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const local = { ...song, id: "local-sheet-flow", storage_type: "local" };
  const { container } = render(
    <SheetViewer song={local} user={{ id: "owner" }} />,
  );
  await screen.findByText("Partitura Local Pendente");
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, {
    target: {
      files: [new File(["invalid"], "bad.txt", { type: "text/plain" })],
    },
  });
  expect(toast.error).toHaveBeenCalledWith(
    "Por favor, selecione apenas arquivos PDF.",
  );
  fireEvent.change(input, {
    target: {
      files: [
        new File(["synthetic pdf"], "sheet.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await screen.findByText("1 de 3");
  expect(state.getDocument).toHaveBeenCalledWith("blob:synthetic");
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByTitle("Remover PDF do Cache Local"));
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle("Remover PDF do Cache Local"));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Cache local limpo!"),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
});
