import type {Metadata} from 'next';
import './globals.css';

export const dynamic = 'force-static';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Agent-arnes - AI-Agent Ready Platform',
  description: 'Plataforma lista para Agentes de IA con interfaz de chat universal y backend completo para ejecución de agentes.',
  openGraph: {
    title: 'Agent-arnes - AI-Agent Ready Platform',
    description: 'Plataforma lista para Agentes de IA con interfaz de chat universal y backend completo para ejecución de agentes.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent-arnes - AI-Agent Ready Platform',
    description: 'Plataforma lista para Agentes de IA con interfaz de chat universal y backend completo para ejecución de agentes.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
