import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KEYSTONE — Coach Console",
  description: "Coach-in-the-loop console for the KEYSTONE gym operating system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
