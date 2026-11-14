# Recon — Adianta Odonto (clone)

## Escopo

- **App e plataforma:** web app (SPA), `https://adiantaodonto.com/app`. Sem app nativo
  (iOS/Android) — a tela de ajuda oferece "Usar como aplicativo" (instalar como PWA na
  tela inicial). Sem página de marketing pública separada: o domínio raiz redireciona
  direto para `/app`.
- **Fatia escolhida (núcleo pago):** o loop de gestão clínica de um consultório
  odontológico solo/pequeno: odontograma → plano de tratamento → orçamento (PDF/
  WhatsApp) → autorização → atendimento/lançamento financeiro → acompanhamento de
  retorno do paciente. CRM leve (pacientes, aniversariantes, "sumiu há X dias") e
  financeiro simples (caixa, recebido vs. gasto) vêm junto por serem o mesmo fluxo.
- **Para quem:** dentista autônomo ou pequena clínica no Brasil, que hoje decide entre
  planilha/papel e um sistema "completo" caro (Clinicorp, iClinic). Linguagem toda em
  PT-BR, pensada para quem nunca usou um sistema de gestão.

## Fontes usadas

| fonte | o que deu |
| --- | --- |
| `https://adiantaodonto.com` → redireciona para `/app` | não existe marketing site separado; é só o app |
| Conta própria do usuário (login já ativo no navegador, plano **Essential**, anual) | fonte principal: todas as telas, modais, fluxos e o modal de ajuda interno (FAQ completo) |
| Busca na web (Google) por "Adianta Odonto" | **zero resultados** — sem ReclameAqui, sem redes sociais indexadas, sem Capterra/G2, sem imprensa |
| ReclameAqui — Clinicorp, iClinic (concorrentes maiores) | usado como proxy de dores da categoria, já que o produto-alvo não tem reclamações públicas |

