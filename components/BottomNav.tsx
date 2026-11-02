"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/denne-uge", label: "Denne uge" },
  { href: "/planlaeg-uge", label: "Planlæg" },
  { href: "/tilbud", label: "Tilbud" },
  { href: "/beholdning", label: "Beholdning" },
  { href: "/indkoebsliste", label: "Indkøb" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center py-2 text-xs ${
                  active ? "font-semibold text-green-700" : "text-gray-500"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
