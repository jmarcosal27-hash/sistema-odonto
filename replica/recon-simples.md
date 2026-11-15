# Recon: Simples Dental (módulos de vendas, prótese, loja, HOF e varredura geral)

Data: 14/11/2026. Fonte: conta de teste do usuário (Plano Pro em teste), navegação somente leitura, e artigo público da central de ajuda. Nenhum dado foi salvo, aprovado ou enviado. Dados de paciente da conta de teste não foram copiados para este documento.

Nota: os screenshots de referência ficam fora do repositório (pasta temporária do Chrome); copiar para `replica/screens/` o que for usado na comparação.

## Menu principal

Inteligência, Pacientes, Agenda, Vendas, Financeiro, Simples Pay, Controle de prótese, Marketing, Estoque, Loja, Ajustes, Como funciona. Checklist de onboarding flutuante ("Comece aqui e ganhe um prêmio", 6 passos, barra de progresso).

## Foco 1: HOF no orçamento (faceograma)

Onde: Paciente > Orçamentos > Novo/Editar orçamento. O seletor de dente/região tem três abas: Permanentes, Decíduos, **HOF**. Disponível só no plano Pro deles.

Comportamento observado:
- Aba HOF mostra uma foto de rosto de frente (alternador feminino / masculino, botão de tela cheia) com **pontos azuis** (pontos de aplicação) e **regiões tracejadas** pré-desenhadas sobre a face e o pescoço.
- Dois modos: **Região** (clicar em uma região a adiciona ao campo "Selecionar região", por exemplo "Lábios") e **Desenhar** (barra lateral com ponto, seta, linha, borracha e seleção; ajuda "?").
- Fluxo de item: Plano (convênio/particular) + Tratamento + Valor + Dentista + Região(ões). O botão "Adicionar tratamento" só habilita com tratamento e valor.
- Lista do orçamento mostra o item com a região (ex.: "Lábios - Preenchimento labial", "Toxina botulínica (botox)", Têmpora, Malar, Mento, Mandíbula, Olheiras). Itens têm valor e dentista.
- Campo de **quantidade de produto utilizada** (segundo o artigo) por item.
- Regiões de face no menu da arcada: Maxila, Mandíbula, Face, Arcada superior, Arcada inferior, Arcadas.
- Impressão do orçamento tem chave "Odontograma/HOF" (mostrar ou ocultar), além de valor total, valor por tratamento, parcelas e dentista.
- Orçamento: desconto, parcelamento, entrada, meio de pagamento, observações (5000 caracteres), status (em aberto/aprovado), "emitir contrato ao aprovar".

Artigos relacionados na ajuda: anamnese de HOF, cadastro de mais procedimentos de HOF.

Decisão para o SmileOS: imagens do faceograma devem ser **geradas por IA, originais** (feminino e masculino, frente, fundo neutro, sem marca). Não usar as fotos nem a marcação de pontos do Simples. Desenhar as regiões e pontos próprios sobre um SVG sobreposto.

## Foco 2: Vendas

Rota: `/simples/vendas` (só desktop; no celular mostra aviso "Disponível somente para computadores").

- Kanban de **oportunidades** com etapas: Em aberto, Em andamento, Ganha, Perdida, mais "+ Criar nova etapa". Cada coluna mostra contagem e soma em R$. Menu da coluna: Alterar nome, Excluir.
- Seletor de **funil**: Funil de agendamento, Funil de venda, Funil personalizado, "Novo funil". Filtro por período, filtro avançado, busca, "Criar oportunidade".
- Oportunidades de orçamento são criadas automaticamente quando se cria um orçamento (comentário de sistema "Criou esta oportunidade"). Ao aprovar, vai para Ganha.
- Cartão: tipo (Orçamento), responsável, data, valor. Detalhe do cartão: comentários (255 caracteres), histórico, contato do paciente com botão "Conversar com paciente" (WhatsApp), e-mail, texto "plano de tratamento aguardando aprovação desde...", link para os orçamentos do paciente, rótulo, seletor de etapa.
- Metas de vendas (em Inteligência): objetivo do mês, quanto vender por dia útil, vendido hoje, gráfico diário.

## Foco 3: Controle de prótese

Rota: `/simples/protese`. Disponível no plano Plus ou acima.

