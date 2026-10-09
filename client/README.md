# client — SellWithEllie SPA

React 19 + Vite. Serves the storefront, marketing site, and platform console from one
build (chosen by hostname — see `src/lib/siteContext.js`).

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:5173
npm run lint       # oxlint
npm run build      # -> dist/
```

Full docs: [`../docs/`](../docs/) — start with
[LOCAL_SETUP](../docs/LOCAL_SETUP.md), [ARCHITECTURE](../docs/ARCHITECTURE.md), and
[THEMING](../docs/THEMING.md).
