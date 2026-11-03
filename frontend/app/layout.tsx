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

const NO_STORAGE = `(function(){function m(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d=Object.create(null)},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}try{window.localStorage&&window.localStorage.clear()}catch(e){}try{window.sessionStorage&&window.sessionStorage.clear()}catch(e){}try{Object.defineProperty(window,'localStorage',{value:m(),configurable:true})}catch(e){}try{Object.defineProperty(window,'sessionStorage',{value:m(),configurable:true})}catch(e){}try{if(window.indexedDB&&indexedDB.databases){indexedDB.databases().then(function(l){l.forEach(function(x){x&&x.name&&indexedDB.deleteDatabase(x.name)})}).catch(function(){})}}catch(e){}try{Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true})}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* No browser storage: wallet libraries get an in-memory Storage (gone when the tab closes), and any
            data an older version left behind is removed. Runs before every other script. */}
        <script dangerouslySetInnerHTML={{ __html: NO_STORAGE }} />
      </head>
      <body>
        <EvmProviders>{children}</EvmProviders>
      </body>
    </html>
  );
}
