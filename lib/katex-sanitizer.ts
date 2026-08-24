/**
 * Pre-procesador léxico para evitar colisiones entre delimitadores de TeX/KaTeX ($ y $$)
 * y caracteres literales como monedas ($100 USD, $ 50.99) o variables de entorno bash ($PATH, $VAR).
 */

export function sanitizeMathDelimiters(content: string): string {
  if (!content || typeof content !== 'string') return '';

  // 1. Proteger bloques de código (```...``` y `...`) para no alterar el código fuente
  const codeBlocks: string[] = [];
  const placeholderPrefix = '___CODE_BLOCK_SLOT_';
  let processed = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholderPrefix}${idx}___`;
  });

  // 2. Escapar signos de dólar seguidos de dígitos o formato de moneda (ej: $100, $50.99, $ 100, $1,000.00)
  // Reemplaza $ por \$ para que KaTeX no lo interprete como inicio de ecuación
  const currencyRegex = /\$(?=\s*\d+([.,]\d+)?)/g;
  processed = processed.replace(currencyRegex, '\\$');

  // 3. Escapar variables de terminal/bash estilo $VAR, $PATH, ${VARIABLE_NAME}
  const bashVarRegex = /\$(?=[A-Z0-9_]{2,}|\{[A-Z0-9_]+\})/g;
  processed = processed.replace(bashVarRegex, '\\$');

  // 4. Restaurar los bloques de código intactos
  processed = processed.replace(new RegExp(`${placeholderPrefix}(\\d+)___`, 'g'), (_, idx) => {
    return codeBlocks[parseInt(idx, 10)] || '';
  });

  return processed;
}
