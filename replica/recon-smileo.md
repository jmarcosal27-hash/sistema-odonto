# Recon — Smileo (segundo sistema de referência)

Fonte: `https://app.smileo.com.br` na sessão do Chrome do usuário (conta da
clínica "Odontomais", proprietária Jaciara Oliveira, em **teste grátis de 14
dias**, com um paciente de exemplo). Só leitura: nenhum formulário salvo.
Busca pública: sem página no ReclameAqui; aparece listado em Capterra/GetApp
sem avaliações relevantes.

> Atenção: a conta logada não está no e-mail do usuário (o e-mail dele aparece
> como **convite pendente** de dentista nessa clínica). Assumi, pelo pedido
> ("já estou conectado no meu chrome"), que o usuário tem autorização para usar
> essa conta. Também vale ler os termos de uso do Smileo — alguns SaaS proíbem
> usar a conta para montar produto concorrente.

## O que o Smileo é

Gestão de clínica odontológica **multi-dentista**, com assinatura recorrente
(Consultório R$ 57,90/mês · Clínica R$ 115,90 · Rede R$ 165,90; anual com 2
meses grátis; cartão ou Pix). Onde o Adianta é "consultório solo, simples", o
Smileo é "clínica com equipe, permissões, convênios, comissões e prontuário
completo".

## Telas (IDs continuam a numeração do recon do Adianta)

| ID | Tela | Rota | O que tem que o nosso não tem |
| --- | --- | --- | --- |
| S17 | Início | `/dashboard` | saudação; **linha do tempo do dia** (7h–20h, já passou / não confirmou / confirmada / agora); "Para resolver": parcelas vencidas, anamneses pendentes, lista de espera, retornos; **ativar notificações** do navegador; "Primeiros passos 1 de 6" |
| S18 | Visão geral (indicadores) | `/overview` | faturado × recebido, **média por paciente que pagou, inadimplência, taxa de falta, conversão de orçamentos**, consultas realizadas, novos pacientes; filtro mês/30 dias/ano; **produção por dentista**; retenção (retornos a agendar, sem consulta há 6+ meses) |
| S19 | Agenda | `/agenda` | **grade semanal em blocos de 15 min (07h–23h)**, 3 visões (semana/lista/mês), ocultar fim de semana, consulta com dentista responsável |
| S20 | Confirmações | `/confirmations` | por dia (amanhã primeiro), WhatsApp + **registro da resposta**; confirmação **por link** (plano) |
| S21 | Pacientes | `/patients` | **arquivados**, "pedir migração" (importação feita pela equipe deles), aviso de dado faltando ("falta nascimento") |
| S22 | Ficha do paciente | `/patients/:id` | abas **Sobre · Histórico · Orçamentos · Tratamentos · Anamnese · Imagens · Documentos · Financeiro**; **convênios** do paciente; copiar CPF/telefone; paciente de exemplo apagável |
| S22a | Histórico | aba | procedimentos realizados + **evolução clínica por consulta** ("+ adicionar evolução clínica") |
| S22b | Tratamentos | aba | odontograma com modos **Diagnóstico / Tratamentos**, status por dente (aberto / finalizado / sem tratamento) |
| S22c | Anamnese | aba | registrar a partir de **modelo** (padrão com 31 perguntas) ou **enviar por link** para o paciente preencher |
| S22d | Imagens | aba | upload de radiografias e fotos; **enviar foto pelo celular** |
| S22e | Documentos | aba | **termo LGPD**, termos/contratos assinados, **assinatura do atendimento**, **receitas**, **atestados**, outros arquivos |
| S22f | Financeiro | aba | débitos/parcelas do paciente |
| S23 | Novo orçamento | `/financial/budgets/new` | **dentista responsável**, título, validade por data, **quantidade**, dente **ou região/arcada**, **desconto (R$ ou %)**, **formas de pagamento aceitas** (Pix, cartão, boleto…), observações; orçamento **por link** |
| S24 | Retornos | `/recall` | funil **Pendentes → Contatados → Agendados → Dispensados**; prazo de retorno **por procedimento** (padrão 6 meses) |
| S25 | Aniversários | `/birthdays` | página própria + mensagem de parabéns por WhatsApp |
| S26 | Tratamentos parados | `/stalled-treatments` | aprovado há 7+ dias sem consulta marcada |
| S27 | Lista de espera | `/waitlist` | Aguardando → Contatados → Encaixados → Removidos; sugere encaixe quando **um horário vaga por cancelamento** |
| S28 | Financeiro · Resumo | `/financial` | resultado do mês, aprovados, aguardando, média por pagamento, comissões, **a receber (cobranças/parcelas)**, pagamentos do mês |
| S29 | Orçamentos | `/financial/budgets` | estados **Rascunho · Aguardando · Validade vencida · Aprovados · Recusados/cancelados** com soma; ordenar por valor |
| S30 | Despesas | `/financial/expenses` | **pago × a pagar**, filtro por categoria |
| S31 | Comissões | `/financial/commissions` | extrato mensal por dentista, fechamento, exportar |
| S32 | Convênios | `/financial/convenios` | faturado / **repassado / glosado / aguardando**, conciliação (a conciliar, atrasados) |
| S33 | Configurações | `/settings/*` | dados da clínica (logo, **fuso horário**), comunicação (**lembretes automáticos pelo WhatsApp oficial**, modelos por situação), **equipe e convites**, **permissões por papel** (proprietário/dentista/recepcionista/financeiro), **modo de atendimento** (compartilhado × consultório dividido), modelos de anamnese, procedimentos, convênios, **cadeiras**, regras de comissão, plano/faturas, termos e consentimentos, **LGPD** (consentimento, retenção, **audit log**) |

