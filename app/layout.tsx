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
      <head>
        {/* Aplicar el tema antes del primer paint: evita el flash de tema claro.
            El modo oscuro es el predeterminado salvo preferencia guardada. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('chat_dark_mode_v1');var dark=t!==null?t==='true':true;if(dark){d.classList.add('dark');}else{d.classList.remove('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
