# Arquitectura - Nexu

Diseño técnico del sistema RAG para codebases.

## Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub API ──► Clone Repo ──► AST Parser ──► Chunking         │
│                                      │                          │
│                                      ▼                          │
│                              Extract Metadata:                  │
│                              • Imports                          │
│                              • Exports                          │
│                              • Types                            │
│                              • Function signatures             │
│                                      │                          │
│                                      ▼                          │
│                              Generate Embeddings                │
│                              (OpenAI text-embedding-3)          │
│                                      │                          │
│                                      ▼                          │
│                              Store in Vector DB                 │
│                              + Build Dependency Graph           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RETRIEVAL PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Query ──► Embed Query ──► Vector Search                  │
│                                      │                          │
│                                      ▼                          │
│                              Retrieve Top K chunks              │
│                              (K = 10, configurable)             │
│                                      │                          │
│                                      ▼                          │
│                              Graph Expansion:                   │
│                              • Follow imports                   │
│                              • Include type definitions         │
│                              • Add callers (if relevant)        │
│                                      │                          │
│                                      ▼                          │
│                              LLM Reranking:                     │
│                              • Score relevance                  │
│                              • Filter noise                     │
│                              • Select Top 3-5                   │
│                                      │                          │
│                                      ▼                          │
│                              Construct Context                  │
│                              (~5-10k tokens)                    │
│                                      │                          │
│                                      ▼                          │
│                              LLM Generation                     │
│                              (Claude API)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. AST Parser

**Objetivo:** Dividir código en chunks semánticamente completos.

**Implementación:**
- Usa `tree-sitter` para parsear código
- Soporta TypeScript, JavaScript, Python (extensible)
- Identifica nodos: functions, classes, interfaces, types

**Algoritmo de chunking:**

Basado en el paper cAST (CMU 2025):

1. Parsear archivo completo en AST
2. Traversal top-down del árbol
3. Para cada nodo de alto nivel (function, class):
   - Si tamaño < MAX_CHUNK_SIZE: crear chunk
   - Si tamaño > MAX_CHUNK_SIZE: recursivamente dividir
4. Merge de nodos pequeños adyacentes
5. Añadir contexto (imports, class definition)

**Parámetros:**
- `MAX_CHUNK_SIZE`: 512 tokens (balanceado para embeddings)
- `MIN_CHUNK_SIZE`: 50 tokens (evitar chunks triviales)
- `OVERLAP`: 0 tokens (AST ya provee boundaries limpios)

**Metadata extraída por chunk:**
```typescript
interface CodeChunk {
  id: string;
  content: string;          // El código del chunk
  filepath: string;         // Path relativo desde repo root
  startLine: number;
  endLine: number;
  nodeType: 'function' | 'class' | 'interface' | 'type' | 'other';
  name: string;             // Nombre de la función/clase
  imports: string[];        // Imports usados en este chunk
  exports: string[];        // Qué exporta este chunk
  types: string[];          // Tipos referenciados
  package: string;          // Para monorepos: @calcom/web, @calcom/api, etc.
}
```

### 2. Dependency Graph

**Objetivo:** Mapear relaciones entre archivos/funciones.

**Estructura:**
```typescript
interface DependencyNode {
  filepath: string;
  exports: string[];        // Qué exporta este archivo
  imports: Import[];        // Qué importa
}

interface Import {
  symbol: string;           // Nombre importado
  from: string;             // Path del archivo fuente
  line: number;             // Línea de import
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>;  // filepath -> dependencias
}
```

**Construcción:**

1. Para cada archivo en el repo:
   - Extraer imports con AST
   - Extraer exports con AST
   - Resolver paths relativos → absolutos
2. Construir grafo dirigido
3. Indexar para búsqueda rápida

**Queries soportadas:**

- `getImports(filepath)` - Qué importa este archivo
- `getExports(filepath)` - Qué exporta este archivo
- `getDependents(filepath)` - Quién usa este archivo
- `getTransitiveDeps(filepath, depth)` - Dependencias recursivas

### 3. Vector Search

**Embedding model:** OpenAI `text-embedding-3-small`
- Dimensiones: 1536
- Costo: $0.02 / 1M tokens
- Performance: buena para código

**Vector DB:** Pinecone
- Free tier: 100k vectors (suficiente para cal.com)
- Latencia: ~50-100ms
- Metadata filtering nativo

**Index structure:**
```
Namespace: "calcom-main"

Vector record:
{
  id: "chunk-{filepath}-{startLine}",
  values: [1536-dim vector],
  metadata: {
    filepath: string,
    startLine: number,
    endLine: number,
    nodeType: string,
    name: string,
    package: string,
    content: string  // Para debugging, opcional
  }
}
```

**Query process:**

1. User query → Embed con mismo modelo
2. Pinecone similarity search
3. Retrieve Top K (K=10) con metadata
4. Return chunks ordenados por score

**Alternativa:** Supabase pgvector
- Gratis hasta cierto punto
- SQL familiar
- Postgres nativo
- Latencia: ~100-200ms

### 4. Retrieval Strategy

