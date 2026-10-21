#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT="$HOME/Projetos/nexo-gestao-v2"
BACKUP_ROOT="$PROJECT/.nexo-backups"
if [[ ! -d "$BACKUP_ROOT" ]]; then echo "Não encontrei cópias em $BACKUP_ROOT"; exit 1; fi
BACKUP="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'publicacao-*' -printf '%f\n' | sort | tail -n 1)"
if [[ -z "$BACKUP" ]]; then echo "Não encontrei uma cópia de segurança da preparação para publicação."; exit 1; fi
BACKUP="$BACKUP_ROOT/$BACKUP"
FILES=("index.html" "vite.config.js" "src/main.jsx" "src/App.jsx" "src/App.css" "src/index.css" "src/lib/supabaseClient.js" "public/nexo-mark.svg" ".github/workflows/deploy.yml" "supabase/migrations/202610200001_nexo_connection_test.sql" "supabase/CONFIGURAR-SUPABASE.md" ".env.example" "README.md" "PUBLICAR.md" ".gitignore" "package.json" "package-lock.json")
for file in "${FILES[@]}"; do
  if [[ -f "$BACKUP/$file" ]]; then
    mkdir -p "$PROJECT/$(dirname "$file")"
    cp -a "$BACKUP/$file" "$PROJECT/$file"
  else
    rm -f "$PROJECT/$file"
  fi
done
(cd "$PROJECT" && npm run build)
echo "Arquivos restaurados a partir de: $BACKUP"
