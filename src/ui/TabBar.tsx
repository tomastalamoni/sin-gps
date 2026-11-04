import { Link, useLocation } from 'wouter';

const TABS = [
  { href: '/', label: 'Inicio', icon: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10' },
  {
    href: '/mapa',
    label: 'Mapa',
    icon: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20',
  },
];

/** Pestañas de abajo. Las demás de la sección 7 aparecen con su fase. */
export function TabBar() {
  const [location] = useLocation();
  const isActive = (href: string) =>
    href === '/' ? location === '/' : location === href || location.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Principal"
      className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center text-sm font-medium ${active ? 'text-brand' : 'text-muted'}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={icon} />
            </svg>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
