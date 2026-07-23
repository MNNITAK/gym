import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KEYSTONE",
  description:
    "The operating system for gyms that keep members for life — three AI coaches on one shared member brain.",
  appleWebApp: { capable: true, title: "KEYSTONE", statusBarStyle: "default" },
};

/**
 * Without this, mobile browsers assume a ~980px desktop layout and zoom out —
 * every screen renders unreadably small no matter how the CSS is written.
 * `viewportFit: cover` + the safe-area padding in globals.css keeps the member
 * panel's bottom tab bar clear of the iPhone home indicator.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // never block pinch-zoom; that's an accessibility failure
  viewportFit: "cover",
  themeColor: "#F7F6F2",
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
