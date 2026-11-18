import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./AppModal.css";

export default function AppModal({
  title,
  children,
  onClose,
  closeLabel,
  className = "",
  overlayClassName = "",
}) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button, input, select, textarea")?.focus();
    const listener = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const items = [
        ...ref.current.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className={`app-overlay ${overlayClassName}`}>
      <section
        ref={ref}
        className={`app-modal glass-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="app-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
