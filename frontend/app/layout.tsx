import type { Metadata } from "next";
import "./globals.css";
import { EvmProviders } from "./components/AppWalletProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.blackpool.cash"),
  title: "Blackpool — Private payments that leave no trail",
  description: "Private payments that leave no trail. Shield, send, swap and bridge across chains with zero-knowledge proofs.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    url: "https://app.blackpool.cash",
    siteName: "Blackpool",
    title: "Blackpool — Private payments that leave no trail",
    description: "Private payments that leave no trail. Shield, send, swap and bridge across chains with zero-knowledge proofs.",
    images: [{ url: "/og.png?v=5", width: 1200, height: 630, alt: "Blackpool — Private payments that leave no trail" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blackpool — Private payments that leave no trail",
    description: "Private payments that leave no trail. Shield, send, swap and bridge across chains with zero-knowledge proofs.",
    images: ["/og.png?v=5"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <EvmProviders>{children}</EvmProviders>
      </body>
    </html>
  );
}
