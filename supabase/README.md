# Supabase — empresas, clientes, catálogo e orçamentos

Esta pasta prepara cadastro/login de uma conta por empresa, clientes, catálogo genérico de produtos/serviços e orçamentos. As migrações e os testes locais não substituem configurar e validar o projeto Supabase real. Não há MFA no escopo desta entrega. O PIN opcional está implementado no front-end como bloqueio local do aparelho, sem armazenar PIN no banco e sem substituir a autenticação.

## Segunda etapa: catálogo e orçamentos

Se a primeira migração já foi aplicada, execute somente [`migrations/202611040001_catalog_quotes.sql`](migrations/202611040001_catalog_quotes.sql) inteiro em **SQL Editor → New query**, após conferir o projeto e autorizar essa alteração. O resultado esperado é **Success. No rows returned**; as novas tabelas públicas são `catalog_items`, `quotes` e `quote_items`. Não execute reset nem o bootstrap de testes no banco real.

Em um projeto novo, aplique `202611030001_company_customers.sql` e depois `202611040001_catalog_quotes.sql`, nessa ordem. Não reaplique a primeira depois da segunda, pois a exportação inicial cobre menos módulos. O contrato dos campos, RPCs, limites, idempotência e transições está em [Catálogo e orçamentos](COMERCIO.md).

## Contrato dos dados

- `companies`: `id`, `owner_id`, `name`, `created_at`, `updated_at`. Existe uma empresa por usuário do Supabase Auth.
- `customers`: `id`, `company_id`, `name`, `email`, `phone`, `document`, `notes`, `active`, `created_at`, `updated_at`.
- Campos opcionais de texto podem ser `null`. O nome da empresa deve ter de 2 a 120 caracteres; o nome do cliente, de 2 a 160.
- O cadastro usa `supabase.auth.signUp({ email, password, options: { data: { company_name: nomeDaEmpresa }, emailRedirectTo: urlDoSite } })`. A empresa é criada no banco pelo trigger, com o ID do usuário real. A interface não deve inserir uma empresa por conta própria.
- A empresa autenticada pode consultar sua própria empresa e alterar apenas seu nome. Não pode trocar o proprietário nem excluir a empresa pela API do navegador.
- O cliente autenticado pode consultar, criar, atualizar e excluir clientes da própria empresa. Ao atualizar clientes, envie apenas `name`, `email`, `phone`, `document`, `notes` e `active`: IDs, empresa e datas são protegidos.
- A chave pública não concede acesso aos dados empresariais sem autenticação. As regras de acesso estão no banco, não apenas nos filtros da interface.

## Exportação consistente

A função `public.nexo_export_company_data()` recebe **nenhum parâmetro** e escolhe a empresa exclusivamente pelo usuário autenticado (`auth.uid()`). Após a segunda migração, retorna `{ company, customers, catalog_items, quotes }`, com a linha completa da própria empresa e seus registros. Orçamentos incluem `items`, ordenados por posição; as coleções principais são ordenadas por `created_at` decrescente e `id` crescente. Sem empresa vinculada, retorna `null`; coleções sem registros são arrays vazios.

A função é `STABLE`, `SECURITY INVOKER` e executa um único `SELECT`, para ler os módulos no mesmo snapshot do PostgreSQL, preservando RLS e permissões de quem chamou. A exportação usa essa RPC em vez de montar o arquivo a partir de páginas separadas; assim, inserções durante uma paginação não causam perdas silenciosas. Se o serviço não conseguir produzir a resposta completa, a exportação deve falhar e informar o usuário, sem substituir por uma lista parcial.

No navegador, chame `supabase.rpc('nexo_export_company_data')` após autenticar. Somente `authenticated` possui permissão de execução. O arquivo gerado pela interface deve omitir `owner_id`, senhas, tokens e PIN, mantendo apenas os dados de negócio aprovados. O snapshot serve para exportar os dados existentes nesta etapa; a restauração ainda precisa ser implementada e validada separadamente.

## Configuração do projeto, passo a passo

