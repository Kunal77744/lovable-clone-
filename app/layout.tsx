import "../src/style.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Wildvault Run",
  description: "Run the shifting ruins, collect relics, and survive the Wildvault.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#081713",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
