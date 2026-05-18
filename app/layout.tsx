import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
