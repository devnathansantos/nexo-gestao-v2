# Publicar o NEXO Gestão V2

Este projeto é independente do NEXO antigo. Publique apenas no repositório `nexo-gestao-v2`.

## Etapa 1 — Definir e revisar o Supabase

1. Confirme o modelo de contas e empresas antes de definir permissões e relacionamentos.
2. Inspecione o projeto Supabase atual e registre o esquema existente antes de alterar qualquer coisa.
3. Revise e aprove uma migração inicial compatível com o estado confirmado.
4. Só então obtenha a Project URL e a chave `publishable` (`sb_publishable_...`). A chave pública antiga `anon` também é aceita.

**Não execute as migrações atuais ainda.** Elas são uma proposta anterior e serão revisadas após confirmar o modelo de acesso. Não apague tabelas nem registros sem um plano aprovado e uma cópia de segurança. Nunca publique nem cole no chat senhas, tokens privados, `service_role` ou `sb_secret_`.

## Etapa 2 — Configurar o repositório GitHub

No repositório `devnathansantos/nexo-gestao-v2`, depois da revisão do diff e da autorização para publicar:

1. Envie os arquivos desta pasta para a raiz da branch `main`. Não altere o repositório antigo `nexo-gestao`.
2. Abra **Settings → Secrets and variables → Actions → Variables** e crie estas duas **variables**:
   - `VITE_SUPABASE_URL` = URL HTTPS do projeto Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave pública publishable ou a chave legada anon.
3. Em **Settings → Pages**, selecione **GitHub Actions** como origem de publicação.
4. Abra a aba **Actions**. O workflow instala dependências, executa os testes, valida as variáveis, compila e publica o site. A publicação só avança se essas etapas passarem.

O workflow configura automaticamente o caminho do projeto como `/<nome-do-repositório>/`, adequado para `https://devnathansantos.github.io/nexo-gestao-v2/`.

## Etapa 3 — Ajustar URLs do Supabase Auth

No Supabase, abra **Authentication → URL Configuration**. Configure:

- **Site URL**: `https://devnathansantos.github.io/nexo-gestao-v2/`
- **Redirect URLs**: adicione `https://devnathansantos.github.io/nexo-gestao-v2/`

Esses endereços são usados nos fluxos de confirmação de e-mail e recuperação de senha.

## Etapa 4 — Validar antes de usar dados reais

1. Aguarde o workflow ficar verde e abra a URL publicada.
2. Crie uma conta de teste e confirme o e-mail, se a confirmação estiver habilitada.
3. Entre, confira se o aplicativo informa **banco conectado** e crie registros fictícios de cliente, veículo, serviço, funcionário, pagamento, despesa, orçamento e catálogo.
4. Recarregue o navegador e confira se os registros continuam lá.
5. Edite e exclua registros de teste.
6. Teste com contas distintas e confirme que o isolamento de dados corresponde ao modelo de usuários aprovado.

Se o workflow ficar vermelho, não considere o site publicado/validado: abra a execução em **Actions**, leia o primeiro erro e corrija-o antes de prosseguir. O uso de contas compartilhadas por empresa será definido antes da implementação final do banco.
