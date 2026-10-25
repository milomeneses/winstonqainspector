import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Winston QA Inspector",
  description: "Local-first HTML5 banner preflight inspector",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
