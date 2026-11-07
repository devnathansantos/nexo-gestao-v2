# Performance do NEXO

As telas de catálogo, orçamentos, empresa, formulário de cliente e o gerador de exportações são carregados sob demanda. O menu continua disponível durante o carregamento, e falhas ao abrir um módulo oferecem uma ação explícita para recarregar o site.

Clientes, catálogo e orçamentos exibem até 30 registros por página. Busca e filtros continuam abrangendo todos os registros carregados da empresa; mudar a busca retorna à primeira página. A exportação usa o snapshot completo do servidor, independentemente da página visível. O catálogo mantém representações desktop e mobile limitadas a esses mesmos 30 registros.

Consultas substituídas por uma nova atualização, troca de empresa ou desmontagem são canceladas com `AbortController`. As verificações de empresa e versão da consulta continuam ativas. Operações de gravação não são canceladas dessa forma. Formatadores de moeda e datas são reutilizados, evitando criar instâncias de `Intl` para cada célula da tabela.

## Medição do build

Comparação local antes/depois desta alteração, com o mesmo conjunto de funcionalidades e dependências; tamanhos em kB decimais, antes da compressão:

| Recurso                           |     Antes |   Depois |
| --------------------------------- | --------: | -------: |
| JavaScript principal da aplicação | 127,03 kB | 81,71 kB |
| CSS necessário inicialmente       |  72,48 kB | 41,16 kB |

Esses números não incluem todas as dependências no JavaScript principal. O grafo inicial completo inclui React, Supabase e ícones: aproximadamente 152,2 KiB com gzip após a mudança. Não são medições de tempo de carregamento nem resultados de Core Web Vitals.

O service worker continua baixando os módulos estáticos em segundo plano para preparar a PWA. Portanto, a separação reduz o código exigido inicialmente e sua avaliação antecipada, mas não promete diminuir o download total de instalação. Dados da empresa e respostas da API continuam fora do cache da PWA.

## Verificação contínua

```bash
npm run build
npm run check:performance
npm run test:browser
```

`check:performance` examina o manifesto real do Vite: falha se os módulos deixarem de ser carregados sob demanda, se saírem do cache estático da PWA ou se o grafo inicial ultrapassar 160 KiB gzip, a entrada da aplicação ultrapassar 100 KiB ou o CSS inicial ultrapassar 50 KiB. O GitHub Actions executa essa verificação. O relatório fica em `test-results/performance/bundle.json`.

A suíte de navegador inclui mais de 600 registros em cada lista para verificar paginação, pesquisa fora da página atual, exportação completa e layout mobile. Usa respostas Supabase simuladas; permissões reais de PostgreSQL são verificadas separadamente por `npm run test:db`.

## Próxima escala

A paginação desta etapa limita a quantidade de elementos renderizados, mas os hooks ainda leem todas as páginas da empresa (500 registros por consulta), incluindo itens dos orçamentos. Para volumes muito maiores, a próxima evolução é paginação e busca no servidor, resumo agregado no banco e leitura dos detalhes do orçamento apenas ao abri-lo. Isso exige atualizar os contratos de dados e testar contadores, filtros e exportação juntos; não está implementado nesta etapa.

## Atualização 0.3

Financeiro e retorno de clientes têm módulos próprios sob demanda, busca com pausa de 250 ms, agregação e paginação no servidor (30 registros por resposta). As listas antigas continuam com o limite de leitura descrito acima. Com as novas telas, o grafo inicial medido ficou em aproximadamente 152,9 KiB gzip, mantendo o limite de 160 KiB. A logo e os ícones originais aumentam os assets de imagem da instalação da PWA; não representam redução do download total. Latência do Supabase real permanece sem medição até a integração.
