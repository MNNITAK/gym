import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * One family carries the whole product: Hanken Grotesk, a grotesque with real
 * authority at 700–800 (headlines, stat numbers) that stays effortless at
 * 400–500 body sizes. Loaded as a variable font, self-hosted by next/font at
 * build time — no runtime font request, no layout shift.
 */
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KEYSTONE — The Gym Operating System",
    template: "%s · KEYSTONE",
  },
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
  themeColor: "#0C0C0D",
};

/**
 * Runs before first paint: applies the stored theme to <html> so there is
 * never a wrong-theme flash. Kept as a string — this must not wait for React
 * to hydrate. KEYSTONE presents in black-and-red by default; light remains a
 * choice, not the fallback.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("ks-theme");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${sans.variable} font-sans`}>{children}</body>
    </html>
  );
}
