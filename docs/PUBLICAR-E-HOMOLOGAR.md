# Frontend, e-mails gratuitos e homologação

## Estado do backend — relatório do proprietário, 7/11/2026

Projeto `sgytnlhqmbaljrrzufcc`. Código aplicado: commit `bcc57e9` da branch `codex/nexo-v2-finance`.

| Arquivo local                        | Nome no MCP         | Versão registrada no Supabase |
| ------------------------------------ | ------------------- | ----------------------------- |
| `202611030001_company_customers.sql` | `company_customers` | `20261107142857`              |
| `202611040001_catalog_quotes.sql`    | `catalog_quotes`    | `20261107143007`              |
| `202611050001_finance.sql`           | `finance`           | `20261107143020`              |

O proprietário informou que o MCP confirmou conteúdo idêntico, sete tabelas públicas com RLS, políticas/privilégios esperados, oito RPCs e o snapshot financeiro. As tabelas internas permaneceram intactas. Esta sessão em nuvem não executou a inspeção remota; o relatório completo está no computador do proprietário em `Projetos/nexo-backend-bcc57e9-relatorio.md`.

**Não aplicar essas migrações novamente.** Os timestamps do MCP diferem dos nomes locais; não executar `supabase db push` supondo que versões ausentes com os nomes locais representam SQL pendente. Reconciliar o histórico apenas após revisão, caso a CLI de migrações seja adotada.

Os quatro avisos de funções `SECURITY DEFINER` são compatíveis com as quatro RPCs de escrita previstas. A implementação restringe execução e valida proprietário, com `search_path` vazio. O contador privado não possui políticas para acesso por clientes; é usado internamente pelas funções autorizadas. Conferir as referências do relatório antes de classificar qualquer aviso como resolvido. Não remover proteções para silenciar o Advisor.

## Recuperação gratuita: implementação e limites

A confirmação de cadastro e a recuperação de senha já usam Supabase Auth no frontend (`signUp`, `resetPasswordForEmail`, fluxo PKCE e `updateUser`). Não há SMS, provedor pago embutido nem contratação automática. Credenciais de envio nunca entram no código público.

O SMTP padrão do Supabase serve para testes com destinatários autorizados da equipe do projeto, com limites baixos; não é uma solução para cadastrar livremente empresas externas. Não convidar clientes para a equipe administrativa do Supabase apenas para permitir e-mails.

Uma opção sem mensalidade nem domínio próprio para testes e uso inicial é uma conta Gmail com SMTP e senha de app, se essa opção estiver disponível na conta Google. É necessário respeitar os limites de envio e as regras do Google e do Supabase; envio gratuito não é ilimitado nem tem entrega garantida. Não contratar plano pago, domínio ou serviço de e-mail sem nova instrução do proprietário. O teste real descrito abaixo é necessário antes de considerar o envio configurado.

### Ação pessoal do proprietário

