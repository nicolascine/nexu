# UI/UX - Nexu

Diseño de interfaz para codebase chat.

## Filosofía de diseño

**Objetivo:** Hacker-first, no consumer-friendly.

**Principios:**
1. **Information density** - No esconder información técnica
2. **Speed** - Keyboard-first, minimal clicks
3. **Transparency** - Mostrar el "cómo" detrás de las respuestas
4. **Citations** - Links directos a código siempre visibles

**Referencias:**
- Linear (issue tracking)
- Warp (terminal)
- Cursor (code editor)

Todos priorizan velocidad y densidad de información.

## Componentes principales

### 1. Chat Interface

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  nexu                                      [⚙️ Settings] [ℹ️ ]  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Chat history - scrollable]                                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ User: Where is availability validation?                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nexu: Availability validation happens in...              │  │
│  │                                                           │  │
│  │ [Citation card 1]                                        │  │
│  │ packages/lib/slots.ts                                    │  │
│  │ Lines 45-89                                               │  │
│  │ [View code ↗]                                             │  │
│  │                                                           │  │
│  │ [Citation card 2]                                        │  │
│  │ ...                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Input box]                                                    │
│  Type your question...                    [🔍] [Send] [⌘↵]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Detalles:**

**Mensajes de usuario:**
- Fondo sutilmente diferente
- Mono font para queries técnicas
- Timestamp (relativo: "2m ago")

**Respuestas de Nexu:**
- Markdown rendering
- Syntax highlighting para code snippets
- Citations inline con hover state

**Streaming:**
- Token-by-token como ChatGPT
- Cursor parpadeante en el token actual
- Citations aparecen al final del stream

### 2. Citation Cards

**Objetivo:** Mostrar fuente exacta del código referenciado.

**Design:**
```
┌─────────────────────────────────────────────────────┐
│ 📄 packages/lib/slots.ts                   Lines 45-89│
├─────────────────────────────────────────────────────┤
│                                                     │
│ function checkAvailability(                         │
│   slots: TimeSlot[],                                │
│   booking: Booking                                  │
│ ): boolean {                                        │
│   // validation logic...                            │
│ }                                                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [View in GitHub ↗]  [Copy path]  [Expand full]     │
└─────────────────────────────────────────────────────┘
```

**States:**

- **Collapsed** (default): 5 líneas de preview
- **Expanded**: Código completo con scroll
- **Hover**: Highlight border

**Actions:**

- Click "View in GitHub" → Abre GitHub en esas líneas exactas
- "Copy path" → Clipboard con path relativo
- "Expand full" → Show entire function/class

### 3. Retrieval Transparency (Debug mode)

**Toggle en settings:** "Show retrieval details"

Cuando está ON, mostrar:
```
┌─────────────────────────────────────────────────────┐
│ 🔍 Retrieval Details                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Stage 1: Vector Search                              │
│ • Found 10 chunks (avg score: 0.83)                 │
│ • Latency: 87ms                                     │
│                                                     │
│ Stage 2: Graph Expansion                            │
│ • Added 7 related chunks                            │
│ • Dependencies: 3, Types: 2, Callers: 2            │
│                                                     │
│ Stage 3: LLM Reranking                              │
│ • Filtered to 4 chunks                              │
│ • Tokens used: 1,847                                │
│                                                     │
│ Final Context                                       │
│ • Total chunks: 4                                   │
│ • Total tokens: 5,124                               │
│ • Context usage: 2.5% of 200k                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Por qué importante:**
- Usuarios técnicos quieren saber "cómo" funciona
- Debugging cuando respuestas son incorrectas
- Confianza en el sistema

### 4. Search/Index Status

**Top bar indicator:**
```
[●] cal.com indexed | 15,234 chunks | Last update: 2h ago [↻ Re-index]
```

**Click → Modal con detalles:**
```
┌─────────────────────────────────────────────────────┐
│ Repository Index Status                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Repository: calcom/cal.com                          │
│ Branch: main                                        │
│ Commit: a3f2d1c (2 hours ago)                       │
│                                                     │
│ Stats:                                              │
│ • Files indexed: 2,847                              │
│ • Chunks created: 15,234                            │
│ • Vector embeddings: 15,234                         │
│ • Graph nodes: 2,847                                │
│ • Graph edges: 8,392                                │
│                                                     │
│ Breakdown by package:                               │
│ @calcom/web:      4,521 chunks                      │
│ @calcom/api:      3,102 chunks                      │
│ @calcom/lib:      2,847 chunks                      │
│ ...                                                 │
│                                                     │
│ [Re-index repository] [View full logs]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5. Keyboard Shortcuts

Hackers aman keyboards:

| Shortcut | Action |
|----------|--------|
| `⌘K` or `/` | Focus input |
| `⌘↵` | Send message |
| `Esc` | Clear input |
| `⌘1-9` | Jump to citation N |
| `⌘D` | Toggle debug mode |
| `⌘R` | Retry last query |
| `⌘N` | New chat |

**Show shortcuts:** `?` key → Modal con cheatsheet

### 6. Empty State

**First load:**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                      🔗 nexu                        │
│                                                     │
│           Chat with the cal.com codebase            │
│                                                     │
│  Try asking:                                        │
│                                                     │
│  • Where is availability validation?                │
│  • How does payment processing work?                │
│  • What middleware is used for auth?                │
│                                                     │
│  [Or type your own question...]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 7. Error States

