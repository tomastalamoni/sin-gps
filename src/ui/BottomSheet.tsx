import { useEffect, useRef, type ReactNode } from 'react';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Queda fijo abajo: las acciones siempre al alcance del pulgar. */
  footer?: ReactNode;
  /** Ocupa toda la pantalla, para los paneles con teclado. */
  full?: boolean;
}

/** Hoja que sube desde abajo: deja ver el mapa y se cierra con un botón visible. */
export function BottomSheet({ title, onClose, children, footer, full = false }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Si ningún campo pidió el foco, va al botón de cerrar: así lo anuncia el lector de pantalla y
    // Escape funciona.
    if (sheetRef.current?.contains(document.activeElement)) return;
    closeRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <section
      ref={sheetRef}
      role="dialog"
      aria-label={title}
      className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-surface shadow-[0_-4px_16px_rgb(0_0_0/0.2)] ring-1 ring-line ${full ? 'top-0' : 'max-h-[55%]'}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header className="flex items-center gap-2 pt-1 pr-1 pl-4">
        <h2 className="min-w-0 flex-1 text-xl font-bold">{title}</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="Cerrar"
          className="grid size-12 shrink-0 place-items-center rounded-xl active:opacity-70"
          onClick={onClose}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>}
      {footer && <div className="flex gap-2 border-t border-line p-2">{footer}</div>}
    </section>
  );
}
