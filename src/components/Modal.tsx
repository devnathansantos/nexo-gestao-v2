import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

let modalCount = 0;
let initialBodyOverflow = "";
const modalStack: symbol[] = [];

export default function Modal({
  title,
  description,
  children,
  onClose,
  busy = false,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const titleId = useId();
  const descriptionId = useId();
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const token = Symbol("modal");
    modalStack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    if (modalCount++ === 0) {
      initialBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    const firstInput = panel.current?.querySelector<HTMLElement>(
      "input:not(:disabled), textarea:not(:disabled)",
    );
    (firstInput || focusable()[0] || panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== token) return;
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      const current = document.activeElement;
      if (
        event.shiftKey &&
        (current === items[0] || !panel.current?.contains(current))
      ) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        (current === items.at(-1) || !panel.current?.contains(current))
      ) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      const index = modalStack.indexOf(token);
      if (index !== -1) modalStack.splice(index, 1);
      if (--modalCount === 0)
        document.body.style.overflow = initialBodyOverflow;
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">NEXO GESTÃO</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar janela"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
