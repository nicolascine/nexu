# @nexu/web

Frontend de Nexu construido con React + Vite (Lovable).

## Setup

1. Copia todo el contenido de tu proyecto Lovable aquí
2. Crea `.env.local` con la URL del API:

```bash
cp .env.example .env.local
```

3. Instala dependencias:

```bash
pnpm install
```

4. Inicia el servidor de desarrollo:

```bash
pnpm dev
```

## Conectar con el API

Usa las funciones de `src/lib/api.ts` para conectar con el backend:

```tsx
import { chatStream, getStatus } from '@/lib/api'

// obtener estado del índice
const status = await getStatus()

// chat con streaming
for await (const event of chatStream(messages)) {
  if (event.type === 'text') {
    // append text to response
  } else if (event.type === 'chunks') {
    // show source code chunks
  }
}
```

## Variables de entorno

- `VITE_API_URL` - URL del backend (default: `http://localhost:3000`)
