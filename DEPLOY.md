# Deploy do RouteMap no servidor `glpi-srv`

Roteiro definitivo, na ordem. Host final: **https://routemap.itcbr.xyz**
(Cloudflare Tunnel `itcbr-tunnel`, TLS na borda — este ambiente não tem nginx
nem Let's Encrypt).

Referências: `novo-container-glpi-srv.md` (padrões do servidor),
`HANDOFF-SESSAO.md` §10.5 / §10.8 / §10.12 (one-offs, migração, admin).

| Campo | Valor |
|---|---|
| SSH | `glpissh@100.68.161.44` (Tailscale) |
| Pasta | `~/docker/routemap/` (codigo em `app/`) |
| Porta host | `3015` (só loopback) |
| Rede do compose | `routemap_default` |
| Containers | `routemap-app`, `routemap-db` |

---

## 0. Antes de começar

```bash
sudo ss -tlnp | grep :3015
```

Tem de sair **vazio**. Se a `3015` estiver ocupada, escolher outra livre e
trocar nos **dois** lugares: `docker-compose.yml` (`ports`) e
`~/.cloudflared/config.yml`.

```bash
free -m && df -h /
```

O `next build` roda no servidor e precisa de ~6 GB de heap
(`NODE_OPTIONS=--max-old-space-size=6144`, no Dockerfile). Sem isso o build
falha com `JavaScript heap out of memory` no type-check.

## 1. Pasta e clone

Layout do guia oficial: o compose e o `.env` ficam em
`~/docker/routemap/`, e o repositorio e clonado em `~/docker/routemap/app/`.

```bash
mkdir -p ~/docker/routemap
```

```bash
git clone https://github.com/ITC-Brasil/itc-routemap.git ~/docker/routemap/app
```

```bash
cd ~/docker/routemap && cp app/docker-compose.yml .
```

O compose e versionado dentro do repo, mas precisa estar na pasta do projeto
para o `docker compose` rodar de `~/docker/routemap/`. **Recopiar sempre que o
`docker-compose.yml` mudar no repo** — ver o passo 10.

## 2. Variáveis de ambiente

Criar `~/docker/routemap/.env` com as 14 chaves abaixo — todas obrigatórias.
O nome é **`.env`**, não `.env.docker`: o Compose lê `.env` da pasta do projeto
sozinho, sem `--env-file`, e é dele que saem as interpolações `${VAR}` do
`docker-compose.yml`. Com outro nome, todo `${VAR}` viraria string vazia.

**Sem aspas e sem `#` nos valores:** `docker run --env-file` não remove aspas e
elas entram no valor (medido no ensaio — foi assim que a senha do admin ficou
com 8 caracteres em vez de 6).

```
POSTGRES_PASSWORD=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://routemap.itcbr.xyz
ADMIN_EMAIL=
ADMIN_NOME=
ADMIN_PASSWORD=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_SERVICE_ACCOUNT_BASE64=
GOOGLE_MAPS_SERVER_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL=
GEMINI_API_KEY=
GEMINI_ENABLED=true
```

```bash
chmod 600 ~/docker/routemap/.env
```

**No console do Google Cloud**, antes do primeiro login por Google: adicionar
`https://routemap.itcbr.xyz/api/auth/callback/google` aos redirect URIs
autorizados do OAuth client.

## 3. Build e subida

`depends_on: service_healthy` já garante que o app só sobe com o Postgres
pronto — não é preciso subir em dois passos.

```bash
docker compose up -d --build
```

```bash
docker compose ps && docker logs routemap-app --tail 30
```

## 4. Migrations e seed

### 4a. `migrate deploy` — dentro do próprio container ✅

Com o `node_modules` completo no runner, o CLI do Prisma está na imagem. Chamar
**pelo caminho do módulo** — o standalone do Next não recria os symlinks de
`node_modules/.bin/`, então `npx prisma` não funciona:

```bash
docker compose exec app node node_modules/prisma/build/index.js migrate deploy
```

Esperado: `Applying migration 20260723211652_init` e `All migrations have been
successfully applied.` Não precisa de `-e DATABASE_URL`: o container de produção
já tem a variável apontando para `postgres:5432`.

### 4b. Seed — ainda exige o one-off da imagem `builder` ⚠️

O `tsx` está na imagem, mas `prisma/seed.ts` importa `../lib/prisma` e
`../lib/better-auth` — **fonte TypeScript que o runner não recebe** — e o
`lib/better-auth.ts` resolve `@/lib/prisma`, alias que depende do
`tsconfig.json`, também ausente. Verificado no container: falha com
`Cannot find module '../lib/prisma'`.

```bash
docker build --target builder -t itc-routemap-migrate:latest --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=dummy ./app
```

```bash
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-); DB="postgresql://itc_user:$PW@postgres:5432/itc_routemap"
```

```bash
docker run --rm --network routemap_default --env-file .env -e DATABASE_URL="$DB" itc-routemap-migrate:latest npx tsx prisma/seed.ts
```

O `-e DATABASE_URL` sobrescrito é obrigatório aqui: dentro da rede do compose o
host do banco é `postgres`, não `localhost`. Esperado:
`Admin ... criado com papel=admin`.

> Para o seed também rodar no container bastaria copiar `lib/` (200 KB) e o
> `tsconfig.json` para o runner — testado e funciona (`Admin ... criado com
> papel=admin`). Não foi adotado: levaria fonte da aplicação para a imagem de
> produção. Decisão em aberto, ver §10.18 do `HANDOFF-SESSAO.md`.

```bash
docker exec routemap-db psql -U itc_user -d itc_routemap -c '\dt'
```

## 5. Migração de dados Firestore → Postgres

Dry-run é o default; `--gravar` persiste. É idempotente e **preserva os IDs**,
por isso roda duas vezes: agora e no corte final.

```bash
docker run --rm --network routemap_default --env-file .env -e DATABASE_URL="$DB" itc-routemap-migrate:latest npx tsx scripts/migrar-firestore.ts
```

Se a saída acusar **CONFLITO**, a gravação está bloqueada de propósito: a
planilha e o app estão desalinhados (ponto `Atual` × rota `Confirmada`). A
saída é alinhar a fonte — marcar a planilha — e rodar de novo, nunca forçar.
Só com o dry-run limpo:

```bash
docker run --rm --network routemap_default --env-file .env -e DATABASE_URL="$DB" itc-routemap-migrate:latest npx tsx scripts/migrar-firestore.ts --gravar
```

## 6. Admin: trocar senha por Google

O seed cria o admin por **senha**. Um método por pessoa — para o acesso ser
pelo Google, apagar a conta e convidar. **A ordem importa:** `convidar.ts`
recusa email que já tem conta, e o hook do convite só roda na criação da conta.
`Account` e `Session` vão por CASCADE.

```bash
docker exec routemap-db psql -U itc_user -d itc_routemap -c "delete from \"user\" where email='SEU_EMAIL';"
```

```bash
docker run --rm --network routemap_default --env-file .env -e DATABASE_URL="$DB" itc-routemap-migrate:latest npx tsx scripts/convidar.ts SEU_EMAIL
```

```bash
docker exec routemap-db psql -U itc_user -d itc_routemap -c 'select email,status,"expiraEm">now() as valido from convites;'
```

Depois de logar pelo Google, o papel volta ao default do hook (`operador`) — o
convite não carrega papel. Corrigir na mão:

```bash
docker exec routemap-db psql -U itc_user -d itc_routemap -c "update \"user\" set papel='admin' where email='SEU_EMAIL';"
```

## 7. Rota no Cloudflare Tunnel

```bash
cloudflared tunnel route dns itcbr-tunnel routemap.itcbr.xyz
```

Editar `~/.cloudflared/config.yml` e inserir **antes** do catch-all
(`- service: http_status:404`):

```yaml
  - hostname: routemap.itcbr.xyz
    service: http://localhost:3015
```

```bash
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml && sudo systemctl restart cloudflared
```

```bash
systemctl status cloudflared --no-pager
```

## 8. Uptime Kuma

Em `https://monitor.itcbr.xyz` → **Add New Monitor**: type `HTTP(s)`, URL
`https://routemap.itcbr.xyz`, nome `itc-routemap`.

## 9. Verificações finais

```bash
curl -I http://127.0.0.1:3015
```

```bash
curl -I https://routemap.itcbr.xyz
```

```bash
docker compose ps && docker logs routemap-app --tail 50
```

```bash
docker exec routemap-db psql -U itc_user -d itc_routemap -c 'select count(*) from projetos;'
```

No navegador, com o host final:

- [ ] login pelo Google conclui e cria sessão — **re-testar aqui**: o ensaio de
      HTTPS validou o mecanismo em outro domínio, não neste
- [ ] mapa carrega (valida `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- [ ] a tela de projeto mostra o email da service account, e não
      "(verificar no .env)" (valida `NEXT_PUBLIC_SERVICE_ACCOUNT_EMAIL`)
- [ ] sincronizar um projeto lê a planilha (valida a service account)
- [ ] `papel=admin` dá acesso às telas de admin

## 10. Atualizar depois do deploy

Watchtower **não** atualiza este stack: o `app` é buildado localmente, sem
registry, e auto-update de major do Postgres corromperia o datadir. Por isso
nenhum dos dois serviços leva o label. A atualização é manual:

```bash
cd ~/docker/routemap && git -C app pull origin main && cp app/docker-compose.yml . && docker compose up -d --build
```

Se houver migration nova, rodar o §4a logo depois do `up -d`:

```bash
docker compose exec app node node_modules/prisma/build/index.js migrate deploy
```

## Armadilhas conhecidas

- **`POSTGRES_PASSWORD` só vale na criação do volume.** Trocar depois no
  `.env` não muda a senha do banco; o `$PW` dos one-offs tem de ser a
  que **inicializou** o volume.
- **`ADMIN_PASSWORD` não é reaplicada.** O seed faz early-return para usuário
  existente — trocar a senha sem apagar o `User` não tem efeito nenhum.
- **Crash loop de DNS** depois de mudança de rede: `sudo systemctl restart docker`.
- **`eno8403` down** deixa os subdomínios `itcbr.xyz` inacessíveis de fora.
