import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";
import { ServiceWorker } from "@/components/shell/service-worker";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Tu organizador académico: materias, tareas, calendario, notas y apuntes.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: "Nober", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f0e15",
};

// Aplica el tema guardado antes de pintar, para evitar el parpadeo claro/oscuro.
const themeScript = `(function(){try{var t=localStorage.getItem('nober-theme');if(t!=='light'&&t!=='dark'){t='dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-CO"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