1. Escolha uma conta Gmail, preferencialmente dedicada ao NEXO, para ser o remetente.
2. Em [Segurança da Conta Google](https://myaccount.google.com/security), habilite a verificação em duas etapas dessa conta.
3. Abra [Senhas de app](https://myaccount.google.com/apppasswords) e crie uma senha com o nome **NEXO Supabase**. Algumas contas, como contas administradas ou com proteções específicas, podem não oferecer esse recurso; se estiver indisponível, informe apenas a mensagem, sem expor credenciais.
4. No [SMTP do projeto Supabase](https://supabase.com/dashboard/project/sgytnlhqmbaljrrzufcc/auth/smtp), habilite SMTP personalizado e preencha:

   | Campo               | Valor                             |
   | ------------------- | --------------------------------- |
   | E-mail do remetente | O endereço Gmail escolhido        |
   | Nome do remetente   | NEXO Gestão                       |
   | Host                | `smtp.gmail.com`                  |
   | Porta               | `587` (STARTTLS)                  |
   | Usuário             | O endereço Gmail completo         |
   | Senha               | A senha de app gerada pelo Google |

5. Salve a senha somente nesse painel. Não use a senha normal do Gmail, não coloque a senha de app em `.env.local`, GitHub, variáveis `VITE_*` ou no chat.
6. Mantenha a confirmação de e-mail do Supabase habilitada. Não reduza a segurança para contornar um problema de envio. Preserve limites de envio durante os testes e aguarde o intervalo permitido entre tentativas.

Referências: [SMTP personalizado do Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [senhas de app Google](https://support.google.com/accounts/answer/185833), [configuração de clientes de e-mail Gmail](https://support.google.com/mail/answer/7126229).

## URLs de autenticação

Endereço previsto do Pages, a confirmar na configuração do repositório:
`https://devnathansantos.github.io/nexo-gestao-v2/`.

No Supabase → Authentication → URL Configuration, use esse endereço como **Site URL** e preserve URLs existentes legítimas. Cadastre estes retornos para a implantação padrão:

```text
https://devnathansantos.github.io/nexo-gestao-v2/
https://devnathansantos.github.io/nexo-gestao-v2/?flow=recovery#/recuperar
```

Para desenvolvimento local, inclua os dois retornos de cada origem que efetivamente usar:

```text
http://localhost:5173/
http://localhost:5173/?flow=recovery#/recuperar
http://127.0.0.1:5173/
http://127.0.0.1:5173/?flow=recovery#/recuperar
```

Os endereços correspondem à função `createAuthRedirectUrl` do código. Não adicionar curingas amplos. Inicie cadastro/recuperação e abra o link no mesmo navegador, por causa do verificador PKCE. Faça primeiro o teste web; Safari e PWA instalável podem manter armazenamentos separados e precisam de validação específica no aparelho.

## Procedimento para o Codex do terminal: frontend

1. Na pasta separada da entrega, confirme `git status` e o remoto `devnathansantos/nexo-gestao-v2`. Atualize a branch `codex/nexo-v2-finance` com `git pull --ff-only` somente se não houver alterações conflitantes. Não recrie o projeto nem reaplique o SQL.
2. Configure localmente `.env.local` com `VITE_SUPABASE_URL=https://sgytnlhqmbaljrrzufcc.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY` contendo **somente a chave pública desse projeto**, obtida pelo MCP ou painel. Não exibir a chave inteira em relatórios. Para desenvolvimento, `VITE_BASE_PATH=/`.
3. Se o npm local continuar com erro de DNS, registre o erro e use o workflow de verificação do GitHub para instalar e executar os testes; não desabilitar TLS ou apagar dependências/lockfile para tentar resolver DNS. Os testes locais desta entrega já passaram no ambiente em nuvem; isso não comprova execução na máquina local nem integração remota.
4. Pelo GitHub CLI autenticado ou pelo painel, confira **Settings → Pages** do repositório e escolha **GitHub Actions** como origem, se ainda não estiver assim. Preserve eventual domínio próprio; nesse caso revise URLs de retorno e base do build antes de publicar.
5. Em **Settings → Secrets and variables → Actions → Variables**, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto. Configurar `.env.local` não configura o GitHub Actions.
6. Execute o workflow pelo **arquivo `deploy.yml`**, selecionando a branch `codex/nexo-v2-finance`. Exemplo com GitHub CLI autenticado:

   ```bash
   gh workflow run deploy.yml --repo devnathansantos/nexo-gestao-v2 --ref codex/nexo-v2-finance
   ```

   A inspeção Git nesta sessão encontrou `backup` como branch padrão, com `workflow_dispatch` já existente nesse caminho. O nome mostrado na interface pode ser o antigo **Deploy NEXO V2**, enquanto a versão da branch nova se chama **Publicar NEXO**. Não selecionar a `main` ou `backup` como fonte do código novo. Não é necessário substituir essas branches para executar o workflow da entrega.

7. Acompanhe os logs de build/deploy. Se o environment `github-pages` permitir somente a branch padrão, acrescente especificamente a branch da entrega às branches autorizadas, preservando as demais proteções. Se houver aprovação de environment, siga o fluxo do GitHub.
8. Confirme a URL efetivamente publicada, carregamento dos assets na subpasta e presença da configuração correta. Não divulgar como produto pronto antes da homologação. A API de configurações do GitHub está bloqueada para esta sessão em nuvem; envio de código por Git foi possível.

## Teste pessoal de e-mail solicitado ao proprietário

Validação em nuvem em 7/11/2026: 24 cenários de navegador e três testes das URLs de autenticação passaram. Os novos cenários cobrem a troca de senha via PKCE, a recusa da senha antiga e a rejeição do link reutilizado. Não houve envio real de e-mail nem alteração remota de SMTP nesta sessão.

Após configurar SMTP e abrir o frontend conectado:

1. Cadastre uma empresa de teste com um e-mail que você controla.
2. Confira caixa de entrada e spam e abra a confirmação no mesmo navegador do cadastro.
3. Entre, crie um cliente de teste e saia.
4. Clique **Esqueceu a senha?**, informe o mesmo e-mail e solicite o link uma vez.
5. Abra o link no mesmo navegador, escolha uma senha nova e entre com ela.
6. Confira que a senha anterior foi recusada e que o cliente continua salvo.
7. Após sair, abra novamente o link já utilizado: ele não deve conceder acesso à empresa.
8. Informe somente qual etapa passou ou falhou e a mensagem exibida. Não compartilhe link de recuperação, código, senha ou token.

Para a homologação multiempresa, repita com outra conta de e-mail sob seu controle e cadastros fictícios distintos. A empresa B não deve ver registros da A. Valide também orçamento, conversão única, recebimentos parciais em datas distintas, despesas e JSON v3. Os testes de navegador da nuvem simulam a API e não enviam e-mails reais.
