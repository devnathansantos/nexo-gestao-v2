# Catálogo e orçamentos — contrato da segunda etapa

A migração `202611040001_catalog_quotes.sql` é aditiva e depende da primeira. Não altera nenhum projeto remoto automaticamente. Antes de aplicá-la, confira o projeto e revise conflitos com tabelas/políticas preexistentes. As tabelas públicas novas são:

- `catalog_items`: `id`, `company_id`, `kind` (`product`/`service`), `name`, `description`, `unit`, `price_cents`, `active`, `created_at`, `updated_at`.
- `quotes`: `id`, `company_id`, `request_id`, `number`, `customer_id`, `customer_name`, `customer_email`, `customer_phone`, `customer_document`, `company_name`, `title`, `valid_until`, `notes`, `payment_terms`, `status`, `subtotal_cents`, `discount_cents`, `total_cents`, `created_at`, `updated_at`.
- `quote_items`: `id`, `quote_id`, `catalog_item_id`, `name`, `unit`, `quantity_milli`, `unit_price_cents`, `line_total_cents`, `position`.

O catálogo permite CRUD somente da própria empresa; IDs, empresa e datas não são editáveis pelo navegador. Orçamentos e itens permitem somente leitura direta com RLS. Toda gravação passa pelas RPCs abaixo, que verificam ownership no servidor e são atômicas. O contador `nexo_private.quote_counters` não possui acesso por papéis do navegador.

## Salvar

`nexo_save_quote(p_payload jsonb)` retorna o orçamento completo com `items` ordenados por `position` e `id`. Exemplo de criação:

```json
{
  "company_id": "UUID da empresa autenticada",
  "request_id": "UUID estável deste formulário de criação",
  "customer_id": "UUID de um cliente próprio",
  "title": "Proposta de produtos e serviços",
  "valid_until": "2026-12-31",
  "notes": null,
  "payment_terms": "PIX na entrega",
  "discount_cents": 100,
  "items": [{
    "catalog_item_id": null,
    "name": "Serviço personalizado",
    "unit": "h",
    "quantity_milli": 1500,
    "unit_price_cents": 10000
  }]
}
```

Não envie `id` na criação. Todo novo orçamento é `draft`; seu número é atribuído pelo contador transacional da empresa. O cliente é obrigatório e precisa pertencer à empresa. Dados de empresa/cliente vêm do banco; snapshots e totais forjados no payload são ignorados. Se houver referência ao catálogo, ela também deve ser própria. Valores explícitos da linha permitem personalizar nomes e preços sem mudar o catálogo.

Gere `request_id` uma vez por formulário e preserve-o ao repetir uma chamada após falha de rede. Sob lock por empresa, uma criação com chave de um orçamento existente retorna esse orçamento sem editar, duplicar ou consumir outro número. Empresas diferentes podem usar a mesma chave. Chamadas legadas sem a chave recebem um UUID no servidor e não oferecem essa garantia de repetição. Excluir um rascunho não reutiliza sua numeração.

Para editar, envie também `id` e `expected_updated_at` completos, exatamente como retornados pelo banco. Somente rascunhos podem ser editados. Se o cliente tiver sido excluído e `customer_id` estiver `null`, o snapshot anterior é preservado. Excluir um item do catálogo também preserva descrição, unidade, quantidade e valores do orçamento.

## Situação e exclusão

`nexo_set_quote_status(p_quote_id uuid, p_status text, p_expected_updated_at timestamptz)` retorna o orçamento completo. Transições: `draft → sent`; `sent → draft`, `sent → approved` ou `sent → declined`. Aprovado/recusado são estados finais nesta etapa.

`nexo_delete_quote(p_quote_id uuid, p_expected_updated_at timestamptz)` retorna `void`, excluindo somente rascunhos próprios e seus itens. O contador permanece. Edição, situação e exclusão usam lock da linha e rejeitam tokens antigos, evitando sobrescrever mudanças de outra aba. `updated_at` muda mesmo dentro da mesma transação; não transforme o token em uma data formatada antes de reenviar.

## Cálculos e limites

Valores monetários usam centavos inteiros. `quantity_milli = 1500` representa 1,5 unidades; `unit_price_cents = 101` representa R$ 1,01. Cada linha é arredondada por `floor((quantity_milli × unit_price_cents + 500) / 1000)`: nesse exemplo, 152 centavos. O subtotal soma linhas já arredondadas; o total subtrai o desconto fixo em centavos. O servidor calcula tudo, sem ponto flutuante para dinheiro.

Limites: 1 a 100 itens; quantidade 1 a 1.000.000.000 milésimos; preço 0 a 1.000.000.000 centavos; subtotal até 1.000.000.000.000 centavos; desconto de zero ao subtotal. Nomes/título têm 2 a 160 caracteres; unidade, 1 a 20; descrição/observações/condições, até 4.000. Datas precisam usar `YYYY-MM-DD` e existir no calendário.

Códigos SQL: `22023` validação; `42501` falta de autorização ou registro indisponível à empresa; `40001` token ausente/desatualizado; `55000` situação/transição proibida. Uma falha reverte toda a operação; não ficam orçamento ou itens parciais.

## Exportação e validação

A nova versão da RPC de exportação retorna, num único snapshot, `{ company, customers, catalog_items, quotes }`, com `items` dentro de cada orçamento. Ela continua `STABLE`, `SECURITY INVOKER`, sem parâmetros e acessível somente a contas autenticadas. Não exporte `owner_id`, senhas, tokens ou PIN no arquivo final. A restauração continua sendo uma etapa separada.

Antes de publicar, use empresas de teste para criar catálogo e orçamento, conferir arredondamento/desconto, editar um rascunho em duas abas, testar as transições e verificar que outra empresa não acessa IDs conhecidos. Apagar um cliente/item de catálogo de teste deve preservar os dados impressos de sua proposta. Após uma criação cuja resposta foi perdida, repetir com o mesmo `request_id` deve retornar o mesmo ID/número. Execute também `npm run test:db` para os testes PostgreSQL/PGlite.
