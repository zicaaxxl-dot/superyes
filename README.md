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

## Painel admin

Não existia admin. Agora os cadastros vão para o painel:

**URL:** `https://SEU-DOMINIO-RENDER/admin`

- Usuário: `admin`
- Senha: `SuperYes#admin`

Troque a senha no Render em **Environment**: `ADMIN_PASSWORD`.

O painel mostra nome, CPF, telefone, e-mail, chave PIX, banco, valor, fotos da etapa 6 e os códigos PIX gerados.

Para os dados não sumirem no redeploy, no Render: **Disk** montado em `/data`.

## Preview local

Com Node:

```powershell
npm install
npm start
```

Abra `http://127.0.0.1:3000/` (funil) e `http://127.0.0.1:3000/admin`

## Deploy no Render

O serviço precisa ser **Web Service** com Docker (não Static Site), porque o admin é um servidor Node.

1. No serviço atual: **Manual Deploy** → **Deploy latest commit**
2. Environment:
   - `ADMIN_USER` = `admin`
   - `ADMIN_PASSWORD` = senha forte
   - `DATA_DIR` = `/data`
