# Fluid Canvas Portfolio

Personal portfolio built with TanStack Start, Vite, React, and Cloudflare Workers.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Manual Cloudflare deploy

```bash
npm run build
cd dist/server
../../node_modules/.bin/wrangler deploy --config wrangler.json
```

## Future updates

After the GitHub repository is connected to Cloudflare, update the site by committing and pushing:

```bash
git add .
git commit -m "Update portfolio"
git push
```
