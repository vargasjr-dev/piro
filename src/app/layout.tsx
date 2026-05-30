import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Piro",
  description: "Train your own tiny, RL-first model — built to grow, not decay.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0d0a08] text-amber-50 antialiased">{children}</body>
    </html>
  );
}
