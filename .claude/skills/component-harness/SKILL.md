---
name: component-harness
description: >-
  Verificar visualmente um componente/tela do frontend do o2-solution rodando
  ele isolado no navegador (headless), sem depender da API. Use quando precisar
  CONFERIR VISUALMENTE uma mudança de UI antes de commitar — o frontend local
  aponta pra API de produção e não dá pra bater em staging/localhost (CORS), então
  a forma de ver um componente é montá-lo com props mock num harness. Também para
  "tirar screenshot do componente", "ver como ficou", "conferir no navegador".
---

# Harness de componente (o2-solution frontend)

Monta um componente/tela isolado com props mock, sobe o Vite numa porta
dedicada e tira screenshot com o Chromium headless do Playwright. Serve pra
validar layout/cores/estados sem backend.

## Passos

**1. Criar os dois arquivos** na raiz de `frontend/`:

`frontend/debug.html`:
```html
<!doctype html><html><head><meta charset="utf-8"><style>body{background:#EEF1F5;margin:0;padding:24px;font-family:system-ui}</style></head><body><div id="root"></div><script type="module" src="/src/__debug.tsx"></script></body></html>
```

`frontend/src/__debug.tsx` — renderiza o componente real dentro do `ThemeProvider`, com props mock:
```tsx
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './ThemeContext'
import AlvoComponent from './components/AlvoComponent'   // o componente a testar

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <AlvoComponent {/* props mock aqui */} />
  </ThemeProvider>,
)
```
- Tokens de tema (`var(--text-1)` etc.) resolvem porque o `ThemeProvider` puxa o `index.css`.
- Tailwind (`className="flex gap-4"`) **não** aplica no harness — usar `style={{}}` inline no mock, ou aceitar que o espaçamento de classe não aparece.
- Se o componente faz `api.get`, stubar dentro do `__debug.tsx` (reatribuir `api.get`) — ver exemplo no fim.

**2. Subir o Vite + screenshot** (Bash tool):
```bash
cd frontend
(npx vite --port 5199 --strictPort > /tmp/vite-harness.log 2>&1 &) && sleep 4
CHROME=$(ls -d /c/Users/User/AppData/Local/ms-playwright/chromium-*/chrome-win64/chrome.exe | sort -V | tail -1)
"$CHROME" --headless=new --disable-gpu --no-sandbox --enable-logging=stderr \
  --virtual-time-budget=6000 --window-size=1200,900 \
  --screenshot=/tmp/harness.png --dump-dom "http://localhost:5199/debug.html" 2>/tmp/harness-chrome.log
grep -iE "Uncaught|ReferenceError|TypeError" /tmp/harness-chrome.log | head
SCRATCH="<scratchpad dir do system prompt>"
cp /tmp/harness.png "$SCRATCH/harness.png"
```
Ajustar `--window-size` ao componente (drawer estreito: `440,1000`; faixa de cards: `1000,360`).

**3. Ver o resultado:** `Read` em `$SCRATCH/harness.png`. Se `grep` achou erro de JS, corrigir e repetir.

**4. Limpar sempre antes de commitar:**
```bash
cd /c/Dev/o2-solution/frontend && rm -f debug.html src/__debug.tsx && rm -rf dist
pkill -f "vite --port 5199" 2>/dev/null
```
`debug.html` e `src/__debug.tsx` **nunca** entram em commit.

## Notas

- **Antes de commitar qualquer mudança de frontend:** `cd frontend && npx tsc --noEmit` (o deploy builda sem tsc, então type error não trava deploy mas quebra silencioso).
- `tsc` + `vite build` passam mas a tela fica branca? Quase sempre é prop adicionada no tipo (`}: {...}`) mas não no destructuring da função — conferir os DOIS lugares.
- Porta 5199 é a convenção deste harness (`--strictPort` falha se ocupada — matar o vite antigo).
- Só o Chromium **full** (`chromium-<n>/chrome-win64/chrome.exe`) tem o binário; o `chromium_headless_shell-*` não serve. O pacote `playwright` (npm) não está instalado, só os binários em cache.

## Exemplo: stubar `api.get`

```tsx
import api from './api'
const orig = api.get.bind(api)
;(api as unknown as { get: typeof api.get }).get = ((url: string, ...rest: unknown[]) => {
  if (url.includes('/rota-do-componente')) {
    return Promise.resolve({ data: { /* payload mock */ } })
  }
  return orig(url, ...(rest as []))
}) as typeof api.get
```
