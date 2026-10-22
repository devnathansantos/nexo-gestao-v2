# Estado da revisão técnica

Atualizado durante a preparação da primeira publicação do repositório `nexo-gestao-v2`.

## Revisão local

- O app exige uma sessão autenticada para abrir os módulos e bloquear operações sem conexão confirmada.
- A interface não oferece acesso de demonstração nem grava registros apenas em memória.
- O fluxo de entrada valida a sessão e carrega os dados antes de exibir o espaço da empresa. Em caso de erro de leitura, mostra a falha e não apresenta listas vazias como se fossem dados reais.
- A camada de dados implementa leitura paginada e operações de criação, edição e exclusão no Supabase.
- `.env.local`, `dist/` e `node_modules/` são excluídos pelo `.gitignore`; `.env.example` contém apenas valores fictícios.
- O workflow usa `npm ci`, roda os testes, valida as variáveis públicas e aplica o caminho-base do repositório ao build.
- O bundle de aplicação, React e Supabase é separado para evitar um arquivo inicial acima do limite de aviso do Vite.

## Testes executados localmente

- `npm test`: aprovado, sem falhas.
- `VITE_BASE_PATH=/nexo-gestao-v2/ npm run build`: aprovado.
- Conferência do `dist/index.html`: JavaScript, CSS e preloads apontam para `/nexo-gestao-v2/assets/`.
- `.env.local` não existe nesta cópia; nenhum valor de credencial foi lido ou incluído no build.

## Verificações ainda necessárias

- O repositório remoto e o site público não foram acessíveis neste ambiente sem rede; ainda é necessário verificar a execução real do workflow e o site após publicação.
- O schema SQL e as políticas RLS ainda não foram aplicados nem validados no Supabase real. As migrações atuais são uma proposta anterior e não devem ser executadas até a decisão do modelo de contas e a revisão final.
- Login, persistência e isolamento entre contas exigem testes contra o projeto Supabase e o site publicados.
- A publicação exige as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configuradas no GitHub Actions.

O primeiro deploy ainda depende da configuração das variáveis públicas no GitHub Actions e da aprovação do esquema Supabase.
