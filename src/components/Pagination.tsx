import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  pages,
  total,
  from,
  to,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="list-pagination" aria-label="Paginação da lista">
      <span role="status">
        {from}–{to} de {total} registros
      </span>
      <div>
        <button
          type="button"
          className="icon-button"
          aria-label="Página anterior"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Próxima página"
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}
