import type {Metadata} from 'next';
import './globals.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Agent-arnes - AI-Agent Ready Platform',
  description: 'Cliente de chat estático con streaming y herramientas locales de navegador.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
