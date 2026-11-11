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
import MarkdownNotes from "./MarkdownNotes";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const user = { id: "owner", email: "OWNER@example.test" };
const note = {
  id: "note",
  notebook_id: "book",
  user_id: "owner",
  title: "My note",
  content: "- [ ] Task",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
beforeEach(() => {
  state.server = createQueryServer();
  state.server.tables = {
    markdown_notebooks: [{ id: "book", name: "Notebook", user_id: "owner" }],
    markdown_notes: [{ ...note }],
    markdown_notebook_shares: [],
    markdown_note_shares: [],
    finance_responsibles: [],
  };
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal(
    "prompt",
    vi.fn(() => "New notebook"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function open() {
  render(<MarkdownNotes user={user} />);
  await screen.findByText("My note");
  fireEvent.click(screen.getByText("My note"));
  return screen.findByPlaceholderText("lists.notes_view.content_placeholder");
}
it("edits title/content, flushes when switching, renders Markdown and toggles tasks", async () => {
  const content = await open();
  fireEvent.change(
    screen.getByPlaceholderText("lists.notes_view.title_placeholder"),
    { target: { value: "Updated" } },
  );
  fireEvent.change(content, { target: { value: "- [ ] Updated task" } });
  fireEvent.click(screen.getByTitle("lists.notes_view.new_note"));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("lists.notes_view.note_created"),
  );
  await waitFor(() =>
    expect(
      state.server.tables.markdown_notes.find((x) => x.id === "note").title,
    ).toBe("Updated"),
  );
  fireEvent.click(screen.getByText("Updated"));
  fireEvent.click(screen.getByText("lists.notes_view.preview"));
  await screen.findAllByText("Updated task");
  fireEvent.click(document.querySelector(".preview-checkbox-toggle"));
  await waitFor(() =>
    expect(
      state.server.tables.markdown_notes.find((x) => x.id === "note").content,
    ).toBe("- [x] Updated task"),
  );
  fireEvent.click(document.querySelector(".preview-checkbox-toggle"));
  await waitFor(() =>
    expect(
      state.server.tables.markdown_notes.find((x) => x.id === "note").content,
    ).toBe("- [ ] Updated task"),
  );
});
const syntax = [
  ["h1", "# text"],
  ["h2", "## text"],
  ["h3", "### text"],
  ["bold", "**text**"],
  ["italic", "*text*"],
  ["unordered_list", "- text"],
  ["checklist_tool", "- [ ] text"],
  ["ordered_list", "1. text"],
  ["code_tool", "`text`"],
  ["link_tool", "[text](url)"],
  ["hr_tool", "\n---\n"],
  ["table_tool", "| Coluna 1 | Coluna 2 |\n|----------|----------|\n|  |  |"],
];
for (const [button, expected] of syntax)
  for (const selected of [false, true])
    it(`inserts ${button} with selection=${selected}`, async () => {
      const content = await open();
      fireEvent.change(content, { target: { value: selected ? "text" : "" } });
      content.setSelectionRange(0, selected ? 4 : 0);
      fireEvent.click(screen.getByTitle(`lists.notes_view.${button}`));
      expect(content.value).toBe(
        selected ? expected : expected.replaceAll("text", ""),
      );
      // Flush the pending debounce through a real note switch so no save leaks between tests.
      fireEvent.click(screen.getByTitle("lists.notes_view.new_note"));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });
it("filters notes by title/content and persists bounded font preferences", async () => {
  await open();
  const search = screen.getByPlaceholderText(
    "lists.notes_view.search_placeholder",
  );
  fireEvent.change(search, { target: { value: "missing" } });
  expect(
    screen.queryByTitle("lists.notes_view.delete_note"),
  ).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "Task" } });
  expect(screen.getByTitle("lists.notes_view.delete_note")).toBeInTheDocument();
  for (let i = 0; i < 15; i++)
    fireEvent.click(screen.getByTitle("lists.notes_view.zoom_in"));
  expect(localStorage.getItem("notes_font_size")).toBe("32");
  for (let i = 0; i < 15; i++)
    fireEvent.click(screen.getByTitle("lists.notes_view.zoom_out"));
  expect(localStorage.getItem("notes_font_size")).toBe("10");
  fireEvent.click(screen.getAllByTitle("lists.notes_view.hide_sidebar")[0]);
  fireEvent.click(screen.getByTitle("lists.notes_view.show_sidebar"));
});
it("keeps a note after cancelled or failed deletion, then removes it", async () => {
  await open();
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByTitle("lists.notes_view.delete_note"));
  expect(state.server.tables.markdown_notes).toHaveLength(1);
  state.server.failures["markdown_notes:delete"] = "denied";
  fireEvent.click(screen.getByTitle("lists.notes_view.delete_note"));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("lists.notes_view.error_delete"),
  );
  delete state.server.failures["markdown_notes:delete"];
  fireEvent.click(screen.getByTitle("lists.notes_view.delete_note"));
  await waitFor(() => expect(state.server.tables.markdown_notes).toEqual([]));
});
for (const failure of ["error", "empty"])
  it(`reports failed note creation: ${failure}`, async () => {
    await open();
    if (failure === "error")
      state.server.failures["markdown_notes:insert"] = "denied";
    else state.server.emptyWrites = true;
    fireEvent.click(screen.getByTitle("lists.notes_view.new_note"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("lists.notes_view.error_load"),
    );
  });
it("initializes a default notebook when no owned collection exists", async () => {
  state.server.tables.markdown_notebooks = [];
  render(<MarkdownNotes user={user} />);
  await screen.findByTitle("lists.notes_view.new_note");
  expect(state.server.tables.markdown_notebooks).toMatchObject([
    { user_id: "owner", name: "Minhas Notas" },
  ]);
});
for (const failure of ["error", "empty"])
  it(`reports failed default collection creation: ${failure}`, async () => {
    state.server.tables.markdown_notebooks = [];
    if (failure === "error")
      state.server.failures["markdown_notebooks:insert"] = "denied";
    else state.server.emptyWrites = true;
    render(<MarkdownNotes user={user} />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("lists.notes_view.error_init"),
    );
  });
it("protects the only notebook, creates another and switches collections", async () => {
  await open();
  expect(
    screen.queryByTitle("lists.notes_view.delete_notebook"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle("lists.notes_view.new_notebook"));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "lists.notes_view.notebook_created",
    ),
  );
  expect(localStorage.getItem("notes_active_collection_id")).toMatch(
    /^created-/,
  );
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "book" },
  });
  await screen.findByText("My note");
  expect(localStorage.getItem("notes_active_collection_id")).toBe("book");
});
for (const kind of ["notebook", "note"])
  for (const failure of [false, true])
    it(`shares ${kind} and handles API failure=${failure}`, async () => {
      await open();
      const table =
        kind === "notebook"
          ? "markdown_notebook_shares"
          : "markdown_note_shares";
      fireEvent.click(
        screen.getByTitle(
          kind === "notebook"
            ? "lists.notes_view.share_notes"
            : "lists.notes_view.share_note_title",
        ),
      );
      const email = await screen.findByPlaceholderText(
        "lists.notes_view.email_placeholder",
      );
      fireEvent.change(email, { target: { value: "friend@example.test" } });
      fireEvent.change(email.closest("form").querySelector("select"), {
        target: { value: "READ" },
      });
      if (failure) state.server.failures[`${table}:insert`] = "denied";
      fireEvent.submit(email.closest("form"));
      if (failure) {
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(email.value).toBe("friend@example.test");
        return;
      }
      await waitFor(() => expect(state.server.tables[table]).toHaveLength(1));
      expect(state.server.tables[table][0]).toMatchObject({
        shared_by: "owner",
        shared_by_email: "owner@example.test",
        shared_with_email: "friend@example.test",
        permission: "READ",
      });
      const revoke = await screen.findByTitle("lists.notes_view.revoke_access");
      window.confirm.mockReturnValueOnce(false);
      fireEvent.click(revoke);
      expect(state.server.tables[table]).toHaveLength(1);
      fireEvent.click(revoke);
      await waitFor(() => expect(state.server.tables[table]).toEqual([]));
    });
