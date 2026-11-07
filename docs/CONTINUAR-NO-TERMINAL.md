# Transferência para o Codex do terminal

Projeto de desenvolvimento: `devnathansantos/nexo-gestao-v2`.
Branch de entrega: `codex/nexo-v2-finance`. Versão: `0.3.0`.
Supabase autorizado: `sgytnlhqmbaljrrzufcc`.
O repositório `devnathansantos/nexo-gestao` permanece exclusivamente como referência, sem alterações.

## Atualização: backend já implantado

O proprietário confirmou a aplicação das três migrações no projeto real, com versões `20261107142857`, `20261107143007` e `20261107143020`. **Não reaplicar o passo 5 abaixo.** O procedimento inicial foi concluído. Continue por [PUBLICAR-E-HOMOLOGAR.md](PUBLICAR-E-HOMOLOGAR.md), que registra o resultado, o envio gratuito de e-mails e a configuração do frontend.

## Situação inicial verificada (histórico)

Em 7 de novembro de 2026, o proprietário trouxe o resultado da inspeção do MCP feita no terminal: projeto confirmado, schema `public` sem tabelas e lista de migrações vazia. Isso é evidência do acesso pelo terminal; o MCP não foi disponibilizado à sessão em nuvem. Nenhuma migração remota foi aplicada por esta sessão.

As sete tabelas públicas esperadas após as três migrações são `companies`, `customers`, `catalog_items`, `quotes`, `quote_items`, `operations` e `payments`. O contador de orçamentos fica em `nexo_private.quote_counters`. Tabelas internas de `auth`, `storage`, `realtime` e `vault` não são módulos do NEXO: não habilitar/desabilitar RLS ou alterar suas políticas por causa dessa inspeção. A primeira migração instala somente a integração necessária de criação de empresa via trigger de cadastro em `auth.users`.

## Instrução para o agente local

1. Confirme o remoto, a branch e `git status`. Preserve alterações locais: se a pasta já estiver em uso, prefira um clone separado para esta entrega. Não substitua a `main`, não use `reset --hard` e não faça force push.
2. Leia `README.md`, `supabase/README.md`, `supabase/FINANCEIRO.md` e `docs/EVOLUCAO.md`. Esta é a implementação já construída; não gerar outra estrutura nem misturar migrações antigas da `main`.
3. Use Node.js 22.12+ e execute `npm ci`, `npm test`, `npm run test:db` e `npm run build`. Os testes de banco usam PGlite descartável, sem conectar ao Supabase real. Se executar a suíte visual, instale Chromium e use `npm run test:browser`.
4. Pelo MCP autenticado, confirme novamente o projeto `sgytnlhqmbaljrrzufcc`, as tabelas públicas e as migrações. Se surgiram tabelas ou migrações desde a inspeção, compare antes de aplicar; não apague dados nem reconstrua o banco.
5. A implantação do backend já foi autorizada pelo proprietário. Se a inspeção confirmar o estado esperado, aplique o conteúdo exato dos arquivos abaixo usando a ferramenta de migração do MCP, na ordem indicada. Não execute `supabase/tests/bootstrap.sql` ou as suítes SQL no projeto real.
   1. `supabase/migrations/202611030001_company_customers.sql`
   2. `supabase/migrations/202611040001_catalog_quotes.sql`
   3. `supabase/migrations/202611050001_finance.sql`

6. Após cada aplicação, confira o resultado e o histórico. Compare também os nomes/conteúdo das migrações: a ferramenta MCP pode atribuir timestamps diferentes dos nomes locais. Não repetir uma migração já aplicada e não reaplicar uma antiga depois da nova, pois isso pode reduzir a função de exportação.
7. Consulte metadados de RLS, políticas e privilégios das sete tabelas do NEXO. `operations`, `payments`, `quotes` e `quote_items` permitem leitura aos usuários autenticados; suas gravações passam pelas RPCs autorizadas. Verifique as funções e o snapshot financeiro. Não relaxe RLS para resolver erros da interface.
8. Configure o frontend somente com URL e chave pública em `.env.local`, mantendo o arquivo fora do Git. Nunca colocar senha de banco, token MCP, `service_role` ou chave `sb_secret_*` em variáveis `VITE_*`.
9. Homologue cadastro, confirmação/recuperação por e-mail, duas empresas isoladas, cliente, orçamento, conversão, recebimento parcial, despesa e exportação. Use contas e registros identificados como teste e informe qualquer ação adicional necessária para Auth/SMTP. Testes simulados anteriores não substituem esta homologação real.
10. Relate quais migrações foram aplicadas, o que foi validado e o que permanece pendente. Não afirmar que o produto inteiro está pronto: estoque, compras, equipe/comissões, restauração e outros módulos estão no roteiro. A publicação do frontend deve usar a mesma versão de código e as configurações do projeto validado.

## Evidência da entrega em nuvem

103 testes unitários, 22 cenários de navegador com API simulada, testes de isolamento e regras financeiras no PostgreSQL/PGlite, build e limites de performance passaram antes da transferência. Código de aplicação e SQL não foram alterados depois desses testes; este guia registra a transferência.
