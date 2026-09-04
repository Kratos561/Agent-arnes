# Prompt de Prueba — Agent Arnes (Todas las Capacidades)

Copia y pega este prompt completo en el chat. Está diseñado para ejercitar TODAS las capacidades implementadas en una sola tarea.

---

## Prompt:

Eres un analista de tecnología. Realiza el siguiente análisis completo:

**Paso 1 — Búsqueda de datos actuales:**
Busca en internet "market share de navegadores web 2025 2026" y "popularidad de lenguajes de programación 2025 2026". Necesito datos REALES y ACTUALES, no inventes.

**Paso 2 — Análisis y razonamiento:**
Con los datos encontrados:
- Identifica las 3 tendencias más importantes
- Explica POR QUÉ son tendencias (causa raíz)
- Evalúa el impacto potencial en la industria del software

**Paso 3 — Visualización:**
Genera DOS gráficas:
1. Una gráfica de BARRAS comparando el market share de los 5 principales navegadores
2. Una gráfica de LÍNEA mostrando la evolución de popularidad de los 3 lenguajes más usados

**Paso 4 — Datos tabulares:**
Genera un CSV con una tabla que incluya: Navegador, Market Share (%), Tendencia (sube/baja/estable), Año de lanzamiento.

**Paso 5 — Código:**
Escribe un script en Python que:
- Reciba los datos del CSV como input
- Calcule el navegador con mayor market share
- Genere un resumen en texto plano
- Incluya manejo de errores y tipos

**Paso 6 — Resumen ejecutivo:**
Entrega un resumen final de máximo 200 palabras que synthetice todo lo anterior, dirigido a un CTO que necesita tomar decisiones.

**REGLAS:**
- DEBES usar las herramientas (web_search, render_chart, generate_csv) — NO inventes datos
- Presenta tu razonamiento ANTES de cada acción
- Si una búsqueda falla, reformula la query e intenta de nuevo
- Todo el output debe ser Markdown estructurado
