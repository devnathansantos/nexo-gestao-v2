# Evolução do NEXO Gestão

## Referência e identidade

Referência somente de leitura: `devnathansantos/nexo-gestao`, commit `9e7f1bafda96d2619ca260e26ef5901bf6b97643`. Foram consultados `script.js`, HTML, CSS, manifesto e README. O original permanece intacto. A logo e os ícones foram copiados sem edição para esta versão. Seu azul, fundo claro, cartões arredondados e hierarquia visual orientam a interface.

O original tem pacotes, serviços, despesas, funcionários, metas, histórico, retorno de clientes e restauração local. O novo produto mantém o objetivo genérico para diversos ramos; não obriga todos os clientes a cadastrar veículos. A regra financeira original agrupa recebimentos pela data do serviço; a 0.3 separa datas e registros de recebimentos para suportar parcelas e caixa com precisão.

## Implementado no código 0.3

- Conta/empresa, confirmação e recuperação de senha, clientes e isolamento entre empresas.
- Catálogo de produtos/serviços, orçamentos, descontos, estados, impressão e snapshot dos itens.
- Financeiro: venda/serviço avulso, conversão única de orçamento, despesas, recebimentos/pagamentos parciais, vencimentos e correções com histórico.
- Indicadores por mês de competência e por data efetiva de caixa; categorias de despesas; CSV anual separado por finalidade.
- Retorno de clientes com base em vendas/serviços e texto para contato manual, sem disparos automáticos.
- JSON v3 inclui os registros financeiros; PIN local e PWA; paginação visual nas listas antigas e paginação no servidor nas novas telas financeiras/retorno.
- Limites automáticos de bundle, cancelamento de leituras e telas carregadas sob demanda.

## Integração que ainda depende do ambiente

O MCP Supabase está cadastrado no CLI, mas não expõe ferramentas nesta conversa; a conexão a `mcp.supabase.com` recebeu bloqueio 403 do proxy da nuvem. O proprietário confirmou posteriormente a aplicação das três migrações pelo Codex do terminal; o registro está em [PUBLICAR-E-HOMOLOGAR.md](PUBLICAR-E-HOMOLOGAR.md). O acesso desta tarefa em nuvem não é equivalente ao acesso do Codex instalado no computador do proprietário.

As próximas tarefas são configurar Auth/SMTP gratuito e URLs, ligar o frontend e homologar duas empresas. O MCP do terminal já permite continuar; disponibilizá-lo nesta sessão em nuvem é uma alternativa, não uma exigência para prosseguir. Não publicar uma tela como integrada apenas porque os testes locais passaram.

O repositório alvo é exclusivamente `devnathansantos/nexo-gestao-v2`. Há alterações remotas na `main` posteriores à base `backup`; a entrega deve ir para uma branch própria, sem sobrescrever essa história nem o repositório original.

## Próximos módulos do objetivo completo

1. Funcionários/comissões com vínculo às operações e pagamentos.
2. Estoque, fornecedores e compras: registrar movimentos, custos e recebimentos sem sobrescrever saldos nem confundir compra com pagamento.
3. Perfil/histórico detalhado do cliente, pacotes reutilizáveis, metas e análises anuais na tela.
4. Personalização de empresa/documentos, campos por segmento, devoluções e conciliação de contas financeiras.
5. Importação assistida do JSON antigo, restauração transacional e política de backups automáticos do banco.
6. Homologação de autenticação/e-mails, desempenho real, cargas concorrentes e PWA no Safari/iPhone.

O sistema ainda não tem paridade total com o original nem todos os módulos da visão final. Relatórios gerenciais apoiam a organização e o contador; emissão fiscal, cálculo de impostos, folha e declarações não foram implementados.
