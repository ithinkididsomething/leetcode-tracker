import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeetCode Tracker",
  description:
    "Team standings for LeetCode problem solving, with weekly counts, streaks and topic breakdowns.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink-50">
        {user && (
          <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-[11px] font-bold text-white shadow-sm"
                >
                  LT
                </span>
                LeetCode Tracker
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/admin/members">Members</NavLink>
                <NavLink href="/admin/teams">Teams</NavLink>
                <NavLink href="/admin/admins">Admins</NavLink>
                <NavLink href="/admin/settings">Settings</NavLink>
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-ink-400 sm:inline">
                  {user.email}
                </span>
                <SignOutButton />
              </div>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1 font-medium text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </Link>
  );
}
