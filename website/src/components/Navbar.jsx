import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'Modes', href: '#modes' },
  { label: 'Mobile', href: '#mobile' },
  { label: 'Download', href: '#download' }
];

function LivePill({ mobile = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 ${
        mobile ? '' : 'px-3 py-1.5 text-xs'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
      Live
    </span>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-4 left-0 right-0 z-50 px-8 lg:px-16 py-3">
      <div className="mx-auto max-w-7xl flex items-center justify-between">
        <a href="#home" className="inline-flex items-center gap-3 text-white">
          <img
            src="/icons/relay-icon.png"
            alt="Relay"
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/25"
          />
          <span className="text-xl font-semibold tracking-tight">Relay</span>
        </a>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex">
            <nav className="flex items-center rounded-full border border-zinc-700 bg-black/40 backdrop-blur-sm px-1.5 py-1">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="px-3 py-2 text-sm text-white/80 hover:text-white transition-all duration-300 hover:-translate-y-0.5"
                >
                  {link.label}
                </a>
              ))}

              <div className="mx-1">
                <LivePill />
              </div>

              <a
                href="#download"
                className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white/80 hover:text-white transition-all duration-300 hover:-translate-y-0.5"
              >
                Get Relay <ArrowUpRight className="h-4 w-4" />
              </a>
            </nav>
          </div>

          <div className="lg:hidden">
            <LivePill mobile />
          </div>

          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center rounded-full border border-zinc-700 bg-black/40 p-2.5 text-white/80 hover:text-white hover:border-zinc-500 transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          className="lg:hidden mx-auto mt-3 max-w-7xl flex flex-col rounded-3xl border border-zinc-700 bg-black/85 backdrop-blur-sm p-2"
        >
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-2xl px-4 py-3 text-base text-white/85 hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