for (const failure of [false, true])
  it(`moves a note to another owned notebook, failure=${failure}`, async () => {
    state.server.tables.markdown_notebooks.push({
      id: "second",
      name: "Second",
      user_id: "owner",
    });
    await open();
    if (failure) state.server.failures["markdown_notes:update"] = "denied";
    const move = screen
      .getAllByRole("combobox")
      .find((e) => e.querySelector("option[disabled]"));
    fireEvent.change(move, { target: { value: "second" } });
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure
          ? "lists.notes_view.error_move_note"
          : "lists.notes_view.note_moved",
      ),
    );
    expect(state.server.tables.markdown_notes[0].notebook_id).toBe(
      failure ? "book" : "second",
    );
  });
for (const failure of [
  "",
  "markdown_notebook_shares:delete",
  "markdown_notes:delete",
  "markdown_notebooks:delete",
])
  it(`deletes a notebook in UI order, error=${failure}`, async () => {
    state.server.tables.markdown_notebooks.push({
      id: "second",
      name: "Second",
      user_id: "owner",
    });
    await open();
    if (failure) state.server.failures[failure] = "denied";
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle("lists.notes_view.delete_notebook"));
    expect(state.server.tables.markdown_notebooks).toHaveLength(2);
    fireEvent.click(screen.getByTitle("lists.notes_view.delete_notebook"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure
          ? "lists.notes_view.error_delete_notebook"
          : "lists.notes_view.notebook_deleted",
      ),
    );
    expect(state.server.tables.markdown_notebooks).toHaveLength(
      failure ? 2 : 1,
    );
  });