## Entidades novas (além das do Adianta)

```
Clinic            id, name, logo, timezone, practice_mode (shared|split)
Member            clinic_id, user_id, role (owner|dentist|receptionist|finance), status, invite
Chair             clinic_id, name
Insurance         clinic_id, name; PatientInsurance (patient_id, insurance_id, card number)
AnamnesisTemplate clinic_id, name, questions[]; Anamnesis (patient_id, template_id, answers, filled_by, link_token)
ClinicalNote      appointment_id, patient_id, dentist_id, text (evolução)
PatientFile       patient_id, kind (image|xray|document), url
Document          patient_id, kind (lgpd_consent|term|visit_signature|prescription|certificate), body, signed_at, signature
Installment       budget_id, patient_id, due_date, amount, paid_at, method   (cobranças/parcelas)
Payment           installment_id?, amount, method, received_at, dentist_id
CommissionRule    clinic_id, dentist_id?, procedure_id?, percent
InsuranceBilling  treatment_id, insurance_id, status (awaiting|paid|denied), amount
RecallTask        patient_id, due_at, status (pending|contacted|scheduled|dismissed)
WaitlistEntry     patient_id, preferences, status (waiting|contacted|placed|removed)
AuditLog          clinic_id, user_id, action, entity, at
```
Mudança estrutural: **o dono dos dados passa de `account` para `clinic`**
(multi-usuário). Isso afeta toda a RLS do `schema.sql`.

## Encaixe no nosso sistema

Ideia: **manter o que o Adianta faz melhor** (fluxo plano → orçamento por
fases, simplicidade, compra sem cobrança recorrente) e **trazer do Smileo** o
que um consultório sente falta logo no primeiro mês. Proposta em três ondas:

**Onda A — ganho alto, sem mudar a arquitetura (cabe ainda na camada falsa)**
1. Agenda em grade semanal de 15 min (S19) com ocultar fim de semana.
2. Indicadores (S18): taxa de falta, conversão de orçamentos, inadimplência, média por paciente, novos pacientes.
3. Retornos como funil (S24) + prazo de retorno por procedimento.
4. Lista de espera com encaixe ao cancelar (S27).
5. Tratamentos parados (S26).
6. Orçamento com desconto, quantidade, região/arcada, formas de pagamento e **parcelas** (S23) + "A receber" com vencimento (S28).
7. Despesas pago × a pagar (S30).
8. Linha do tempo do dia no Início (S17).

**Onda B — prontuário (precisa de storage, entra junto com o replica-backend)**
9. Anamnese com modelos e envio por link (S22c).
10. Evolução clínica por consulta (S22a).
11. Imagens/radiografias com envio pelo celular (S22d).
12. Documentos: termo LGPD, receitas, atestados, assinatura do atendimento (S22e).

**Onda C — clínica com equipe (muda o modelo de dados)**
13. Clínica + equipe + convites + papéis/permissões + modo compartilhado/dividido (S33).
14. Dentista responsável em agenda/orçamento, produção por dentista, comissões (S31).
15. Cadeiras na agenda.
16. Convênios com repasse/glosa (S32).
17. Lembretes automáticos pela WhatsApp Cloud API e confirmação por link.
18. Audit log e retenção (LGPD).

Tamanho: Onda A ≈ **M** (1–2 semanas); Onda B ≈ **M** com backend; Onda C ≈ **L**
(muda schema/RLS para multi-clínica — melhor decidir **antes** do
`/replica-backend` para não migrar duas vezes).

## Não clonar

Nome/marca Smileo, textos das telas, modelo de anamnese "padrão" de 31
perguntas (escrever o nosso), tabela de preços deles.
