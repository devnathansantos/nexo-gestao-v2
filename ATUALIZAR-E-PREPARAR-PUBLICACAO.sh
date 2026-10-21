#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT="$HOME/Projetos/nexo-gestao-v2"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$PROJECT/.nexo-backups/publicacao-$STAMP"
FILES=(
  "index.html"
  "vite.config.js"
  "src/main.jsx"
  "src/App.jsx"
  "src/App.css"
  "src/index.css"
  "src/lib/supabaseClient.js"
  "public/nexo-mark.svg"
  ".github/workflows/deploy.yml"
  "supabase/migrations/202610200001_nexo_connection_test.sql"
  "supabase/CONFIGURAR-SUPABASE.md"
  ".env.example"
  "README.md"
  "PUBLICAR.md"
  ".gitignore"
)

if [[ ! -f "$PROJECT/package.json" || ! -f "$PROJECT/src/main.jsx" ]]; then
  echo "Não encontrei o projeto Vite em: $PROJECT"
  echo "Confirme se nexo-gestao-v2 está dentro de ~/Projetos. Nada foi alterado."
  exit 1
fi
for file in "${FILES[@]}"; do
  if [[ ! -f "$SOURCE_DIR/$file" ]]; then
    echo "Arquivo do pacote ausente: $file. Nada foi alterado."
    exit 1
  fi
done
mkdir -p "$BACKUP"
for file in "${FILES[@]}" package.json package-lock.json; do
  if [[ -f "$PROJECT/$file" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp -a "$PROJECT/$file" "$BACKUP/$file"
  fi
done

restore_backup() {
  echo
  echo "A preparação falhou. Restaurando os arquivos anteriores..."
  for file in "${FILES[@]}" package.json package-lock.json; do
    if [[ -f "$BACKUP/$file" ]]; then
      mkdir -p "$PROJECT/$(dirname "$file")"
      cp -a "$BACKUP/$file" "$PROJECT/$file"
    elif [[ "$file" != "package.json" ]]; then
      rm -f "$PROJECT/$file"
    fi
  done
  echo "Cópia de segurança: $BACKUP"
}

for file in "${FILES[@]}"; do
  mkdir -p "$PROJECT/$(dirname "$file")"
  cp -a "$SOURCE_DIR/$file" "$PROJECT/$file"
done

cd "$PROJECT"
echo "Instalando o cliente oficial do Supabase..."
if ! npm install @supabase/supabase-js --save --no-audit --no-fund; then
  restore_backup
  exit 1
fi
echo "Verificando a compilação do projeto..."
if ! npm run build; then
  restore_backup
  exit 1
fi

echo
echo "Pronto: o projeto foi preparado para GitHub Pages e Supabase."
echo "Backup da versão anterior: $BACKUP"
echo "O projeto NEXO antigo não foi modificado."
echo "Nenhuma conta ou chave Supabase foi criada; siga PUBLICAR.md."