**Stage 1: Semantic Search**
```
Input: User query
Output: Top 10 chunks (raw)

Process:
1. Embed query
2. Vector similarity search
3. Return chunks con score > 0.7
```

**Stage 2: Graph Expansion**
```
Input: Top 10 chunks
Output: Expanded context (~15-20 chunks)

Process:
For each chunk:
  1. Si es función/método:
     - Añadir definición de clase (si aplica)
     - Añadir tipos de parámetros
     - Añadir imports directos
  2. Si es type/interface:
     - Añadir usos de este tipo
  3. Si es clase:
     - Añadir métodos principales
```

**Stage 3: LLM Reranking**
```
Input: ~15-20 chunks expandidos
Output: Top 3-5 chunks finales

Process:
1. Prompt al LLM (Claude):
   "Given query: {query}
    Rank these code chunks by relevance.
    Return only the indices of top 5."
   
2. Contexto reducido:
   - Solo firmas de funciones
   - Solo primeras 5 líneas de cada chunk
   - Total: ~2k tokens

3. LLM retorna: [2, 7, 1, 9, 4]

4. Seleccionar esos chunks completos
```

**Resultado final:**
- 3-5 chunks (el más relevante)
- Total: 5-10k tokens
- Incluye metadata para citación

### 5. Context Construction

**Objetivo:** Armar el contexto óptimo para el LLM.

**Template:**
```
<codebase_context>
Repository: calcom/cal.com
Query: {user_query}

Relevant code chunks:

--- Chunk 1 ---
File: {filepath}
Lines: {startLine}-{endLine}
Type: {nodeType}

{content}

[Imports usado aquí: {imports}]
[Exports: {exports}]

--- Chunk 2 ---
...

</codebase_context>

<instructions>
Answer the user's query based ONLY on the code above.
Always cite your sources with exact file paths and line numbers.
If information is not in the provided code, say so.
</instructions>

<query>
{user_query}
</query>
```

**Estimación de tokens:**
- Template overhead: ~200 tokens
- 5 chunks × 1000 tokens: 5000 tokens
- Metadata: ~300 tokens
- **Total context:** ~5500 tokens

Dentro del sweet spot de Claude (200k).

### 6. LLM Integration

**Model:** Claude 3.5 Sonnet (Anthropic)
- Context window: 200k tokens
- Output: 4k tokens max
- Pricing: $3/MTok input, $15/MTok output

**Prompt engineering:**

System prompt enfatiza:
1. Citar siempre con path + líneas
2. No inventar código que no está en contexto
3. Si no sabe, decir "no encontrado en chunks provistos"
4. Usar formato específico para citaciones

**Streaming:**
- Usar Vercel AI SDK para streaming
- UI muestra respuesta token-by-token
- Mejor UX vs. esperar respuesta completa

## Data Flow

**Ingestion (offline):**
```
GitHub → Clone → Parse (tree-sitter) → Chunk → Embed → Store
                                              ↓
                                       Build Graph
```

**Query (online):**
```
User → Embed → Vector Search → Graph Expand → Rerank → Context → LLM → Response
                                                                         ↓
                                                                   UI (stream)
```

## Optimizaciones

### 1. Caching

- **Embeddings cache:** Evitar re-embedir mismo código
- **Graph cache:** Grafo de dependencias en memoria
- **LLM cache:** Anthropic prompt caching para system prompts repetidos

### 2. Batching

Para ingestion:
- Procesar 100 archivos a la vez
- Batch embeddings (OpenAI permite hasta 2048 inputs)
- Batch upsert a Pinecone

### 3. Monitoring

Métricas clave:
- **Retrieval latency:** Vector search time
- **Token usage:** Input + output por query
- **Cache hit rate:** % queries que usan cache
- **User satisfaction:** Thumbs up/down

## Escalabilidad

**Cal.com stats:**
- ~500k líneas de código
- ~2000 archivos TypeScript
- Estimado: ~15k chunks

**Capacidades:**
- Pinecone free tier: 100k vectors ✅
- Ingestion time: ~15-20 mins (one-time)
- Query latency: <2s (p95)

**Para repos más grandes:**
- Usar Pinecone paid tier
- Sharding por package en monorepos
- Filtrado por metadata (package, file type)

## Failure Modes

**1. Query muy amplia:**
- "Explícame toda la arquitectura"
- Mitigación: Detectar y sugerir queries más específicas

**2. Graph explosion:**
- Archivo con 50 imports
- Mitigación: Limitar depth de expansion a 2 niveles

**3. Código no parseado:**
- Archivos no-código (JSON, MD)
- Mitigación: Skip en AST parser, usar chunking simple

**4. Alucinación de paths:**
- LLM inventa archivos
- Mitigación: Post-process para validar paths citados existen

## Testing Strategy

**Unit tests:**
- AST parser con archivos sintéticos
- Graph builder con repos pequeños
- Retrieval con queries conocidas

**Integration tests:**
- End-to-end: query → response
- Validar citaciones son correctas
- Medir latency

**Evaluation:**
- Dataset de 50 queries sobre cal.com
- Ground truth: archivo + líneas correctas
- Métricas: Precision@1, Recall@5

Ver `SCIENCE.md` para evaluación rigurosa.
