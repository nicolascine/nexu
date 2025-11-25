# Fundamentación Científica - Nexu

Análisis de la evidencia que respalda las decisiones de diseño.

## Pregunta de investigación

**¿Cómo permitir que un LLM "comprenda" un codebase de 500k líneas sin exceder su ventana de contexto?**

## Estado del arte

### 1. El problema del contexto limitado

**Paper relevante:** "Lost in the Middle: How Language Models Use Long Contexts" (Liu et al., 2023)

Hallazgo clave:
> Los LLMs tienen performance en forma de U - atienden principalmente al inicio y final del contexto, el medio se "pierde".

**Implicaciones:**
- Meter 200k tokens no garantiza que el modelo use toda la información
- El "haystack" más grande no ayuda si la "needle" está en el medio
- Estrategia óptima: **contexto pequeño y relevante** > contexto gigante y ruidoso

### 2. RAG para código vs. RAG para texto

**Diferencia fundamental:**

| Aspecto | Texto (docs, artículos) | Código |
|---------|------------------------|--------|
| Estructura | Párrafos, oraciones | AST, funciones, clases |
| Dependencias | Referencias, citas | Imports, types, calls |
| Boundaries | Relativamente claros | Requieren parsing |
| Chunking | Semántico (párrafos) | **Debe respetar sintaxis** |

**Paper base:** cAST (Carnegie Mellon, 2025)

### 3. cAST: Chunking via Abstract Syntax Trees

**Paper:** Yilin Zhang et al., "cAST: Enhancing Code Retrieval-Augmented Generation with Structural Chunking via Abstract Syntax Tree" (2025)

**URL:** https://arxiv.org/abs/2506.15655

**Problema que resuelve:**

Chunking tradicional (fixed-size) rompe estructuras sintácticas:
```typescript
// Fixed-size chunking puede cortar aquí ↓
function calculatePrice(items: Item[]) {
  const subtotal = items.reduce((sum, item) => 
--- CORTE DE CHUNK ---
    sum + item.price, 0);
  return subtotal * 1.19; // IVA
}
```

Resultado: El LLM pierde contexto sobre qué retorna la función.

**Solución de cAST:**

1. Parsear código en AST
2. Identificar nodos completos (functions, classes)
3. Crear chunks respetando boundaries sintácticos
4. Si nodo es muy grande, dividir recursivamente
5. Merge de nodos pequeños adyacentes

**Algoritmo (pseudocódigo del paper):**
```
función chunk_ast(node, max_size):
  si tamaño(node) ≤ max_size:
    return [node]
  
  chunks = []
  para cada hijo en node.children:
    sub_chunks = chunk_ast(hijo, max_size)
    chunks.extend(sub_chunks)
  
  return merge_small_chunks(chunks, max_size)
```

**Resultados experimentales:**

**Dataset:** RepoEval y SWE-bench

| Métrica | Fixed-size | cAST | Mejora |
|---------|-----------|------|--------|
| Recall@5 (RepoEval) | 45.2% | 49.5% | +4.3 pts |
| Precision@5 (SWE-bench) | 38.1% | 39.5% | +1.4 pts |
| Pass@1 (code gen) | 24.3% | 27.0% | +2.67 pts |

**Conclusión del paper:**
> "AST-aligned chunks provide richer and more accurate context for retrieval models, leading to consistent improvements across both retrieval and generation tasks."

### 4. Evidencia de producción

**Qodo.ai: "RAG for a Codebase with 10k Repos"** (2024)

**URL:** https://www.qodo.ai/blog/rag-for-large-scale-code-repos/

**Setup:**
- 10,000+ repositorios enterprise
- Millones de chunks indexados
- Producción real con desarrolladores

**Estrategia de chunking:**

> "For a large class, we create an embedding and index individual methods separately but include the class definition and relevant imports with each method chunk."

**Two-stage retrieval:**

1. **Stage 1:** Vector similarity search (inicial)
2. **Stage 2:** LLM filtering & ranking

> "We use an LLM to filter and rank the results based on their relevance to the specific task or query."

**Ejemplo del paper:**
- Query: "how to handle API rate limiting"
- Stage 1 retrieves: 20 chunks sobre APIs
- Stage 2 LLM filter: 3 chunks específicos de rate limiting
- **Resultado:** Precisión ++, tokens usados --

**Hallazgo clave:**
> "Simple vector similarity search often retrieves irrelevant or out-of-context code snippets, especially in large, diverse codebases."

### 5. Context Window Management

**Source:** Post de Reddit "My Claude Code Context Window Strategy" (Nov 2024)
**Author:** u/Goos_Kim
**Upvotes:** 452
**URL:** https://reddit.com/r/ClaudeAI/comments/1p05r7p/

**Tesis del post:**
> "El problema usualmente no es el tamaño de la ventana, es cómo quemamos tokens."

