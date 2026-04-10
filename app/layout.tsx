import type { Metadata } from "next";
import { DM_Mono, Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const fontBody = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const fontDisplay = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const fontMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "CyberChat",
  description: "Asistente de ciberseguridad con chat, documentos y conocimiento contextual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
