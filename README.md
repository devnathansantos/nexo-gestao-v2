# NEXO Gestão V2 — ambiente de prévia

Nova interface React/Vite, alinhada aos módulos e à marca do NEXO existente. O repositório antigo não precisa ser alterado.

## Desenvolvimento local

```bash
npm ci
cp .env.example .env.local
# Edite .env.local com a URL e a chave publishable do projeto Supabase.
npm run dev
```

Sem variáveis Supabase, o site abre em modo de demonstração. Com as variáveis, a autenticação real fica disponível.

## Publicação sem custo

Crie um repositório separado chamado `nexo-gestao-v2`, envie todos os arquivos para a branch `main` e em **Settings → Pages** escolha **GitHub Actions** como Source. O workflow em `.github/workflows/deploy.yml` compila e publica o site automaticamente em cada push para `main`.

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis do GitHub Actions para habilitar o login real na build publicada. A etapa de SQL e URL de redirecionamento está em [`supabase/CONFIGURAR-SUPABASE.md`](supabase/CONFIGURAR-SUPABASE.md).

## Limite desta versão

É uma prévia navegável com formulários de demonstração. O login é real quando Supabase estiver configurado; os dados dos módulos operacionais ainda não são persistidos no banco definitivo.

**Guia de publicação passo a passo:** [`PUBLICAR.md`](PUBLICAR.md).