**No results found:**
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ No relevant code found                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Your query: "foobar implementation"                 │
│                                                     │
│ No chunks matched this query with sufficient        │
│ confidence.                                         │
│                                                     │
│ Suggestions:                                        │
│ • Try rephrasing with different keywords            │
│ • Check if this feature exists in cal.com           │
│ • Browse the file structure [↗]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**API error:**
```
┌─────────────────────────────────────────────────────┐
│ ❌ Error generating response                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│ The AI service encountered an error.                │
│                                                     │
│ Error: Rate limit exceeded (429)                    │
│                                                     │
│ [Retry] [Report issue]                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8. Settings Panel

**Accessible via gear icon (top right):**
```
┌─────────────────────────────────────────────────────┐
│ Settings                                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Retrieval                                           │
│ ├─ Max chunks: [5] ▼                                │
│ ├─ Graph expansion depth: [2] ▼                     │
│ └─ Min similarity score: [0.7] ▼                    │
│                                                     │
│ UI                                                  │
│ ├─ [✓] Show retrieval details                       │
│ ├─ [✓] Syntax highlighting                          │
│ ├─ [ ] Compact mode                                 │
│ └─ Theme: [Dark] ▼                                  │
│                                                     │
│ Advanced                                            │
│ ├─ LLM model: [Claude 3.5 Sonnet] ▼                │
│ ├─ Max tokens: [4000] ▼                             │
│ └─ [✓] Enable streaming                             │
│                                                     │
│ [Reset to defaults]                    [Save]       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Color Scheme

**Dark mode (default) - inspired by Warp:**
```
Background: #0D1117 (GitHub dark)
Surface: #161B22
Border: #30363D
Text primary: #C9D1D9
Text secondary: #8B949E
Accent (links, buttons): #58A6FF
Success (citations): #3FB950
Warning: #D29922
Error: #F85149
```

**Code blocks:**
- Use GitHub syntax highlighting theme
- Contrast ratio: WCAG AAA compliant

## Typography

**Fonts:**

- **UI Text:** Inter (clean, modern)
- **Code:** JetBrains Mono (popular con devs)
- **Monospace data:** SF Mono (numbers, paths)

**Sizes:**
- Body: 14px
- Code: 13px
- Headers: 18px (bold)
- Citations: 12px

## Responsive Design

**Desktop (primary):**
- Full chat interface
- Citations side-by-side con chat si espacio permite

**Tablet:**
- Stack citations debajo de mensajes
- Reducir padding

**Mobile:**
- Not a priority (hackers usan laptops)
- But: hacer básicamente funcional
- Citations como accordions

## Animations

**Minimal, fast:**

- Message appear: Fade in (100ms)
- Citation card expand: Slide down (150ms)
- Hover states: Instant (no delay)
- Loading: Subtle pulse

**No animations complejas** - distraen del contenido.

## Accessibility

**Keyboard navigation:**
- Tab order lógico
- Focus indicators claros
- Todos los actions accesibles sin mouse

**Screen readers:**
- ARIA labels en iconos
- Semantic HTML
- Alt text en elementos visuales

**Contrast:**
- WCAG AA mínimo
- AAA para texto crítico

## Component Library

**Use shadcn/ui como base:**
- Ya tiene componentes accesibles
- Customizable con Tailwind
- Tree-shakeable

**Custom components:**
- `<CitationCard />` - Las citation cards
- `<CodeBlock />` - Syntax highlighted code
- `<RetrievalDebug />` - Debug panel
- `<IndexStatus />` - Index status indicator

## Example Flows

### Flow 1: First time user

1. Land on nexu.sh
2. See empty state con ejemplos
3. Click ejemplo → Query sent
4. Stream response con citations
5. Click citation → Ver código en GitHub
6. Ask follow-up question

### Flow 2: Power user

1. `⌘K` → Focus input
2. Type query
3. `⌘↵` → Send
4. `⌘D` → Toggle debug panel
5. See retrieval details
6. `⌘1` → Jump to first citation
7. Adjust settings para refinar

### Flow 3: No results

1. User asks obscure query
2. System finds no good matches
3. Show "No results" state con suggestions
4. User refines query
5. Better results

## Performance Budget

**Metrics:**

- **Initial load:** <2s (P95)
- **Time to interactive:** <3s
- **Message send → first token:** <500ms
- **Full response:** <3s (depending on length)

**Optimizations:**

- Code splitting (Next.js automático)
- Lazy load citation code previews
- Stream response para perceived speed
- Cache common queries

## Testing

**Manual testing checklist:**

- [ ] Citations link correctamente a GitHub
- [ ] Keyboard shortcuts funcionan
- [ ] Streaming no tiene flickering
- [ ] Error states se muestran apropiadamente
- [ ] Mobile es usable (básico)
- [ ] Dark mode está correcto
- [ ] Settings persisten en localStorage

**Automated:**

- Visual regression tests (Percy/Chromatic)
- Accessibility audits (axe)
- Performance budgets (Lighthouse CI)

## Iterations futuras

**Post-MVP:**

1. **File tree browser** - Explorar repo visualmente
2. **Multi-turn context** - Mantener contexto entre queries
3. **Compare mode** - Comparar múltiples chunks lado a lado
4. **Export chat** - Markdown/PDF de conversación
5. **Shareable links** - Link a chat específico

**Más adelante:**

- Soporte para repos privados (auth)
- Multiple repos simultáneos
- Custom indexing rules
- API pública

## Conclusión

UI debe ser:
- **Rápida** - No friction entre pensamiento y ejecución
- **Transparente** - Mostrar el "cómo", no esconderlo
- **Dense** - Info máxima en mínimo espacio
- **Citable** - Enlaces directos a fuentes siempre

Inspiración: Tools que hackers aman (Linear, Warp, Cursor)

No consumer-friendly, **developer-first**.
