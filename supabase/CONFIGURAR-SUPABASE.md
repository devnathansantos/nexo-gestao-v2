# Configurar o Supabase

## Estado do esquema

As migrações neste diretório ainda não estão aprovadas para execução no projeto real. A estrutura final do banco será revisada antes de preparar a migração inicial. **Não execute os arquivos SQL até essa revisão e aprovação.**

## Modelo de acesso confirmado

Cada empresa terá uma conta Supabase própria. A mesma conta pode entrar em vários dispositivos e acessar os mesmos dados; contas de empresas diferentes ficam isoladas por `auth.uid()` e pelas políticas RLS. Não haverá compartilhamento de uma empresa entre contas distintas nesta etapa.

O objetivo é preparar uma instalação limpa e verificável, sem tentar reaproveitar ou apagar tabelas existentes sem antes consultar o estado do projeto Supabase.

## Banco de dados

Depois da revisão e aprovação do esquema, abra **SQL Editor → New query** e execute as migrações na ordem indicada na documentação final:

1. `migrations/202610210002_nexo_schema_operacional.sql` cria as tabelas operacionais e políticas RLS da versão integrada.
2. `migrations/202610210003_nexo_relational_settings.sql` adiciona relacionamentos, perfil da empresa, metas mensais e atualização automática de `updated_at`.

As descrições das migrações atuais refletem uma proposta anterior e não garantem que correspondam ao estado do seu projeto. Não as aplique antes da revisão.

## Credenciais públicas

Em **Project Settings → API Keys** (ou **Connect**), obtenha a Project URL e a chave `publishable` (`sb_publishable_...`). A chave pública legada `anon` também é aceita. Para desenvolvimento local, preencha `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

A chave publishable/anon é destinada ao cliente web; o isolamento depende de RLS. Nunca use `service_role`, `sb_secret_`, senha do banco ou outra credencial secreta no navegador ou em variável `VITE_*`.

## Autenticação

Em **Authentication → URL Configuration**, defina a URL publicada como **Site URL** e inclua a URL completa do GitHub Pages em **Redirect URLs**, incluindo o caminho do repositório, por exemplo `https://USUARIO.github.io/REPOSITORIO/`. O mesmo endereço é usado no retorno de redefinição de senha.

O cadastro será aberto no site. Cada empresa cria sua própria conta Supabase; empresas diferentes não compartilham dados. A mesma conta pode ser usada em vários dispositivos. A inscrição deve criar uma identidade por empresa, e o banco deve aplicar RLS por essa identidade.
