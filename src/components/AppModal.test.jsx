import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AppModal from "./AppModal";
it("traps keyboard focus, closes with the latest callback, and restores focus and scrolling", () => {
  const previous = document.createElement("button");
  document.body.append(previous);
  previous.focus();
  const oldOverflow = document.body.style.overflow;
  const rectangles = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue([{}]);
  const onClose = vi.fn(),
    replacement = vi.fn();
  const child = (
    <>
      <input aria-label="Synthetic input" />
      <button type="button" disabled>
        Disabled synthetic
      </button>
      <button type="button">Last synthetic</button>
    </>
  );
  const root = render(
    <AppModal
      title="Synthetic modal"
      closeLabel="Close synthetic"
      onClose={onClose}
    >
      {child}
    </AppModal>,
  );
  const close = screen.getByRole("button", { name: "Close synthetic" }),
    last = screen.getByRole("button", { name: "Last synthetic" });
  expect(document.body.style.overflow).toBe("hidden");
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();
  screen.getByRole("textbox").focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledOnce();
  root.rerender(
    <AppModal
      title="Synthetic modal"
      closeLabel="Close synthetic"
      onClose={replacement}
    >
      {child}
    </AppModal>,
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(replacement).toHaveBeenCalledOnce();
  root.unmount();
  expect(previous).toHaveFocus();
  expect(document.body.style.overflow).toBe(oldOverflow);
  rectangles.mockRestore();
  previous.remove();
});