**Achado importante:** "Adianta Odonto" não tem nenhuma presença pública indexada (sem
site de vendas encontrado por busca, sem Instagram/TikTok indexado, sem ReclameAqui,
sem listagem em Capterra/G2). Isso é dado, não limitação da pesquisa — é coerente com
um micro-SaaS solo, vendido por boca a boca / WhatsApp / Instagram não indexado, com
"página de oferta" própria (mencionada no FAQ: "compre de novo na página de oferta
com o mesmo e-mail"). Para o clone, isso já é uma oportunidade de diferenciação: SEO,
app stores e prova social públicos que o original não tem.

## Modelo de negócio (inferido da tela "Sua conta")

- Não é assinatura recorrente automática. É **compra avulsa com validade** (ex.: plano
  "Essential", anual, R$ — valor não visível na conta —, 365 dias). Ao vencer, a conta
  **não apaga nada e continua logando**, só trava gravações novas até renovar.
- Renovação é manual: comprar de novo na página de oferta com o mesmo e-mail; o tempo
  novo se soma ao que faltava.
- Garantia de 7 dias (citada no FAQ, conteúdo da resposta não lido).
- Acesso multi-dispositivo (celular e computador), sessão por e-mail+senha, código de
  6 dígitos em algum fluxo de verificação/login.
- Suporte via WhatsApp (mais rápido), e-mail, Instagram — nada de chat in-app com
  humano nem telefone.
- **Diferencial vs. concorrência grande:** sem cobrança recorrente no cartão = sem o
  padrão de reclamação mais comum contra Clinicorp/iClinic no ReclameAqui (cobrança
  após cancelamento, bloqueio de prontuário por pendência pequena, perda de acesso
  após downgrade). Ver seção "Dores da categoria".

## Inventário de telas

| ID | Tela | Rota | Propósito | Componentes-chave | Estados vistos |
| --- | --- | --- | --- | --- | --- |
| S01 | Visão geral (dashboard) | `/app` | Resumo do dia: próximo compromisso, semana livre/ocupada, financeiro do mês, orçamentos pendentes, retornos | banner de onboarding "Continuar", card "Hoje" com mini-semana, card "Precisa de atenção", card financeiro do mês, 2 cards de acompanhamento (orçamentos aguardando, retornos) | vazio (conta nova/zerada) visto; não visto: com dados reais |
| S02 | Plano de tratamento | `/app/plano` | Montar/editar o plano clínico num odontograma e virar orçamento | seletor Adulto/Infantil, campos paciente/nascimento/telefone, odontograma SVG 32 dentes com 4 quadrantes e filtro por arcada, modal de condição do dente + busca de procedimento, lista de procedimentos agrupada por fase (Urgência/Adequação/Reabilitação/Estética/Manutenção), total com validade de 30 dias | vazio (0 procedimentos), modal do dente aberto |
| S03 | Orçamentos | `/app/orcamentos` | Acompanhar orçamentos apresentados/autorizados | abas Todos/Apresentados/Autorizados, busca por paciente, tabela paciente/total/situação | vazio |
| S04 | Atendimentos | `/app/atendimentos` | Lançar e listar o que já foi feito e cobrado | filtro mês/ano, 3 KPIs (recebido, saldo restante, em andamento), filtros de estado clínico/pagamento/período, modal "Lançar atendimento" | vazio, modal de lançamento aberto |
| S05 | Pacientes (lista) | `/app/pacientes` | CRM simples de pacientes | 6 contadores (paciente, em tratamento, orçamento aberto, já atendidos, não vieram, aniversariantes), busca, importar planilha/exportar, modal "Novo paciente" | lista com 1 paciente de teste |
| S06 | Paciente (detalhe) | `/app/pacientes/:id` | Ficha 360° do paciente | header com ações rápidas (WhatsApp, ligar, agendar, novo plano), KPIs financeiros do paciente, próximo horário, orçamentos, tratamentos, histórico (timeline), dados cadastrais editáveis, toggle "lembrar quando sumir" (30 dias) | paciente com 1 compromisso futuro |
| S07 | Agenda (dia/semana) | `/app/agenda` | Calendário de compromissos | mini-calendário mensal, lista de compromissos do dia/semana, legenda por tipo (Consulta/Retorno/Pessoal), slots sugeridos, modal "Novo compromisso" | dia vazio com slots livres |
| S08 | Agenda · Confirmar | `/app/agenda/confirmar` | Confirmar presença via WhatsApp antes da consulta | 3 KPIs (a confirmar, confirmadas, sem WhatsApp), lista com botão "Enviar mensagem" + "Confirmar", "Suas frases" (templates) | 1 pendente |
| S09 | Agenda · Retornos | `/app/retornos` | Recall de pacientes sumidos | filtro 30-364 dias / 1 ano+, contador "para chamar de volta", busca, "Suas frases" | vazio |
| S10 | Financeiro | `/app/financeiro` | Caixa do mês e histórico | filtro mês/ano, 3 KPIs (saldo, recebido, gasto), gráfico semanal/mensal/anual recebido×gasto, breakdown de gastos por categoria | vazio (R$ 0,00) |
| S11 | Financeiro · Gastos | `/app/financeiro` (aba Gastos) | Lançar despesas fixas/variáveis | não aberto a fundo (aba vista, modal não explorado) | não visto |
| S12 | Minha tabela | `/app/tabela` | Tabela de preços por especialidade/procedimento | 2 KPIs (procedimentos disponíveis, com valor padrão), abas Procedimentos×Especialidades, busca, 217 procedimentos em 12 especialidades (de 26 possíveis), botão "+Procedimento" | tabela sem nenhum valor preenchido (217 "sem valor") |
| S13 | Ajustes | `/app/ajustes` | Perfil profissional e personalização | nome/CRO, "como você trabalha" (autônomo/em clínica/tem clínica), contato, "Seu PDF" (logo/cor/fonte — não aberto a fundo), Aparência (sistema/claro/escuro), Especialidades (12/26 ativas), Dados e segurança (não expandido) | perfil vazio |
| S14 | Sua conta | `/app/ajustes/conta` | Plano, renovação, login | card do plano (nome, validade, dias restantes), "Acesso e renovação" expansível (datas, botão renovar), e-mail de acesso, trocar senha, sair da conta | plano Essential ativo |
| S15 | Modal de Ajuda ("Como podemos ajudar?") | overlay global | Central de ajuda embutida, não é página separada | atalhos WhatsApp/E-mail/Instagram, "Usar como aplicativo", "Ver exemplo guiado"/"Personalizar o sistema", acordeão de FAQ em 4 grupos (Dúvidas do dia a dia, Acesso e conta, + outros não totalmente rolados) | aberto, vários itens expandidos |
| S16 | Onboarding "Seu primeiro uso ficou pela metade" | banner no S01 + wizard próprio | Tour guiado de 1 min: especialidades, nome/CRO, como trabalha, foto/logo, depois exemplo prático em telas reais (plano, orçamento, atendimento) | visto só o banner; wizard não executado (evitar sujar dados reais da conta) |

Estados de erro/permissão/paywall não observados diretamente (conta com acesso ativo);
inferido do FAQ: pós-vencimento é **somente leitura**, sem apagar dados.

## Fluxos de usuário

```
F01  Virar um orçamento em dinheiro (fluxo central, o "core loop" pago)
     S01 dashboard -> S02 plano de tratamento (toca no dente, marca condição,
     escolhe procedimento, define valor) -> Salvar -> vira orçamento em S03
     -> apresenta ao paciente (PDF/WhatsApp) -> paciente aprova (ação de
     autorizar) -> vira "atendimento" em S04 -> lançar pagamento (parcial/total)
     -> reflete em S10 financeiro e em S06 (ficha do paciente)
     cliques no caminho feliz: ~6-7 (abrir plano, tocar dente, marcar
     condição, escolher procedimento, salvar, autorizar, lançar recebimento)
     borda: paciente aprova só parte do plano (FAQ cita isso -> precisa
     permitir autorizar por item, não só o orçamento inteiro)
     borda: "plano B" para o mesmo paciente (FAQ cita -> múltiplos orçamentos
     concorrentes por paciente, só um vira tratamento)

F02  Dia a dia de agenda com confirmação por WhatsApp
     S07 agenda -> cria compromisso (paciente, tipo, dia, horário, duração,
     situação) -> S08 confirmar (2-3 dias antes, manda frase pronta por
     WhatsApp) -> paciente confirma -> dia do atendimento, atende -> F01

F03  Recall de paciente sumido
     paciente sem visita há 30+ dias (ou 1 ano+) cai automaticamente em
     S09 Retornos -> dentista manda frase pronta -> paciente reagenda (F02)
     esse recall é opt-out por paciente (toggle em S06)

F04  Primeiro uso (onboarding)
     S16 wizard (~1 min: especialidades, nome/CRO, como trabalha, logo) ->
     exemplo guiado nas telas reais (monta 1 plano, 1 orçamento, 1
     atendimento de mentirinha) -> banner continua disponível até concluir
     borda: dá para pausar e retomar de onde parou a qualquer momento

F05  Importar base existente
     S05 Pacientes -> "Importar planilha" (não explorado o formato aceito)
     — ponto de atrito plausível para quem migra de concorrente/planilha
```

## Componentes

| Componente | Variantes/estados | Onde aparece |
| --- | --- | --- |
| Odontograma SVG | 32 dentes adulto / set infantil, por arcada (inteira/sup.dir/sup.esq/inf.esq/inf.dir), dente selecionado, cores por condição (hígido=verde, cariado/fraturado/mobilidade=vermelho, restaurado/endodontia/prótese/implante=azul, incluso/ausente=preto) | S02 |
| Modal de condição do dente | multi-seleção de 12 condições + busca de procedimento com destaque "Mais usados", tag "valor livre"/"informar valor", link "+Criar um procedimento meu" | S02 |
| Card KPI | título, valor grande, subtítulo cinza pequeno; cor de fundo varia por contexto (branco neutro, verde "precisa de atenção" positivo, laranja "aguardando", roxo "retomar cuidado") | S01, S03, S04, S05, S10 |
| Barra de abas superior (pill) | 2-3 abas, ativa com fundo cheio | S03 (Todos/Apresentados/Autorizados), S07-S09 (Agenda/Confirmar/Retornos), S10 (Financeiro/Gastos), S12 (Procedimentos e preços/Especialidades), S13-S14 (Ajustes/Sua conta) |
| Modal de criação (padrão) | título, subtítulo de ajuda em itálico/cinza, campos, rodapé "Cancelar" + CTA primário desabilitado até campo obrigatório preencher | Novo paciente, Novo compromisso, Lançar atendimento |
| Botão de horário "slot" | pill outline, vira preenchido ao selecionar | S07 |
| Linha de FAQ em acordeão | pergunta + chevron, expande empurrando o conteúdo abaixo (não é overlay) | S15 |
| Badge de status | "Já atendido" (verde), "A confirmar"/"Confirmado"/"Concluído"/"Cancelado"/"Faltou" | S05, S06, modal de compromisso |
| Toggle (switch) | usado em "Já recebi", "Marcar a próxima consulta", "Lembrar quando sumir" | vários modais, S06 |
| Sino de notificações, engrenagem de ajustes, ícone "?" de ajuda, toggle claro/escuro | sempre no header, fixos | todas as telas internas |

## Modelo de dados inferido

```
Paciente
  id, nome_completo, nascimento, sexo (F/M/Outro), cpf, celular_whatsapp, email,
  endereco {cep, rua, numero, complemento, bairro, cidade, uf},
  responsavel (opcional, para menores), como_chegou (enum: Outro/...),
  observacoes (texto livre), lembrar_quando_sumir (bool, janela 30 dias),
  status_calculado (em tratamento | orçamento aberto | já atendido | não veio)
  evidencia: modal "Novo paciente" (S05) + ficha (S06)
  confiança: alta

PlanoDeTratamento
  id, paciente_id, tipo (adulto|infantil), itens[] (ver ItemPlano),
  fase (Urgência=1, Adequação do meio bucal=2, Reabilitação=3, Estética=4,
  Manutenção=5), valor_total, validade_dias (30, fixo?), criado_em
  evidencia: S02
  confiança: alta (fases e validade são textos exatos da UI)

ItemPlano (dente + condição + procedimento)
  id, plano_id, dente_fdi (11-48, nomenclatura FDI/ISO visível no odontograma),
  condicao[] (hígido, em erupção, cariado, restauração insatisfatória,
  fraturado, com mobilidade, restaurado, com endodontia, com prótese,
  implante, incluso, ausente — multi-valor por dente),
  procedimento_id (nullable), valor (nullable = "a definir na hora")
  evidencia: modal do dente em S02
  confiança: alta

Orcamento
  id, paciente_id, plano_id, total, situacao (apresentado|autorizado|recusado?),
  data_apresentacao, data_autorizacao, pdf_gerado (bool)
  evidencia: S03, FAQ ("monte um plano e salve... autorize por aqui — é isso
  que vira atendimento")
  confiança: média (fluxo de "autorizar parcialmente" citado no FAQ mas não
  visto na UI)

Atendimento/Tratamento
  id, paciente_id, orcamento_id (nullable — pode ser avulso), procedimento,
  data, valor, status_pagamento (recebido|pendente), status_clinico
  (em andamento|concluído), marcar_proxima_consulta (bool -> cria Compromisso)
  evidencia: S04, modal "Lançar atendimento"
  confiança: alta

Compromisso
  id, paciente_id (nullable, pode ser "Pessoal"), tipo (consulta|retorno|pessoal),
  dia, horario (nullable = "a definir"), duracao_min (15|30|45|60|90|custom),
  situacao (a confirmar|confirmado|concluído|cancelado|faltou), observacoes
  evidencia: modal "Novo compromisso" (S07)
  confiança: alta

Procedimento (catálogo)
  id, especialidade_id, nome, valor_padrao (nullable), custom (bool, criado
  pelo próprio dentista)
  evidencia: S12 (217 procedimentos / 12 especialidades padrão, de 26 possíveis)
  confiança: alta

Especialidade
  id, nome, ativa (bool)
  evidencia: S12, S13 ("12 de 26 ativas")
  confiança: alta

LancamentoFinanceiro (Gasto)
  id, categoria, valor, data, recorrente (bool?)
  evidencia: S10/S11, card "Com o que você gastou no mês"
  confiança: baixa (aba Gastos não explorada a fundo)

PerfilProfissional
  nome_profissional, cro (opcional), modalidade (conta própria|em clínica|
  tenho clínica), telefone_endereco, logo/cor/fonte_pdf
  evidencia: S13
  confiança: alta

Conta/Assinatura
  email_acesso, plano (ex. "Essential"), tipo (anual), inicio, vencimento,
  dias_restantes, modo_pos_vencimento (read-only, sem apagar dados)
  evidencia: S14
  confiança: alta
```

## O que não pode ser clonado

- skip — **o nome "Adianta Odonto", sua marca e identidade visual** (logo do dente
  estilizado, paleta específica): rebrand completo no clone.
- skip — **qualquer PDF/arquivo gerado pelo sistema original**: a estrutura do
  documento pode inspirar, o template visual não deve ser copiado literalmente.
- skip — **texto exato das "frases prontas" de WhatsApp e do FAQ**: reescrever do zero
  com o mesmo propósito.
- skip — **a tabela de 217 procedimentos com a curadoria exata de "mais usados"**: a
  lista de nomenclatura odontológica (CBHPM/CDT) é conhecimento de domínio público —
  pode ser reconstruída de fontes abertas —, mas a curadoria específica de "mais
  usados por especialidade" do original não deve ser copiada célula a célula.
- skip — **a base de clientes/usuários do Adianta** (efeito de rede, boca a boca
  existente): isso não se clona, se conquista.

## Dores da categoria (ReclameAqui, concorrentes maiores — proxy, já que o
## produto-alvo não tem reclamações públicas)

Como "Adianta Odonto" não aparece no ReclameAqui nem em nenhum buscador, usei
Clinicorp e iClinic (líderes do segmento de software para clínicas no Brasil) como
proxy do que irrita o dentista/clínica nessa categoria de produto. Padrões recorrentes:

1. **Cobrança recorrente que continua após pedido de cancelamento** (iClinic: cobrança
   de renovação no cartão mesmo após solicitação formal de cancelamento).
2. **Bloqueio de prontuário/dados por pendência financeira pequena**, gerando
   dependência (lock-in) do profissional em relação ao próprio histórico clínico de
   pacientes.
3. **Perda de funcionalidade após downgrade de plano** (ex.: telemedicine some, mas o
   cliente só percebe quando já precisa usar).
4. **Suporte que só "repassa para outro setor"** sem resolver, e módulos pagos extras
   que não funcionam como anunciado.
5. **Atualizações que quebram sem aviso prévio** em máquinas mais antigas, sem janela
   de transição.

Implicação direta para o clone: (a) manter ou melhorar o modelo "compra com validade,
sem cartão recorrente" do próprio Adianta Odonto — é um diferencial real contra a dor
nº1; (b) nunca bloquear o acesso de leitura aos dados do paciente por inadimplência —
no máximo travar escrita, como o próprio Adianta já faz; (c) ter 1 canal de suporte que
resolve, não que só encaminha; (d) avisar com antecedência qualquer mudança que quebre
compatibilidade.

## Tamanho

- **Telas:** 16 mapeadas (algumas são abas da mesma rota).
- **Fluxos:** 5 principais.
- **Entidades:** 10 (Paciente, PlanoDeTratamento, ItemPlano, Orçamento, Atendimento,
  Compromisso, Procedimento, Especialidade, LancamentoFinanceiro, PerfilProfissional/
  Conta).
- **Partes difíceis:**
  1. **Odontograma interativo** (SVG por dente, multi-condição, por arcada) — é o
     coração visual do produto e o que mais demanda polimento de UX/acessibilidade.
  2. **Geração de PDF com marca própria** (logo/cor/fonte) para orçamento — formatação
     de documento + fluxo de assinatura/aprovação do paciente.
  3. **Integração com WhatsApp** (confirmação de consulta, recall, envio de orçamento)
     — depende de WhatsApp Business API/click-to-chat e textos dinâmicos por paciente.
- **Estimativa:** **M** (poucas semanas) para o vertical slice (F01 completo: plano →
  orçamento → atendimento → financeiro) com odontograma simplificado; **L** (um
  trimestre) para paridade completa incluindo agenda com confirmação por WhatsApp,
  recall automático, importação de planilha, personalização de PDF e catálogo
  completo de 200+ procedimentos por especialidade.

## Resumo

**Core loop:** odontograma → plano de tratamento → orçamento (PDF/WhatsApp) →
autorização → atendimento → financeiro, com CRM leve de pacientes e recall automático
por tempo de ausência. **16 telas** mapeadas, **5 fluxos** principais. **Partes mais
difíceis:** odontograma interativo, geração de PDF de marca própria, integração com
WhatsApp para confirmação/recall. **Fora de escopo:** marca, PDFs originais, textos
prontos exatos, curadoria exata da tabela de procedimentos, base de clientes do
Adianta. **Achado-chave:** o produto não tem presença pública nenhuma (sem
ReclameAqui, sem redes indexadas) — usamos concorrentes maiores (Clinicorp, iClinic)
como proxy de dores da categoria (cobrança recorrente após cancelamento, bloqueio de
prontuário, downgrade que quebra funcionalidade, suporte que não resolve), e o próprio
modelo de compra-com-validade do Adianta já evita a pior dessas (cobrança recorrente).
**Próximo passo:** `/replica-architect`.
