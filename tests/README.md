# Verificações de navegador

Execute `npm ci` e depois `npm run test:browser`. O runner inicia um Vite temporário em `127.0.0.1`, usa Chromium e encerra o servidor ao terminar. Quando o Chromium não estiver em `/usr/bin/chromium`, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o navegador com `npx playwright install chromium`.

Todos os dados e credenciais desta suíte são fictícios. As respostas da API Supabase são interceptadas no Playwright; nenhum projeto externo é contatado. Outros hosts externos são bloqueados e fazem a suíte falhar. Esta suíte demonstra o funcionamento da interface, incluindo autenticação, clientes, catálogo de produtos e serviços, orçamentos, exportações, troca de conta, bloqueio local por PIN, recuperação do PIN com senha, comportamento offline e tamanhos de tela. Ela **não valida envio real de e-mails nem substitui testes das permissões do banco**. Use `npm run test:db` para verificar o isolamento no PostgreSQL.

O fixture em `tests/fixtures/supabase.mjs` mantém dados de duas empresas e intercepta as tabelas de clientes/catálogo, a leitura dos orçamentos com seus itens e as RPCs de gravação, mudança de situação, exclusão e exportação. Ele calcula os totais e aplica um escopo simples para sustentar os cenários de interface; essas respostas simuladas **não comprovam transações, concorrência ou RLS do servidor**. A suíte PostgreSQL é a evidência separada para essas garantias.

Os cenários comerciais verificam valores decimais de preço e quantidade, desconto e total, persistência após recarregar, isolamento visual na troca de conta, bloqueio de gravação offline, conteúdo de exportação JSON e a apresentação segura para impressão. A impressão é conferida no DOM e com as regras CSS de impressão, sem acionar uma impressora; o Chromium também gera um PDF e a suíte exige uma única página para a proposta curta de teste. As verificações em tela móvel incluem listas, formulários e diálogos de confirmação.

Os resultados atuais, screenshots e arquivos exportados são gravados em `test-results/browser/`, ignorado pelo Git. A execução para no primeiro erro e preserva o status de falha.

A suíte também cria 601 registros adicionais em cada coleção para verificar o limite de 30 linhas por página, navegação, busca em registros fora da página visível, exportação completa e layout mobile. Os dados são fictícios e removidos da fixture ao terminar.

Após `npm run build`, execute `npm run check:performance` para verificar os limites de tamanho do carregamento inicial, a separação dos módulos e sua presença no cache estático da PWA. Veja [PERFORMANCE.md](../PERFORMANCE.md).

A versão 0.3 acrescenta conversão de orçamento aprovado, recebimentos parciais com mês diferente da venda, despesas, correções com histórico, exportação financeira anual e layout mobile. Os cálculos e permissões reais são cobertos por `supabase/tests/finance.sql`; a fixture financeira no navegador é apenas suporte para testar a interface.

A recuperação de senha é exercitada com o SDK real e uma API simulada: solicitação com resposta genérica, troca do código com verificador PKCE, alteração da senha, recusa da senha anterior, acesso com a senha nova e rejeição do link reutilizado após sair. A fixture confere o desafio PKCE e o uso único; esses cenários não comprovam a configuração do Supabase remoto ou a entrega de e-mail. O teste pessoal e a configuração de SMTP gratuito estão em [Publicar e homologar](../docs/PUBLICAR-E-HOMOLOGAR.md).

## Artefato de produção do GitHub Pages

Execute `VITE_BASE_PATH=/nexo-gestao-v2/ npm run build` com a configuração pública do projeto e depois `npm run test:pages`. O workflow de verificação usa uma chave fictícia; o de publicação testa o artefato compilado com as variáveis públicas do repositório antes de enviá-lo ao Pages.

Essa suíte serve `dist/` em um servidor estático local sem fallback de rotas e testa seis cenários: assets e logo na subpasta, manifesto/ícones/escopo do service worker, login e módulo carregado sob demanda, retorno de recuperação PKCE, recarregamento offline e ausência de erros/arquivos faltantes. O service worker fica habilitado, ao contrário da suíte de desenvolvimento. As respostas do Supabase continuam simuladas; nenhum e-mail ou registro real é criado. Resultados e screenshots ficam em `test-results/pages/`. Isso não comprova publicação nem integração com o backend remoto.
