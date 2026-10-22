# Plano de integração e publicação do NEXO V2

Repositório de destino: `devnathansantos/nexo-gestao-v2`  
Endereço do site: `https://devnathansantos.github.io/nexo-gestao-v2/`

## Ordem de trabalho

1. Revisar o frontend, os fluxos de autenticação, a camada de dados e o workflow.
2. Modelo confirmado: uma conta por empresa; a mesma conta funciona em vários dispositivos e empresas diferentes mantêm dados separados.
3. Inspecionar o projeto Supabase atual sem alterar dados.
4. Modelo confirmado: cadastro aberto pelo site; cada cadastro cria uma conta privada para uma empresa. Preparar e revisar o esquema e as políticas RLS para esse modelo.
5. Aplicar as alterações de banco somente após apresentar o plano e receber autorização.
6. Configurar no GitHub Actions a URL do projeto e a chave pública do Supabase.
7. Revisar o diff local e obter autorização antes de commit e push.
8. Acompanhar o workflow e validar a versão publicada com contas e dados de teste.

## Critério de liberação para uso real

- Workflow de testes, build e publicação aprovado.
- Login e recuperação de senha funcionando no endereço público.
- Leitura, criação, edição e exclusão confirmadas no banco.
- Persistência confirmada depois de recarregar a página.
- RLS validada com mais de uma conta de teste.
- Nenhuma credencial privilegiada incluída no frontend ou no repositório.

Até essas verificações serem concluídas, não cadastrar dados reais de clientes.