1. Entre no painel do [Supabase](https://supabase.com/dashboard) e selecione o projeto que deseja usar. Se ainda não existir, crie um projeto e aguarde ficar disponível. Guarde a senha do banco no seu gerenciador de senhas; não envie essa senha pelo chat.
2. Se o projeto já possui dados, faça um backup e confira se já existem tabelas chamadas `companies` ou `customers`, ou triggers de cadastro de usuários. Havendo conflito, pare e peça revisão da migração. Não apague tabelas nem execute um reset para instalar o NEXO.
3. Abra **SQL Editor → New query**. Copie o arquivo [`migrations/202611030001_company_customers.sql`](migrations/202611030001_company_customers.sql), confira o projeto selecionado e execute a migração somente após autorizar sua aplicação nesse banco. O arquivo cria duas tabelas, suas regras de acesso e um trigger em novos cadastros do Auth. Ele não migra contas antigas automaticamente.
4. Em **Authentication → Providers/Sign In → Email**, mantenha o login por e-mail/senha habilitado e a confirmação de e-mail habilitada. O nome de alguns menus pode variar conforme a versão do painel.
5. Em **Authentication → URL Configuration**, configure **Site URL** com a URL final do site. Para este repositório, se publicar no endereço padrão do GitHub Pages, será `https://devnathansantos.github.io/nexo-gestao-v2/`. Use a URL real caso escolha um domínio próprio.
6. No mesmo local, acrescente as URLs de retorno autorizadas: a URL final do site, `http://localhost:5173/` e `http://127.0.0.1:5173/`. Se o código usar uma rota de retorno dedicada, inclua a URL exata dessa rota também. Não autorize domínios desconhecidos nem curingas amplos.
7. Em **Project Settings → API/Data API**, copie apenas **Project URL** e a chave **publishable** (ou a chave legada **anon**). Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de desenvolvimento. Essas configurações são públicas por natureza e integram o pacote do navegador; nunca use uma chave `secret`, `service_role`, a senha do banco ou credenciais SMTP em variáveis `VITE_*`.
8. Para usuários externos em produção, configure **Authentication → Email/SMTP** com um serviço de e-mail aprovado por você. O remetente padrão do Supabase é limitado a testes e destinatários autorizados. Verifique remetente, domínio e limites do plano com seu provedor; não contrate serviço pago sem aprovar o custo.
9. Reinicie o servidor de desenvolvimento após alterar suas variáveis. Cadastre duas empresas de teste com e-mails diferentes, confirme os e-mails e execute a validação abaixo. Nenhuma publicação no GitHub Pages é necessária para o primeiro teste local.

Ao publicar no GitHub Pages, as variáveis públicas precisam estar presentes durante o build do GitHub Actions; configurar apenas o ambiente de desenvolvimento não configura automaticamente o build publicado. A confirmação de e-mail usa PKCE: abra o link no mesmo navegador em que iniciou o cadastro. Para recuperação de senha, inclua também o endereço de retorno gerado pela aplicação (com `?flow=recovery`) na lista autorizada e teste o fluxo completo antes de publicar.

## Validação funcional necessária no projeto real

1. Cadastre a empresa A, confirme o e-mail e entre. Crie um cliente, recarregue a página e saia/entre novamente; o cliente precisa permanecer.
2. Entre com uma empresa B. O cliente da A não pode aparecer.
3. Usando uma sessão autenticada da B, tente consultar diretamente na API um ID de cliente pertencente à A: deve retornar zero registros. Tentar inserir um cliente com o `company_id` da A deve falhar; atualizar ou excluir o cliente da A não pode afetar nenhuma linha.
4. Saia da conta. Sem sessão, a API não deve permitir ler ou alterar os dados de nenhuma empresa.
5. Teste edição e exclusão de um cliente próprio; confira mensagens de erro e confirmação de exclusão. Nunca execute tentativas de alteração em dados reais de terceiros; use somente as empresas de teste autorizadas.
6. Teste confirmação de e-mail, recuperação de senha e retorno à URL correta. Esses passos dependem do projeto real e do envio de e-mail; os testes SQL locais não os substituem.

## Testes SQL em um PostgreSQL descartável

Os arquivos `tests/bootstrap.sql` e `tests/isolation.sql` são exclusivamente para banco de teste vazio. **Não execute o bootstrap no seu Supabase:** ele fornece uma versão mínima da interface `auth.users` e dos papéis `anon`/`authenticated` para testar as políticas sem um serviço remoto.

Com `psql` disponível e uma variável `TEST_DATABASE_URL` que aponte para um banco PostgreSQL vazio e descartável:

```sh
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/bootstrap.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/migrations/202611030001_company_customers.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/migrations/202611030001_company_customers.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/migrations/202611040001_catalog_quotes.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/migrations/202611040001_catalog_quotes.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/isolation.sql
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/commerce.sql
```

A repetição da migração verifica que ela pode ser reaplicada nessa estrutura sem recriar dados. Os testes executam consultas como `authenticated` e `anon`, com `auth.uid()` controlado para cada conta, e falham se o isolamento for quebrado. As tentativas proibidas são falhas esperadas, capturadas pelas próprias asserções; uma falha inesperada interrompe a execução. Os dados de teste são revertidos ao final.

Essa validação também pode ser executada em PostgreSQL embutido com PGlite, preservando o motor SQL, os papéis e o RLS:

```sh
npm run test:db
```

O script cria um banco em memória, aplica cada migração duas vezes na ordem correta e executa ambas as suites SQL, conferindo ao final que as transações foram revertidas. Também verifica grants antigos por coluna, políticas desconhecidas, RLS do catálogo, RPCs de orçamentos, cálculos, snapshots, numeração independente, idempotência, conflitos de edição e transições. Isso verifica o modelo de acesso no PostgreSQL, mas não substitui testar Auth, PostgREST, SMTP e URLs no projeto Supabase real.

## Limites desta migração

Contas Auth que já existiam antes da migração não recebem uma empresa automaticamente. Uma importação dessas contas e de dados antigos precisa de um plano aprovado. O trigger de cadastro também afeta novos usuários criados pelo painel/admin, portanto esses cadastros precisam fornecer o nome da empresa.

A terceira migração acrescenta o financeiro. Movimentações de estoque, compras, restauração de backups e auditoria por funcionário continuam pendentes. Um produto no catálogo não representa um saldo de estoque. Com uma conta compartilhada, o banco identifica a conta da empresa, não qual pessoa digitou uma alteração.

## Terceira etapa: financeiro e retorno de clientes

Depois das duas primeiras migrações, aplique `202611050001_finance.sql` para habilitar operações, pagamentos, indicadores, retorno de clientes e snapshot JSON v3. Em um banco existente, revise o esquema e o histórico antes de aplicar. Não reaplique uma migração anterior isoladamente: ela pode reduzir o escopo da função de exportação. Leia [FINANCEIRO.md](FINANCEIRO.md) para tabelas, RPCs, permissões, cálculos e limites. O proprietário confirmou a aplicação remota pelo MCP do terminal. Consulte [Publicar e homologar](../docs/PUBLICAR-E-HOMOLOGAR.md) para o histórico registrado e a configuração gratuita de e-mails.