**Experimento del autor:**
```
Con Auto-Compact ON:  85k / 200k tokens (43%)
Con Auto-Compact OFF: 38k / 200k tokens (19%)
```

**Regla propuesta:**
> "Initial context usage should never exceed 20% of total context window."

**Principio aplicado a Nexu:**

En lugar de meter todo el codebase:
- Recuperamos 5-10k tokens relevantes (2.5-5% de 200k)
- Dejamos 95% del contexto disponible para razonamiento
- LLM tiene espacio para pensar sin estar "ahogado" en código

**Comentario destacado (u/tormenteddragon):**

> "Your thinking is directionally correct! But agentic AI in their current state are grossly inefficient. The key to solving this isn't in optimizing agentic AI. It's in using adjacency graphs and clustering to tailor context for particular tasks to achieve O(1) context for any given task regardless of codebase size."

**Traducción:**
- No uses agentes que exploran todo
- Usa grafos de adyacencia para **pre-computar** contexto relevante
- Complejidad O(1) por query, independiente del tamaño del repo

**Implementación en Nexu:** Ver sección "Dependency Graph" en `ARCHITECTURE.md`

### 6. Graph-based approaches

**Comentario de Reddit (u/tormenteddragon):**

> "Codebases are just graphs of files and functions. For any given task, most of what you need is within a few hops in the graph. Give the AI only what it needs for the task."

**Validación teórica:**

**Paper:** "Language-agnostic representation learning of source code" (Guo et al., 2021)

- Representa código como grafos
- Nodos: funciones, clases
- Aristas: llamadas, imports, herencia
- **Hallazgo:** Localidad en grafos de código es alta

**"Code locality":**

En codebases bien estructurados:
- 80% de dependencias están a 1-2 hops
- Funciones relacionadas tienden a estar en archivos cercanos
- Imports son relativamente shallow

**Aplicación:**

Si usuario pregunta sobre función X:
1. Recuperar función X (chunk directo)
2. Graph expansion 1 hop:
   - Tipos de parámetros
   - Funciones que llama
   - Clase que la contiene
3. Graph expansion 2 hops (opcional):
   - Callers de la función
   - Implementaciones relacionadas

Total: ~5-10 chunks, ~5k tokens

### 7. Embeddings para código

**Modelo usado:** OpenAI text-embedding-3-small

**Alternativas evaluadas:**

| Modelo | Dims | Costo | Performance en código |
|--------|------|-------|----------------------|
| OpenAI ada-002 | 1536 | $0.10/1M | Bueno |
| **OpenAI text-emb-3-small** | **1536** | **$0.02/1M** | **Muy bueno** |
| Voyage AI code | 1024 | $0.10/1M | Excelente (code-specific) |
| CodeSage | 768 | Free | Bueno pero lento |

**Paper:** "CodeRetriever: A Large Scale Contrastive Pre-training Method for Code Search" (Li et al., 2022)

Hallazgo:
> Embeddings generales (trained on text) funcionan sorprendentemente bien para código, especialmente para búsqueda semántica.

**Decisión:** OpenAI text-embedding-3-small
- Costo/beneficio óptimo
- Latencia baja
- Performance probada

### 8. LLM Selection: Claude vs. GPT

**Claude 3.5 Sonnet (seleccionado):**
- Benchmarks: #1 en SWE-bench (coding)
- Context: 200k tokens
- Pricing: $3/MTok input

**GPT-4o:**
- Benchmarks: Comparable
- Context: 128k tokens
- Pricing: $5/MTok input

**Decision rationale:**

Paper de referencia: SWE-bench leaderboard (2024)
- Claude 3.5 Sonnet: 49.0% pass rate
- GPT-4o: 41.8% pass rate

Para tareas de comprensión de código, Claude lidera.

## Análisis crítico de alternatives

### Alternative 1: "Naive RAG"

**Approach:**
- Fixed-size chunking (500 tokens)
- Vector search only
- Retrieve Top 10 chunks
- Feed directly to LLM

**Pros:**
- Simple
- Rápido de implementar

**Cons:**
- Rompe estructura sintáctica
- Sin contexto de dependencias
- Alta probabilidad de chunks incompletos
- Retrieval ruidoso

**Evidence against:**
- Paper cAST muestra 4.3 puntos menos de Recall
- Qodo.ai report: "Simple vector search retrieves irrelevant snippets"

### Alternative 2: "Agentic AI"

**Approach:**
- LLM con tools: read_file, search_files, list_directory
- LLM explora codebase dinámicamente
- Multiple tool calls por query

**Pros:**
- Flexible
- Puede explorar contexto dinámicamente

**Cons:**
- Muy costoso (muchos tokens)
- Lento (múltiples LLM calls)
- Puede entrar en loops
- Contamina contexto con exploraciones irrelevantes

**Evidence against:**

Reddit comment (u/tormenteddragon):
> "Agentic AI in their current state are grossly inefficient. You get much better results in 10-20k token context than agentic AI in 200k."

