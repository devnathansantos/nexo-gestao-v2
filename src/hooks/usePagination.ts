import { useState } from "react";

export const LIST_PAGE_SIZE = 30;

/** Bound DOM work; filtering and exports still use the complete company dataset. */
export function usePagination<T>(items: T[], resetKey: string) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
  const page = selection.key === resetKey ? Math.min(selection.page, pages) : 1;
  // Commit resets during render so clearing a search cannot restore an old page.
  // Also retain a clamped page after deletion, even if the list grows again.
  if (selection.key !== resetKey || selection.page !== page) {
    setSelection({ key: resetKey, page });
  }
  const start = (page - 1) * LIST_PAGE_SIZE;
  return {
    items: items.slice(start, start + LIST_PAGE_SIZE),
    page,
    pages,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + LIST_PAGE_SIZE, items.length),
    onPage: (next: number) =>
      setSelection({ key: resetKey, page: Math.max(1, Math.min(next, pages)) }),
  };
}
