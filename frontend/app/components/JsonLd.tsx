// Structured data for search engines (schema.org JSON-LD). Server component; renders one <script> tag.
export default function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const SITE = "https://blackpool.cash";

export function breadcrumbs(items: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })),
  };
}

export function faqPage(faq: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function article(path: string, headline: string, description: string, dateModified: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline,
    description,
    url: SITE + path,
    dateModified,
    author: { "@type": "Organization", name: "Blackpool", url: SITE },
    publisher: { "@type": "Organization", name: "Blackpool", url: SITE, logo: { "@type": "ImageObject", url: SITE + "/apple-icon.png" } },
  };
}

/** Site-wide entities for the homepage: who publishes the site, the site itself, and the app. */
export function siteGraph() {
  const sameAs = ["https://x.com/intheblackpool", "https://github.com/blackpooldev/blackpool", "https://www.npmjs.com/package/@blackpool/cli", "https://glama.ai/mcp/servers/blackpooldev/blackpool"];
  return [
    { "@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", name: "Blackpool", url: SITE, logo: SITE + "/apple-icon.png", email: "hello@blackpool.cash", description: "Pay anyone. Show no one. Zero-knowledge privacy pools on four chains, no custody, relayer pays the gas.", sameAs },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", name: "Blackpool", url: SITE, publisher: { "@id": SITE + "/#org" } },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Blackpool",
      url: SITE + "/app",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: "Pay anyone. Show no one. Zero-knowledge privacy pools on four chains, no custody, relayer pays the gas.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": SITE + "/#org" },
    },
  ];
}