### Alternative 3: "Fine-tuned Code LLM"

**Approach:**
- Fine-tune modelo en cal.com específicamente
- El modelo "memoriza" el codebase

**Pros:**
- Sin RAG complexity
- Respuestas potencialmente rápidas

**Cons:**
- Caro entrenar
- No escala (un modelo por repo)
- Alucinaciones aún posibles
- No cita fuentes

**Evidence against:**
- RAG paper (Lewis et al., 2020): "RAG outperforms fine-tuning for knowledge-intensive tasks"

### Alternative 4: "Entire context (1M tokens)"

**Approach:**
- Usar modelo con 1M tokens context
- Meter todo cal.com

**Pros:**
- Sin pérdida de información
- Sin retrieval complexity

**Cons:**
- Muy caro ($$$)
- Latencia alta
- "Lost in the middle" problem
- No todos tienen acceso a 1M context

**Evidence against:**
- Paper "Lost in the Middle": Performance degrada con contexto masivo
- Reddit post: "Bigger haystack makes needle harder to find"

## Nuestra arquitectura: Justificación científica

**Decision matrix:**

| Component | Alternative considered | Why chosen |
|-----------|----------------------|------------|
| **Chunking** | Fixed-size | **AST-based** | cAST paper: +4.3 pts Recall |
| **Retrieval** | Vector only | **Vector + Graph** | Qodo.ai: reduces noise significantly |
| **Context size** | 50k-100k tokens | **5-10k tokens** | Reddit: "Lean context" + Lost-in-middle paper |
| **LLM** | GPT-4o | **Claude 3.5 Sonnet** | SWE-bench: 49.0% vs 41.8% |
| **Reranking** | No reranking | **LLM rerank** | Qodo.ai: "LLM filtering crucial at scale" |

## Evaluación propuesta

Para validar que Nexu funciona:

### Métricas

**1. Retrieval accuracy**
- Precision@K: % de chunks correctos en top K
- Recall@K: % del total de chunks relevantes encontrados
- MRR (Mean Reciprocal Rank): posición del primer resultado correcto

**2. Citation accuracy**
- % de citaciones con path correcto
- % de citaciones con líneas correctas
- False citation rate

**3. User satisfaction**
- Thumbs up/down
- Task completion rate
- Time to answer (latency)

### Dataset de evaluación

**50 queries sobre cal.com:**

Ejemplos:
1. "¿Dónde se valida la disponibilidad horaria?"
   - Ground truth: `packages/lib/slots.ts`, líneas X-Y

2. "¿Cómo se procesa el pago de una reserva?"
   - Ground truth: `apps/web/lib/payment.ts`, líneas A-B

3. "¿Qué middleware se usa para autenticación?"
   - Ground truth: `apps/web/middleware.ts`, líneas M-N

**Proceso:**

1. Developer experto en cal.com anota ground truth
2. Nexu responde las 50 queries
3. Comparar citaciones vs. ground truth
4. Calcular métricas

### Baseline comparison

Comparar Nexu contra:

1. **GitHub Copilot Chat** (si tiene acceso)
2. **Cursor with codebase** (referencia)
3. **Naive RAG** (fixed-size chunking)

**Hypothesis:**
Nexu tendrá Precision@1 > 80% vs. Naive RAG < 60%

## Limitaciones del approach

**1. Asume código estructurado**
- AST chunking requiere código parseable
- Legacy code no estructurado puede fallar

**2. Graph expansion puede explotar**
- Archivos altamente acoplados
- Mitigación: límite de depth

**3. No entiende "arquitectura global"**
- Nexu es local-first
- Queries como "describe toda la arquitectura" requieren approach diferente

**4. Dependiente de calidad de embeddings**
- Si embedding model es malo para código, falla
- Mitigación: usar modelo code-specific

## Conclusiones

**Lo que sabemos (con evidencia):**
1. ✅ AST chunking > fixed-size (paper cAST)
2. ✅ Two-stage retrieval mejora precisión (Qodo.ai)
3. ✅ Contexto lean > contexto masivo (Lost-in-middle + Reddit)
4. ✅ Claude 3.5 Sonnet lidera en coding (SWE-bench)

**Lo que asumimos (razonable pero no probado):**
1. ⚠️ Graph expansion mejora over vector-only
2. ⚠️ LLM reranking vale el costo extra
3. ⚠️ 5-10k tokens es sweet spot (no benchmarked)

**Lo que debemos validar:**
1. ❓ Performance en cal.com específicamente
2. ❓ User satisfaction con citaciones
3. ❓ Costos en producción a escala

**Próximos pasos:**

1. Implementar sistema
2. Evaluar con dataset de 50 queries
3. Iterar basado en métricas
4. Publicar resultados

Si Nexu demuestra Precision@1 > 80%, habremos validado el approach científicamente.