- Kanban com colunas: **Pré-laboratório, Envio, Laboratório, Agenda, Realizado**. Contadores por coluna, com ícone vermelho de **atrasados** nas colunas Envio e Laboratório.
- "Criar serviço": Paciente (busca), Profissional, Descrição do serviço (todos obrigatórios).
- Filtros: Serviços atrasados, Serviços com retorno, Personalizado, Profissional, Rótulo, Laboratório. Busca por paciente, tratamento ou laboratório.
- O cartão provavelmente carrega laboratório, datas de envio e retorno, prazo e rótulo (não aberto por falta de dados na conta de teste). Marcado como inferência.

## Foco 4: Loja

Rotas `/simples/loja/produtos`, `clube-vantagens`, `historico-compras`.

É a **loja do próprio fornecedor** (upsell de planos e pacotes), não um e-commerce da clínica:
- Produtos: Simples IA (assinatura), Pacotes de comunicação (assinatura eletrônica, análise de crédito, nota fiscal de serviço, WhatsApp, SMS), Integrações (maquininha, Copiloto WhatsApp Web, conta digital, Google Agenda), Funcionalidades (ativar módulos), Planos Basic / Plus / Pro, mensal ou anual.
- Clube de vantagens (descontos de parceiros, só assinantes). Histórico de compras com filtros de status, mês e ano.

Dúvida de escopo para o usuário: no SmileOS, "Loja" deve ser (a) loja de módulos/planos do próprio SmileOS, ou (b) catálogo de produtos que a clínica vende ao paciente (clareadores, escovas, kits)? Ver `features-simples.csv`.

## Varredura do resto (o que pode incrementar o SmileOS)

- **Inteligência**: abas Indicadores, Relatórios, Secretária IA (novo), Ortodontia, Tarefas. Indicadores: débitos em atraso, orçamentos em aberto e reprovados, aniversariantes em 30 dias, análise de receitas (por profissionais, planos, tratamentos, especialidades, receitas sem vínculo), financeiro do mês, cartões de pacientes (cadastrados, atendidos nos últimos 6 meses, com débito, novos no mês, com tratamento em aberto sem consulta), metas de vendas.
- **Financeiro**: Fluxo de caixa (receitas, despesas, saldo; previsto x realizado), Fechamento de caixa, Transações, Nota fiscal, Comissões, Carteira digital. Linhas com ação "Receber".
- **Marketing**: Gerenciador de indicações (indicações totais, valor aprovado, indicados sem consulta), Comunicação, Site do dentista, Link de agendamento.
- **Estoque**: Em estoque, Histórico de retiradas, Nova entrada, exportar.
- **Paciente**: abas Sobre, Orçamentos, Tratamentos, Anamnese, Imagens, Documentos, Débitos. Sobre tem código do paciente com link compartilhável, consultas, mensagens WhatsApp enviadas (lembrete automático de confirmação), card do app "Meu Doutor".
- **Agenda**: semana com cabeçalho por dia, coluna por profissional, confirmação por WhatsApp.
- **Planos Pro exclusivos** (lista pública): Faceograma HOF, CRM de agendamentos com alerta de inativos e cancelamentos, gerenciador de indicações, modelos e personalização de contratos, assinatura eletrônica em contratos, integração WhatsApp Web.

## Candidatos ordenados para o SmileOS

1. HOF no orçamento (pedido).
2. Vendas: funil kanban ligado a orçamentos (pedido).
3. Controle de prótese (pedido).
4. Loja (pedido, escopo a definir).
5. Metas de vendas e lista "tratamento em aberto sem consulta" (reativação; já temos parte no dashboard).
6. Gerenciador de indicações.
7. Fechamento de caixa e comissões.
8. Estoque simples com entradas e retiradas.
9. Link público de agendamento e lembrete automático por WhatsApp (depende de backend e custo de envio).
10. Contratos com assinatura eletrônica (depende do aval jurídico, ver perguntas ao advogado no `build-log.md`).

## O que não dá para clonar

Conta digital e maquininha (parceiros, regulado), análise de crédito, nota fiscal (integração fiscal e certificado), Secretária IA e Simples IA (produto de IA do fornecedor), Clube de vantagens (contratos de parceria), app "Meu Doutor" (app nativo próprio).

## Tamanho

HOF: M (arte por IA, SVG de regiões e pontos, desenho livre, impressão). Vendas: M (kanban, funis, ligação com orçamento). Prótese: S a M (kanban e cadastro de serviço, laboratório). Loja: S se for loja de módulos; M se for catálogo com estoque e venda.
