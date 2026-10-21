# Configuração do Supabase — NEXO V2

1. Crie um projeto no plano Free do Supabase.
2. Abra **SQL Editor → New query**.
3. Copie e execute o conteúdo de `migrations/202610200001_nexo_connection_test.sql`.
4. Em **Project Settings → API Keys** (ou painel **Connect**), copie a **Project URL** e a chave **publishable** (`sb_publishable_...`). Também pode usar a antiga chave pública `anon` caso seja o formato mostrado no seu projeto.
5. Configure essas duas variáveis no GitHub, dentro do repositório V2, em **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Em **Authentication → URL Configuration**, configure como Site URL o endereço público final do GitHub Pages e adicione esse mesmo endereço em Redirect URLs.
7. Faça um novo push em `main` (ou execute manualmente o workflow em **Actions**) para recompilar o site com essas variáveis.

A chave publishable é pública e pode estar em um front-end estático; a segurança depende de Auth e RLS. **Nunca use uma chave `service_role` ou `sb_secret_...` no site, no repositório ou numa variável `VITE_*`.**

## O que o protótipo testa

O login/cadastro usa Supabase Auth quando as variáveis estão configuradas. Após entrar, o site consulta a tabela `nexo_connection_test` e insere um registro de verificação se ainda não houver um. O resultado aparece no rodapé do menu e em Configurações. A tabela tem políticas RLS para cada usuário ver e inserir apenas os próprios registros.

Os cadastros de clientes, serviços, despesas, equipe, orçamentos e catálogo continuam deliberadamente em modo de demonstração, em memória. Não use dados reais nesta fase. O banco definitivo será projetado depois que a prova de conceito estiver validada.
