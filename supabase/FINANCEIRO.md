# Backend financeiro — NEXO 0.3

Migração: `202611050001_finance.sql`, depois das migrações de empresas/clientes e catálogo/orçamentos. Não reaplique uma migração anterior isoladamente: cada etapa amplia o snapshot exportado. Antes da aplicação remota, confira o esquema existente e o histórico de migrações. Não execute o bootstrap de testes no Supabase real.

## Dados e responsabilidades

| Conteúdo                   | Responsabilidade no PostgreSQL                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operations`               | Venda/serviço ou despesa, competência, vencimento, valor em centavos, categoria, cliente/favorecido, snapshot do orçamento e motivo/data de anulação |
| `payments`                 | Movimentação efetiva, valor parcial ou integral, data, forma de pagamento, referência, autoria e motivo/data de anulação                             |
| `nexo_finance_command`     | Criação, conversão única de orçamento aprovado, pagamento e correção; validação da empresa pelo JWT, idempotência e bloqueios transacionais          |
| `nexo_finance_page`        | Página de até 30 operações, total filtrado, indicadores do mês e saldos gerais, em um snapshot consistente                                           |
| `nexo_operation_detail`    | Detalhes e histórico de pagamentos somente da empresa autenticada                                                                                    |
| `nexo_customer_return`     | Clientes ativos sem operação recente, incluindo quem ainda não tem histórico; página de até 30 clientes                                              |
| `nexo_export_company_data` | Snapshot completo ampliado com operações e pagamentos, para JSON v3 e relatórios anuais                                                              |

As duas tabelas têm RLS e permitem somente leitura ao cliente autenticado. Gravações passam por RPC com `search_path` vazio, proprietário obtido de `auth.uid()` e permissões explícitas. O navegador não escolhe a empresa da gravação. Acesso anônimo e alterações diretas são negados. Chaves estrangeiras compostas impedem pagamentos vinculados a operações de outra empresa.

## Precisão e histórico

- Valores de cada registro são inteiros em centavos, limitados a 1.000.000.000.000; quantias fracionárias no payload são recusadas.
- Agregados monetários saem do banco como strings inteiras e são formatados com `BigInt`, evitando perda de precisão em grandes totais.
- Venda/serviço reconhece a data da operação; caixa reconhece a data de cada pagamento. Ex.: serviço em janeiro recebido em fevereiro aparece no faturamento de janeiro e no caixa de fevereiro.
- Cada pagamento precisa ser positivo, não ultrapassar o saldo e ter uma data efetiva não futura. O calendário usa `America/Sao_Paulo` nesta versão.
- Pagamentos podem ocorrer antes da competência, para registrar adiantamentos. Operação não é comprovante fiscal nem reconhecimento contábil automático.
- A operação e seus pagamentos não são editados/apagados pelo cliente. Erros são anulados com motivo e ficam no histórico; correções de dados usam anulação e novo lançamento. Anulação de lançamento incorreto não representa devolução real de dinheiro.
- Uma operação com pagamentos válidos não pode ser anulada antes de corrigir esses pagamentos. Não se apaga dinheiro recebido silenciosamente.
- O orçamento aprovado gera somente uma operação; valores e itens vêm do banco. Tentativas repetidas retornam o registro existente, inclusive após timeout, sem gerar outra venda.
- Chaves `request_id` mantidas durante cada formulário tornam retries idempotentes. Se a primeira tentativa tiver sido concluída, o retorno canônico é a operação original, mesmo que o usuário tenha alterado os campos na tentativa seguinte.
- As mutações financeiras da mesma empresa são serializadas por bloqueio da empresa, além de bloqueio da operação. Isso prioriza consistência de saldo e request IDs; carga concorrente real ainda precisa ser medida no Supabase.

## Indicadores

Vendas e despesas: operações válidas da competência selecionada. Recebido e pago: pagamentos válidos da data efetiva selecionada. Movimento líquido: recebido menos pago, sem saldo bancário inicial. Ticket médio: vendas/serviços válidos do mês divididos pela quantidade, arredondado em centavos. A pagar/a receber: saldos ainda abertos de todos os períodos. Vencido: soma das obrigações e recebíveis abertos com vencimento anterior a hoje. Esses saldos não são reconstruções históricas na data final do filtro.

Busca/tipo filtram a lista; os indicadores continuam cobrindo o mês inteiro. Anulados aparecem no histórico, mas ficam fora dos indicadores. Categorias de despesa são gerenciais e não determinam dedutibilidade fiscal.

## Exportação e impostos

JSON v3 inclui as seis coleções de negócio: empresa, clientes, catálogo, orçamentos, operações e pagamentos. Preserva anulações e snapshots; não inclui sessões, senhas nem PIN. Não há restauração automática ou importação do legado nesta etapa.

CSV anual de operações e CSV anual de caixa são separados para evitar somar venda e recebimento duas vezes. Cada arquivo informa IDs, datas, natureza, referência, valor original e valor contabilizado (zero quando anulado), mais o motivo da anulação. Strings recebem proteção contra fórmulas de planilha. O relatório permite conferir os registros e levá-los ao contador, mas não calcula tributos ou preenche declarações fiscais.

## Performance e validação

Páginas e indicadores são consultados no servidor; o navegador recebe até 30 linhas, detalhes apenas ao abrir, e cancela consultas substituídas. Buscas aguardam 250 ms de pausa na digitação. Índices cobrem empresa/competência, recebimentos por data, saldo por operação e histórico por cliente. CSV/JSON completos são carregados apenas mediante exportação.

`npm run test:db` executa PostgreSQL embutido com duas empresas, escrita direta proibida, pagamentos parciais, limite de saldo, separação de meses, retries, correções, conversão de orçamento, retenção, paginação e snapshot. Testes de navegador usam respostas simuladas; homologação integrada, SMTP, latência real e Safari/iPhone continuam pendentes.
