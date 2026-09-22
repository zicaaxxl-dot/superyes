# SuperSim — funil estático

Cópia do funil original de [atualizandoagora.netlify.app](https://atualizandoagora.netlify.app/), pronta para Cursor, Vercel ou Render.

## Funil

1. `/` — objetivo (pessoal / negócio)
2. `/inicio/` — landing + simulador
3. `/2/` → `/3/` → `/4/` → `/5/` → `/6/` → `/7/` → `/8/` — cadastro
4. `/criando/` — análise
5. `/conta/` — dados bancários / PIX
6. `/final/` — VSL (`/final/midia/vsl.mp4`)
7. `/ups/up1/` → `/ups/up5/` — upsells
8. `/upsell/` — checkout PIX

Back redirects: `/backs/backhome/`, `/backs/backof/`, `/backs/backof2/`, `/backs/backof3/`, `/backs/backup/`

UTMs da URL (`utm_source`, `ttclid`, etc.) são gravadas no `localStorage` e seguem entre as etapas.

## Preview local

```powershell
powershell -ExecutionPolicy Bypass -File ._serve.ps1
```

Abra `http://127.0.0.1:4173/`

## Deploy na Vercel

1. Instale a CLI: `npm i -g vercel`
2. Na pasta do projeto: `vercel`
3. Produção: `vercel --prod`

No dashboard da Vercel: **Import** deste repositório. Framework preset: **Other**. Output/root: pasta raiz (HTML estático).

## Deploy no Render

O Render exige um repositório Git (GitHub, GitLab ou Bitbucket).

1. Entre em [dashboard.render.com](https://dashboard.render.com) com a conta que quiser usar.
2. **New +** → **Static Site**.
3. Conecte o repositório deste projeto.
4. Se o `render.yaml` for detectado, aceite o blueprint. Senão preencha:
   - **Build Command:** deixe vazio
   - **Publish Directory:** `.`
5. **Create Static Site**.

Se o serviço já foi criado como **Web Service** (Docker), o `Dockerfile` cobre esse caso: clique em **Manual Deploy** → **Deploy latest commit**.

Não use rewrite `/*` → `/index.html`: o funil tem várias páginas HTML.
