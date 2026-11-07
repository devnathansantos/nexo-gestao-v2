# NEXO Gestão

Plataforma de gestão multiempresa, reconstruída em React, TypeScript e Vite. Front-end estático preparado para GitHub Pages; autenticação e dados no Supabase.

## Esta entrega — 0.3.0

- Cadastro da empresa, login com senha, confirmação de e-mail e recuperação de senha.
- Clientes: criar, consultar, buscar, filtrar por situação, editar e excluir.
- Catálogo genérico de produtos e serviços: preços, unidades, busca, filtros e ativação/inativação.
- Orçamentos com itens do catálogo ou linhas personalizadas, quantidades fracionadas, desconto em reais, validade e condições de pagamento.
- Rascunhos editáveis, acompanhamento manual de envio/aprovação/recusa e impressão para salvar em PDF.
- Cálculos em centavos, criação idempotente e proteção contra sobrescrever uma versão alterada em outra sessão.
- Financeiro: vendas/serviços, despesas, recebimentos/pagamentos parciais, vencimentos e correções com histórico.
- Conversão única de orçamento aprovado em venda/serviço, preservando itens e valores.
- Indicadores por competência e caixa, categorias de gastos e CSV anual com valores originais/contabilizados.
- Retorno de clientes sem operação recente, com mensagem para copiar e enviar manualmente.
- Dados vinculados à empresa, com isolamento e permissões aplicados no PostgreSQL.
- Nome da empresa editável; indicadores reais dos cadastros, sem dados de demonstração.
- Exportação dos clientes em CSV e dos dados de empresa/clientes/catálogo/orçamentos e operações/pagamentos em JSON versão 3, por snapshot consistente.
- PIN opcional de seis dígitos neste aparelho, com bloqueio manual, ao reabrir e após cinco minutos sem atividade.
- PWA instalável e interface responsiva para computador e celular.
- Telas carregadas sob demanda, listas com 30 registros por página e cancelamento de consultas substituídas.

Funcionários/comissões, estoque, compras, metas, restauração e importação do legado pertencem às próximas entregas. Aprovar um orçamento **não registra recebimento nem movimenta estoque**. O JSON desta etapa **não é um backup completo de autenticação nem possui restauração disponível**. Não há edição offline: entrar, salvar e obter exportações atualizadas exigem conexão. O service worker armazena somente os arquivos estáticos do aplicativo, sem cache de respostas empresariais.

Os dados da empresa e do cliente, descrições e preços ficam preservados no orçamento. Alterar os cadastros não muda uma proposta salva. Uma revisão explícita de rascunho consulta novamente os dados do cliente selecionado. Rascunhos podem ser excluídos; orçamentos enviados podem retornar a rascunho para revisão. Aprovados ou recusados ficam encerrados e protegidos contra edição/exclusão nesta versão. A opção **Enviado** serve para acompanhamento; não envia e-mails ou mensagens automaticamente.

## Desenvolvimento

Node.js 22.12 ou superior (validado com 24.22.1) e npm.

```bash
npm ci
# Somente se ainda não existir; preserve sua configuração local.
test -f .env.local || cp .env.example .env.local
# Preencha somente a URL e a chave pública do seu projeto.
npm run dev
```

Variáveis de front-end são públicas: nunca use senha do banco, chave `service_role` ou `sb_secret_*`. O cliente rejeita chaves privilegiadas. Sem configuração válida, a interface informa conexão pendente e mantém o cadastro/login desativados.

Leia o [passo a passo do Supabase](supabase/README.md) antes de criar usuários. Em um projeto novo, aplique as migrações `202611030001_company_customers.sql`, `202611040001_catalog_quotes.sql` e `202611050001_finance.sql`, nessa ordem. Em um banco existente, confira o histórico e aplique somente as migrações pendentes. Elas preparam o cadastro automático da empresa, o isolamento e as operações transacionais de orçamento. Nenhuma migração foi aplicada em um projeto remoto nesta implementação.

## Validação

