import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
  act,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import CustomLists from "./CustomLists";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../Trips/AddressInput", () => ({
  default: ({ value, onChange, placeholder }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("framer-motion", () => {
  const element = ({ children, onClick, className, style }) => (
    <div onClick={onClick} className={className} style={style}>
      {children}
    </div>
  );
  return {
    motion: {
      div: element,
      button: ({ children, onClick, ...props }) => (
        <button onClick={onClick} data-testid={props["data-testid"]}>
          {children}
        </button>
      ),
    },
    AnimatePresence: ({ children }) => children,
    Reorder: {
      Item: element,
      Group: ({ children, onReorder, values }) => (
        <div>
          <button onClick={() => onReorder([...values].reverse())}>
            Move last item first
          </button>
          {children}
        </div>
      ),
    },
  };
});
const user = { id: "owner", email: "owner@example.test" };
const fields = [
  "text",
  "textarea",
  "markdown",
  "number",
  "date",
  "checkbox",
  "address",
  "link",
].map((type) => ({ id: type, name: `Field ${type}`, type }));
const md =
  "# Heading\n## Second\n### Third\n**bold** *italic* ~~strike~~ `code` [link](https://example.test)\n---\n- bullet\n  - nested\n1. ordered\n- [ ] task\n> quote\n| Name | Value |\n|---|---|\n| x | |\n```\n<unsafe>\n```\nparagraph";
const values = {
  text: "Entry",
  textarea: "Long description",
  markdown: md,
  number: "12",
  date: "2026-01-01",
  checkbox: true,
  address: "Test street",
  link: "example.test",
};
function item(id, data, completed = false, order_index = 0) {
  return {
    id,
    list_id: "list",
    user_id: "owner",
    completed,
    order_index,
    created_at: `2026-01-0${order_index + 1}`,
    content: JSON.stringify(data),
  };
}
beforeEach(() => {
  state.server = createQueryServer();
  state.server.tables = {
    custom_lists: [
      {
        id: "list",
        user_id: "owner",
        name: "Collection",
        description: "Test description",
        fields,
      },
    ],
    custom_list_items: [item("entry", values)],
    custom_list_shares: [],
  };
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function open(extra = {}) {
  const result = render(<CustomLists user={user} {...extra} />);
  if (extra.mode === "settings")
    await screen.findByTitle("lists.edit_structure");
  else await screen.findByTestId("select-sort-by");
  return result.container;
}
for (const width of [390, 1280])
  it(`renders all field types and Markdown, including missing values at width ${width}`, async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    state.server.tables.custom_list_items.push(item("empty", {}, true, 1));
    await open();
    await screen.findByText("Heading");
    expect(screen.getByRole("link", { name: "example.test" })).toHaveAttribute(
      "href",
      "https://example.test",
    );
    expect(screen.getByText("<unsafe>")).toBeInTheDocument();
    expect(screen.getByText("Long description")).toBeInTheDocument();
    expect(screen.getByText("common.yes")).toBeInTheDocument();
    expect(screen.getByText("common.no")).toBeInTheDocument();
  });
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`saves all item field types: edit=${edit}, failure=${failure}`, async () => {
      await open();
      await screen.findByText("Entry");
      if (edit) {
        const card = screen.getByText("Entry").closest(".glass-card");
        fireEvent.click(card.querySelector(".icon-btn"));
      } else fireEvent.click(screen.getByText("lists.new_item"));
      fireEvent.change(
        screen.getByPlaceholderText("lists.default_placeholder"),
        { target: { value: "Changed" } },
      );
      fireEvent.change(screen.getByPlaceholderText("lists.text_placeholder"), {
        target: { value: "Changed description" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("lists.number_placeholder"),
        { target: { value: "50" } },
      );
      fireEvent.change(screen.getByPlaceholderText("lists.url_placeholder"), {
        target: { value: "https://example.test/new" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("lists.address_placeholder"),
        { target: { value: "New street" } },
      );
      fireEvent.change(document.querySelector('input[type="date"]'), {
        target: { value: "2026-02-02" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Field checkbox" }));
      fireEvent.change(
        screen.getByPlaceholderText("lists.markdown_placeholder_item"),
        { target: { value: "## New heading" } },
      );
      if (failure)
        state.server.failures[
          `custom_list_items:${edit ? "update" : "insert"}`
        ] = "denied";
      fireEvent.click(screen.getByText("lists.save_item"));
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
          failure
            ? "common.error_save"
            : edit
              ? "common.success_update"
              : "common.success_save",
        ),
      );
      if (!failure) {
        const saved = state.server.tables.custom_list_items.find(
          (x) => JSON.parse(x.content).text === "Changed",
        );
        expect(JSON.parse(saved.content)).toMatchObject({
          number: "50",
          date: "2026-02-02",
          markdown: "## New heading",
          address: "New street",
        });
      }
    });
it("cancels item editing and completion failures preserve the row", async () => {
  await open();
  const card = (await screen.findByText("Entry")).closest(".glass-card");
  state.server.failures["custom_list_items:update"] = "denied";
  fireEvent.click(within(card).getByText("common.pending"));
  await waitFor(() => expect(console.error).toHaveBeenCalled());
  expect(state.server.tables.custom_list_items[0].completed).toBe(false);
  delete state.server.failures["custom_list_items:update"];
  fireEvent.click(within(card).getByText("common.pending"));
  await waitFor(() =>
    expect(state.server.tables.custom_list_items[0].completed).toBe(true),
  );
  fireEvent.click(card.querySelector(".icon-btn"));
  fireEvent.click(screen.getByText("lists.cancel_item"));
  expect(screen.queryByText("lists.save_item")).not.toBeInTheDocument();
});
it("cancels, rejects then completes item deletion", async () => {
  await open();
  const card = (await screen.findByText("Entry")).closest(".glass-card");
  const remove = card.querySelectorAll(".icon-btn")[1];
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(remove);
  expect(state.server.tables.custom_list_items).toHaveLength(1);
  state.server.failures["custom_list_items:delete"] = "denied";
  fireEvent.click(remove);
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("common.error_delete"),
  );
  delete state.server.failures["custom_list_items:delete"];
  fireEvent.click(remove);
  await waitFor(() =>
    expect(screen.queryByText("Entry")).not.toBeInTheDocument(),
  );
});
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`settings saves collection structure: edit=${edit}, failure=${failure}`, async () => {
      await open({ mode: "settings" });
      fireEvent.click(
        edit
          ? screen.getByTitle("lists.edit_structure")
          : screen.getByTestId("btn-add-collection-settings"),
      );
      fireEvent.change(screen.getByTestId("input-list-name"), {
        target: { value: "Changed collection" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("lists.optional_placeholder"),
        { target: { value: "New description" } },
      );
      fireEvent.click(screen.getByText("lists.add_field"));
      const names = screen.getAllByPlaceholderText(
        "lists.field_name_placeholder",
      );
      fireEvent.change(names.at(-1), { target: { value: "Extra" } });
      const types = screen.getAllByRole("combobox");
      fireEvent.change(types.at(-1), { target: { value: "number" } });
      const row = names.at(-1).parentElement;
      fireEvent.click(row.querySelector("button"));
      if (failure)
        state.server.failures[`custom_lists:${edit ? "update" : "insert"}`] =
          "denied";
      fireEvent.click(screen.getByTestId("btn-save-collection"));
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
          failure
            ? "common.error_save"
            : edit
              ? "common.success_update"
              : "common.success_save",
        ),
      );
    });
it("validates collection name and handles deletion cancellation then success", async () => {
  await open({ mode: "settings" });
  fireEvent.click(screen.getByTestId("btn-add-collection-settings"));
  fireEvent.click(screen.getByTestId("btn-save-collection"));
  expect(toast.error).toHaveBeenCalled();
  cleanup();
  await open({ mode: "settings" });
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByTitle("lists.delete_collection"));
  expect(state.server.tables.custom_lists).toHaveLength(1);
  fireEvent.click(screen.getByTitle("lists.delete_collection"));
  await waitFor(() => expect(state.server.tables.custom_lists).toEqual([]));
});
for (const failure of [false, true])
  it(`shares collection and revokes access, failure=${failure}`, async () => {
    await open();
    fireEvent.click(screen.getAllByTestId("btn-share-collection").at(-1));
    const email = screen.getByPlaceholderText("lists.email_placeholder");
    fireEvent.change(email, { target: { value: "friend@example.test" } });
    fireEvent.change(email.closest("form").querySelector("select"), {
      target: { value: "READ" },
    });
    if (failure) state.server.failures["custom_list_shares:insert"] = "denied";
    fireEvent.submit(email.closest("form"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "lists.share_error" : "lists.share_success",
      ),
    );
    if (!failure) {
      const shared = await screen.findByText("friend@example.test");
      window.confirm.mockReturnValueOnce(false);
      fireEvent.click(
        shared.parentElement.parentElement.querySelector("button"),
      );
      expect(state.server.tables.custom_list_shares).toHaveLength(1);
      fireEvent.click(
        shared.parentElement.parentElement.querySelector("button"),
      );
      await waitFor(() =>
        expect(state.server.tables.custom_list_shares).toEqual([]),
      );
    }
  });
for (const sort of ["date", "smart", "newest", "oldest", "manual"])
  it(`sorts items by ${sort} and persists preference`, async () => {
    state.server.tables.custom_list_items = [
      item("late", { ...values, text: "Late", date: "2026-02-01" }, false, 3),
      item("done", { ...values, text: "Done" }, true, 0),
      item("early", { ...values, text: "Early" }, false, 1),
      item("nodate", { text: "Undated" }, false, 2),
    ];
    await open();
    await screen.findByText("Early");
    fireEvent.change(screen.getByTestId("select-sort-by"), {
      target: { value: sort },
    });
    expect(localStorage.getItem("lists_sort_by")).toBe(sort);
    const entries = screen
      .getAllByText(/^(Late|Done|Early|Undated)$/)
      .map((e) => e.textContent);
    expect(entries).toHaveLength(4);
    if (sort !== "manual") expect(entries.at(-1)).toBe("Done");
    else expect(entries[0]).toBe("Done");
  });
it("debounces reordered positions and reports a write failure", async () => {
  state.server.tables.custom_list_items.push(
    item("second", { text: "Second" }, false, 1),
  );
  await open();
  await screen.findAllByText("Second");
  fireEvent.change(screen.getByTestId("select-sort-by"), {
    target: { value: "manual" },
  });
  vi.useFakeTimers();
  state.server.failures["custom_list_items:upsert"] = "denied";
  fireEvent.click(screen.getByText("Move last item first"));
  fireEvent.click(screen.getByText("Move last item first"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(toast.error).toHaveBeenCalledWith("lists.error_save_order");
  expect(state.server.calls.filter((x) => x[1] === "upsert")).toHaveLength(1);
});
const markdownTools = [
  ["h1", "# text"],
  ["h2", "## text"],
  ["bold", "**text**"],
  ["italic", "*text*"],
  ["unordered_list", "- text"],
  ["ordered_list", "1. text"],
  ["checklist_tool", "- [ ] text"],
  ["code_tool", "`text`"],
  ["table_tool", "| Coluna 1 | Coluna 2 |\n|----------|----------|\n|  |  |"],
];
for (const [tool, expected] of markdownTools)
  for (const selection of [false, true])
    it(`Markdown field inserts ${tool}, selection=${selection}`, async () => {
      await open();
      fireEvent.click(screen.getByText("lists.new_item"));
      const content = screen.getByPlaceholderText(
        "lists.markdown_placeholder_item",
      );
      fireEvent.change(content, { target: { value: selection ? "text" : "" } });
      content.setSelectionRange(0, selection ? 4 : 0);
      fireEvent.click(screen.getByTitle(`lists.notes_view.${tool}`));
      expect(content.value).toBe(
        selection ? expected : expected.replace("text", ""),
      );
    });
it("previews complex Markdown in a field without changing the saved source", async () => {
  await open();
  fireEvent.click(screen.getByText("lists.new_item"));
  fireEvent.change(
    screen.getByPlaceholderText("lists.markdown_placeholder_item"),
    { target: { value: md + "\n- [x] done\n\n| Single |\n\n```\nunclosed" } },
  );
  fireEvent.click(screen.getByText("lists.preview_mode"));
  expect(screen.getAllByText("Heading")).toHaveLength(2);
  expect(screen.getAllByText("unclosed")).toHaveLength(1);
  fireEvent.click(screen.getByText("lists.edit_mode"));
  expect(
    screen.getByPlaceholderText("lists.markdown_placeholder_item").value,
  ).toContain("unclosed");
});
