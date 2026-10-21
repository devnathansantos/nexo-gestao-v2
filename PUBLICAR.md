# Publicar NEXO V2 na web + configurar Supabase

Esta é uma prévia pública para avaliação visual. O repositório antigo `devnathansantos/nexo-gestao` não deve ser usado para o V2.

## 1. Aplicar e testar os arquivos no Linux Mint

1. Extraia a pasta `nexo-v2-online` em `Downloads`.
2. Execute no Terminal:

   ```bash
   bash ~/Downloads/nexo-v2-online/ATUALIZAR-E-PREPARAR-PUBLICACAO.sh
   ```

3. Aguarde `Pronto` e `build` concluído. O script faz backup antes de copiar e tenta restaurar arquivos se a instalação ou compilação falhar.
4. Se o Vite já está aberto, atualize `http://localhost:5173`.

## 2. Criar o projeto grátis no Supabase

1. Abra https://supabase.com e entre com sua conta.
2. Crie um projeto no plano Free. Se a região São Paulo estiver disponível, escolha-a para manter a latência baixa no Brasil.
3. No projeto, abra **SQL Editor → New query**.
4. Copie o conteúdo de `supabase/migrations/202610200001_nexo_connection_test.sql`, execute e confira se terminou sem erro.
5. Abra o painel **Connect** ou **Project Settings → API Keys** e copie a **Project URL** e a chave **publishable** (`sb_publishable_...`). Se o projeto mostrar o formato legado, a chave pública `anon` também funciona.

## 3. Criar um repositório separado para o V2

1. Abra https://github.com/new.
2. Nome: `nexo-gestao-v2`. Use a mesma conta proprietária do repositório antigo. Não marque criação de README, `.gitignore` ou licença; deixe o repositório novo vazio.
3. No Terminal, execute os comandos abaixo, um por vez. A primeira linha entra na pasta local do V2; as próximas configuram um repositório Git separado:

   ```bash
   cd ~/Projetos/nexo-gestao-v2
   git init -b main
   git add .
   git commit -m "Prepare NEXO V2 preview with Supabase auth"
   git remote add origin https://github.com/devnathansantos/nexo-gestao-v2.git
   git push -u origin main
   ```

   Se `git init` informar que o repositório já existe, continue verificando `git status` e `git remote -v`. Se `origin` já existir, não adicione outro remoto: confira se aponta para `nexo-gestao-v2`.

## 4. Habilitar GitHub Pages

1. No repositório novo, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Abra **Settings → Secrets and variables → Actions → Variables** e crie estas duas variáveis com os dados do seu projeto Supabase:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave publishable (ou chave `anon` pública)
4. Abra **Actions** e acompanhe `Deploy NEXO V2 to GitHub Pages`. Quando ficar verde, o link estará na execução do workflow ou em **Settings → Pages**. Se o repositório estiver na conta `devnathansantos`, o endereço esperado será `https://devnathansantos.github.io/nexo-gestao-v2/`.

## 5. Configurar redirecionamentos do Supabase Auth

No Supabase, abra **Authentication → URL Configuration**:

- **Site URL**: o endereço real publicado no GitHub Pages.
- **Redirect URLs**: adicione esse mesmo endereço, incluindo o caminho `/nexo-gestao-v2/`.

Se ajustares as variáveis do GitHub depois da primeira publicação, execute novamente o workflow (ou faça um push novo) para recompilar o front-end.

## 6. Conferir o teste de conexão

1. Abra o link no computador e depois no celular.
2. Crie uma conta usando um e-mail seu e uma senha. Se confirmação de e-mail estiver ativada, abra o e-mail e confirme antes de entrar.
3. Entre no NEXO. A indicação na barra lateral e em **Configurações** deve mostrar o login real e, se a migração SQL e as políticas estiverem corretas, `Banco conectado`.
4. Se mostrar `Banco pendente`, confira se o SQL do passo 2 foi executado no mesmo projeto Supabase cujos dados colocou nas variáveis do GitHub Actions.

## Segurança e limites da prévia

- Só use a chave publishable ou chave pública `anon` no front-end. Nunca coloque `service_role`, `sb_secret_...`, senha do banco ou outro segredo no HTML, no GitHub, em `VITE_*` ou nesta conversa.
- As tabelas e políticas desta primeira etapa só validam Auth + RLS. Clientes, serviços, despesas, pagamentos, orçamentos e catálogo continuam em demonstração e não são persistidos.
- Use dados fictícios até a criação e os testes do esquema definitivo.
- GitHub Pages hospeda a interface; Supabase fornece Auth e banco. Ambos têm planos gratuitos com limites, e projetos Free do Supabase podem ser pausados por inatividade. Consulte o painel de uso antes de usar no negócio.
