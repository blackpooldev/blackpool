import type { Metadata } from "next";

export const OG_IMAGE = { url: "/og.png?v=5", width: 1200, height: 630, alt: "Blackpool — Private payments that leave no trail" };

/** Per-page metadata: title, description, canonical URL and matching Open Graph / Twitter cards. */
export function pageMeta(path: string, title: string, description: string, type: "website" | "article" = "website"): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type, url: path, siteName: "Blackpool", title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", site: "@intheblackpool", creator: "@intheblackpool", title, description, images: [OG_IMAGE.url] },
  };
}
