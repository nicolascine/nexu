# UI/UX - Nexu

Interface design for codebase chat.

## Design Philosophy

**Goal:** Hacker-first, not consumer-friendly.

**Principles:**
1. **Information density** - Don't hide technical information
2. **Speed** - Keyboard-first, minimal clicks
3. **Transparency** - Show the "how" behind the answers
4. **Citations** - Direct links to code always visible

**References:**
- Linear (issue tracking)
- Warp (terminal)
- Cursor (code editor)

All prioritize speed and information density.

## Main Components

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

**Details:**

**User messages:**
- Subtly different background
- Mono font for technical queries
- Timestamp (relative: "2m ago")

**Nexu responses:**
- Markdown rendering
- Syntax highlighting for code snippets
- Inline citations with hover state

**Streaming:**
- Token-by-token like ChatGPT
- Blinking cursor on current token
- Citations appear at end of stream

### 2. Citation Cards

**Goal:** Show exact source of referenced code.

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

- **Collapsed** (default): 5 lines of preview
- **Expanded**: Full code with scroll
- **Hover**: Highlighted border

**Actions:**

- Click "View in GitHub" → Opens GitHub at exact lines
- "Copy path" → Clipboard with relative path
- "Expand full" → Show entire function/class

### 3. Retrieval Transparency (Debug mode)

**Toggle in settings:** "Show retrieval details"

When ON, show:
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

**Why important:**
- Technical users want to know "how" it works
- Debugging when answers are incorrect
- Trust in the system

### 4. Search/Index Status

**Top bar indicator:**
```
[●] cal.com indexed | 15,234 chunks | Last update: 2h ago [↻ Re-index]
```

**Click → Modal with details:**
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

Hackers love keyboards:

| Shortcut | Action |
|----------|--------|
| `⌘K` or `/` | Focus input |
| `⌘↵` | Send message |
| `Esc` | Clear input |
| `⌘1-9` | Jump to citation N |
| `⌘D` | Toggle debug mode |
| `⌘R` | Retry last query |
| `⌘N` | New chat |

**Show shortcuts:** `?` key → Modal with cheatsheet

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
- **Code:** JetBrains Mono (popular with devs)
- **Monospace data:** SF Mono (numbers, paths)

**Sizes:**
- Body: 14px
- Code: 13px
- Headers: 18px (bold)
- Citations: 12px

## Responsive Design

**Desktop (primary):**
- Full chat interface
- Citations side-by-side with chat if space permits

**Tablet:**
- Stack citations below messages
- Reduce padding

**Mobile:**
- Not a priority (hackers use laptops)
- But: make it basically functional
- Citations as accordions

## Animations

**Minimal, fast:**

- Message appear: Fade in (100ms)
- Citation card expand: Slide down (150ms)
- Hover states: Instant (no delay)
- Loading: Subtle pulse

**No complex animations** - they distract from the content.

## Accessibility

**Keyboard navigation:**
- Logical tab order
- Clear focus indicators
- All actions accessible without mouse

**Screen readers:**
- ARIA labels on icons
- Semantic HTML
- Alt text on visual elements

**Contrast:**
- WCAG AA minimum
- AAA for critical text

## Component Library

**Use shadcn/ui as base:**
- Already has accessible components
- Customizable with Tailwind
- Tree-shakeable

**Custom components:**
- `<CitationCard />` - The citation cards
- `<CodeBlock />` - Syntax highlighted code
- `<RetrievalDebug />` - Debug panel
- `<IndexStatus />` - Index status indicator

## Example Flows

### Flow 1: First time user

1. Land on nexu.sh
2. See empty state with examples
3. Click example → Query sent
4. Stream response with citations
5. Click citation → View code on GitHub
6. Ask follow-up question

### Flow 2: Power user

1. `⌘K` → Focus input
2. Type query
3. `⌘↵` → Send
4. `⌘D` → Toggle debug panel
5. See retrieval details
6. `⌘1` → Jump to first citation
7. Adjust settings to refine

### Flow 3: No results

1. User asks obscure query
2. System finds no good matches
3. Show "No results" state with suggestions
4. User refines query
5. Better results

## Performance Budget

**Metrics:**

- **Initial load:** <2s (P95)
- **Time to interactive:** <3s
- **Message send → first token:** <500ms
- **Full response:** <3s (depending on length)

**Optimizations:**

- Code splitting (Next.js automatic)
- Lazy load citation code previews
- Stream response for perceived speed
- Cache common queries

## Testing

**Manual testing checklist:**

- [ ] Citations link correctly to GitHub
- [ ] Keyboard shortcuts work
- [ ] Streaming has no flickering
- [ ] Error states display appropriately
- [ ] Mobile is usable (basic)
- [ ] Dark mode is correct
- [ ] Settings persist in localStorage

**Automated:**

- Visual regression tests (Percy/Chromatic)
- Accessibility audits (axe)
- Performance budgets (Lighthouse CI)

## Future Iterations

**Post-MVP:**

1. **File tree browser** - Explore repo visually
2. **Multi-turn context** - Maintain context between queries
3. **Compare mode** - Compare multiple chunks side by side
4. **Export chat** - Markdown/PDF of conversation
5. **Shareable links** - Link to specific chat

**Later:**

- Support for private repos (auth)
- Multiple repos simultaneously
- Custom indexing rules
- Public API

## Conclusion

UI should be:
- **Fast** - No friction between thought and execution
- **Transparent** - Show the "how", don't hide it
- **Dense** - Maximum info in minimum space
- **Citable** - Direct links to sources always

Inspiration: Tools that hackers love (Linear, Warp, Cursor)

Not consumer-friendly, **developer-first**.
