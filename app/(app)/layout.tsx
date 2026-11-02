import BottomNav from "@/components/BottomNav";
import { signOut } from "./actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-lg font-semibold text-gray-900">Madplan</span>
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 underline">
            Log ud
          </button>
        </form>
      </header>

      <main className="flex-1 overflow-x-hidden px-4 py-4 pb-20">{children}</main>

      <BottomNav />
    </div>
  );
}