```bash
npm run typecheck
npm test
npm run test:db
npm run test:browser
npm run build
npm run check:performance
```

`test:db` executa PostgreSQL real embutido (PGlite), com esquema de autenticação mínimo para os testes. Verifica RLS e permissões com duas empresas, operações cruzadas, acesso anônimo, tentativa de alterar proprietário, metadata forjada, preços recalculados no servidor, rollback dos itens, idempotência, conflitos de versão e snapshot exportado. Não se conecta a um projeto remoto.

`test:browser` utiliza Playwright e Chromium. Na nuvem utiliza `/usr/bin/chromium` quando disponível; em outra máquina execute `npx playwright install chromium` ou defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. A API é interceptada com respostas de teste: esses cenários verificam a interface e não substituem a validação integrada com Auth/PostgREST/e-mails reais.

As medições, limites automáticos e próximos passos de escala estão em [PERFORMANCE.md](PERFORMANCE.md). A paginação visual preserva a busca completa e as exportações; a leitura no servidor ainda percorre os registros da empresa.

## Publicação no GitHub Pages

O workflow de verificação testa e compila. A publicação é **manual**, pelo workflow **Publicar NEXO**, e não foi executada nesta entrega.

1. Configure **Settings → Pages → Source → GitHub Actions**.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com as informações públicas do projeto novo.
3. Configure a URL do site e redirecionamentos no Supabase conforme o guia.
4. Quando aprovar a publicação, envie o código ao GitHub e execute **Actions → Publicar NEXO → Run workflow** na branch que contém esta versão.
5. Teste cadastro, confirmação, login, clientes, catálogo, orçamento, impressão e recuperação de senha no endereço publicado. Mudanças nas variáveis exigem nova compilação/publicação.

O workflow calcula a subpasta pelo nome do repositório. Repositórios `usuario.github.io` usam `/`. Domínio próprio precisa ter a base revisada antes da publicação. Não depende de redirecionamento de rotas no servidor do GitHub Pages.

## Segurança e limites

- Uma conta por empresa, conforme o escopo aprovado; não há identificação individual de funcionários.
- O proprietário vem de `auth.users.id`, nunca de metadata controlada pelo usuário.
- O PIN guarda hash PBKDF2 com salt aleatório, não o código em texto. Ele é um bloqueio visual local, não MFA nem criptografia da sessão. Limpar o armazenamento do navegador pode removê-lo; use também a proteção do aparelho.
- Esqueceu o PIN? Use **Esqueci o PIN: entrar com senha**, autentique novamente e configure outro PIN. Sair da conta não remove o PIN por conta própria.
- PKCE requer abrir confirmação/recuperação no mesmo navegador que iniciou o pedido. Para PWA no iPhone, os contêineres do Safari e da PWA podem ser diferentes: inicie a recuperação no navegador em que abrirá o e-mail. Testar no aparelho real faz parte da validação integrada pendente.
- E-mails para usuários externos em produção dependem de SMTP configurado. Nenhum provedor pago foi contratado.
- CSV/JSON podem conter dados pessoais; guarde-os com cuidado. Senhas e PIN ficam fora da exportação.

Consulte [o backend financeiro](supabase/FINANCEIRO.md) e [a evolução e pendências](docs/EVOLUCAO.md). Os relatórios apoiam a conferência e o contador; não calculam impostos nem substituem documentos fiscais.

## Organização

`src/components`: acesso, PIN e modal acessível compartilhado. `src/components/commerce`: catálogo, composição de orçamentos, consulta e documento de impressão. `src/hooks`: autenticação, clientes, catálogo, orçamentos e bloqueio local. `src/lib`: configuração, validações, cálculos em centavos, exportações e PIN. `supabase/migrations`: estrutura e políticas do banco. `supabase/tests`: testes PostgreSQL. `tests`: cenários do navegador. `public`: identidade e ícones.

Cada tarefa na nuvem já tem um checkout isolado. Trabalhe no checkout existente; não crie worktrees sem solicitação.