for (const permission of ["READ", "WRITE"])
  it(`loads notebook sharing permission ${permission}`, async () => {
    state.server.tables.markdown_notebooks.push({
      id: "shared",
      name: "Shared notebook",
      user_id: "other",
    });
    state.server.tables.markdown_notebook_shares = [
      {
        id: "grant",
        notebook_id: "shared",
        shared_with_email: "owner@example.test",
        shared_by_email: "sender@example.test",
        permission,
      },
    ];
    state.server.tables.markdown_notes.push({
      ...note,
      id: "shared-note",
      notebook_id: "shared",
      user_id: "other",
      title: "Shared note",
    });
    state.server.tables.finance_responsibles = [
      { user_id: "other", name: "Sender", email: "sender@example.test" },
      { user_id: "third", name: null, email: "third@example.test" },
    ];
    localStorage.setItem("notes_active_collection_id", "shared");
    render(<MarkdownNotes user={user} />);
    fireEvent.click(await screen.findByText("Shared note"));
    if (permission === "READ") {
      expect(
        screen.queryByPlaceholderText("lists.notes_view.content_placeholder"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTitle("lists.notes_view.new_note"),
      ).not.toBeInTheDocument();
    } else
      expect(
        await screen.findByPlaceholderText(
          "lists.notes_view.content_placeholder",
        ),
      ).toBeInTheDocument();
    expect(
      screen.queryByTitle("lists.notes_view.share_note_title"),
    ).not.toBeInTheDocument();
  });
it("loads individual email shares in a virtual read-only collection", async () => {
  state.server.tables.markdown_note_shares = [
    {
      id: "grant",
      note_id: "shared-note",
      shared_with_email: "owner@example.test",
      shared_by_email: "sender@example.test",
      permission: "READ",
    },
  ];
  state.server.tables.markdown_notes.push({
    ...note,
    id: "shared-note",
    user_id: "other",
    title: "Email note",
  });
  localStorage.setItem(
    "notes_active_collection_id",
    "shared-by-email-sender@example.test",
  );
  render(<MarkdownNotes user={user} />);
  fireEvent.click(await screen.findByText("Email note"));
  expect(
    screen.queryByPlaceholderText("lists.notes_view.content_placeholder"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByTitle("lists.notes_view.new_note"),
  ).not.toBeInTheDocument();
});
it("shows save failure after debounce and permits a later successful retry", async () => {
  const content = await open();
  state.server.failures["markdown_notes:update"] = "denied";
  vi.useFakeTimers();
  fireEvent.change(content, { target: { value: "Draft" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(state.server.tables.markdown_notes[0].content).toBe("- [ ] Task");
  delete state.server.failures["markdown_notes:update"];
  fireEvent.change(content, { target: { value: "Retried" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(state.server.tables.markdown_notes[0].content).toBe("Retried");
});
for (const table of ["markdown_notebooks", "markdown_notes"])
  it(`reports ${table} read failure`, async () => {
    state.server.failures[`${table}:select`] = "denied";
    render(<MarkdownNotes user={user} />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        table === "markdown_notebooks"
          ? "lists.notes_view.error_init"
          : "lists.notes_view.error_load",
      ),
    );
  });
for (const answer of [null, "   "])
  it(`cancels notebook creation for name ${answer}`, async () => {
    await open();
    window.prompt.mockReturnValueOnce(answer);
    fireEvent.click(screen.getByTitle("lists.notes_view.new_notebook"));
    expect(
      state.server.calls.some(
        (x) => x[0] === "markdown_notebooks" && x[1] === "insert",
      ),
    ).toBe(false);
  });
for (const failure of ["error", "empty"])
  it(`retains active notebook when creation returns ${failure}`, async () => {
    await open();
    if (failure === "error")
      state.server.failures["markdown_notebooks:insert"] = "denied";
    else state.server.emptyWrites = true;
    fireEvent.click(screen.getByTitle("lists.notes_view.new_notebook"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "lists.notes_view.error_create_notebook",
      ),
    );
    expect(localStorage.getItem("notes_active_collection_id")).toBe("book");
  });
it("flushes the pending draft before switching notebooks and restores font preferences", async () => {
  localStorage.setItem("notes_font_size", "18");
  state.server.tables.markdown_notebooks.push({
    id: "second",
    name: "Second",
    user_id: "owner",
  });
  const content = await open();
  fireEvent.click(screen.getByTitle("lists.notes_view.zoom_in"));
  expect(localStorage.getItem("notes_font_size")).toBe("20");
  fireEvent.change(content, { target: { value: "Pending draft" } });
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "second" },
  });
  await waitFor(() =>
    expect(localStorage.getItem("notes_active_collection_id")).toBe("second"),
  );
  expect(
    state.server.tables.markdown_notes.find((x) => x.id === "note").content,
  ).toBe("Pending draft");
});
for (const scenario of ["no-shares", "share-error", "notes-error", "write"])
  it(`loads individual email shares with ${scenario}`, async () => {
    state.server.tables.markdown_note_shares = [
      {
        id: "grant",
        note_id: "shared-note",
        shared_with_email: "owner@example.test",
        shared_by_email: "sender@example.test",
        permission: scenario === "write" ? "WRITE" : "READ",
      },
    ];
    state.server.tables.markdown_notes.push({
      ...note,
      id: "shared-note",
      user_id: "other",
      title: "Email shared",
    });
    await open();
    if (scenario === "no-shares") state.server.tables.markdown_note_shares = [];
    if (scenario === "share-error")
      state.server.failures["markdown_note_shares:select"] = "denied";
    if (scenario === "notes-error")
      state.server.failures["markdown_notes:select"] = "denied";
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "shared-by-email-sender@example.test" },
    });
    if (scenario.endsWith("error"))
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("lists.notes_view.error_load"),
      );
    else if (scenario === "no-shares")
      await waitFor(() =>
        expect(screen.queryByText("Email shared")).not.toBeInTheDocument(),
      );
    else {
      fireEvent.click(await screen.findByText("Email shared"));
      expect(
        await screen.findByPlaceholderText(
          "lists.notes_view.content_placeholder",
        ),
      ).toHaveValue("- [ ] Task");
    }
  });
