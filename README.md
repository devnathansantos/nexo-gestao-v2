# NEXO Gestão V2

Aplicação de gestão automotiva com interface React, hospedagem estática no GitHub Pages e autenticação e persistência de dados pelo Supabase.

## Funcionalidades

- Acesso por conta, cadastro, recuperação de senha e encerramento de sessão.
- Cadastros de clientes, veículos, serviços, despesas, funcionários, pagamentos, orçamentos e catálogo.
- Edição, exclusão, busca e exportação dos dados da conta.
- Perfil da empresa, metas mensais, indicadores financeiros e histórico de atendimento.
- Row Level Security (RLS) nas tabelas para restringir os registros ao usuário autenticado.

## Desenvolvimento local

Requisitos: Node.js 20 ou superior e npm.

```bash
npm ci
cp .env.example .env.local
# Preencha .env.local com a URL e a chave pública do Supabase.
npm test
npm run dev
```

Sem configuração do Supabase, a aplicação não permite entrar nem criar dados. Configure somente a URL e a chave pública `publishable` ou `anon`. Nunca use `service_role`, `sb_secret_`, senha do banco ou outra credencial privilegiada no navegador ou em variáveis `VITE_*`.

## Estrutura

- `src/App.jsx`: interface, autenticação e fluxos da aplicação.
- `src/lib/data.js`: leitura, gravação e conversão dos dados.
- `src/lib/supabaseClient.js`: inicialização do Supabase.
- `supabase/migrations/`: esquema e políticas de acesso, ainda sujeitos à revisão final antes de aplicação.
- `.github/workflows/deploy.yml`: testes, build e publicação no GitHub Pages.
- `PUBLICAR.md`: requisitos de publicação e validação.

## Build e testes

```bash
npm test
VITE_BASE_PATH=/nexo-gestao-v2/ npm run build
```

O workflow usa `npm ci`, executa os testes e valida as variáveis públicas de configuração antes de publicar. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em **Settings → Secrets and variables → Actions → Variables** do repositório. O caminho-base do GitHub Pages é definido durante o build.
