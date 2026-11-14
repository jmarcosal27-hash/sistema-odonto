# Build log

App em `web/` (Next.js 15 + Tailwind v4 + tokens de `replica/design`). Camada de
dados **falsa** em `web/lib/store.ts` (localStorage, mesma forma das server
actions do `architecture.md`) — troca no `/replica-backend`.

| ID | data | status | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| shell | 2026-11-13 | done | ícones do PWA | Tailwind v4 não usa `tailwind.config.ts`; tokens mapeados via `@theme inline` em `globals.css` |
| S01 Início | 2026-11-13 | done | — | — |
| S02 Plano de tratamento | 2026-11-13 | done | "marcar por região" (vários dentes de uma vez) | **bug encontrado no teste:** modais perdiam o foco a cada tecla (efeito de foco reexecutava porque `onClose` mudava a cada render). Corrigido no `Modal`, vale para todos |
| S03 Orçamentos | 2026-11-13 | done | — | — |
| PDF do orçamento | 2026-11-13 | partial | logo, PDF no servidor, link público para WhatsApp | — |
| S04 Atendimentos | 2026-11-13 | done | — | — |
| S05 Pacientes | 2026-11-13 | done | importação XLSX | — |
| S06 Ficha do paciente | 2026-11-13 | done | — | — |
| S07 Agenda | 2026-11-13 | done | arrastar para remarcar | — |
| S08 Confirmar | 2026-11-13 | partial | envio automático (WhatsApp Cloud API) | — |
| S09 Reativar | 2026-11-13 | done | — | — |
| S10 Financeiro | 2026-11-13 | partial | visão semanal | — |
| S11 Gastos | 2026-11-13 | done | — | — |
| S12 Tabela de preços | 2026-11-13 | partial | catálogo menor que o original (~110 vs 217) | — |
| S13 Ajustes | 2026-11-13 | done | upload de logo | — |
| S14 Assinatura | 2026-11-13 | partial | compra/renovação real (Stripe) | — |
| S15 Ajuda | 2026-11-13 | done | contatos reais | — |
| S16 Onboarding | 2026-11-13 | partial | exemplo guiado nas telas reais | — |

Fluxo central testado no navegador: paciente → dente 16 → restauração R$ 250 →
gerar orçamento → aprovar → recebido → aparece no Financeiro. OK.

Pendências do "definition of done" ainda não feitas: screenshots em
`replica/clone-screens/` para o replica-diff, teste em 390px em todas as telas,
passada só de teclado em todos os fluxos.

Mudança de schema: `plan_items.tooth_fdi` passou a aceitar 11–85 (dentição
decídua usa 51–85).

## Onda A (Smileo) — 2026-11-13

Decisão do usuário: **o sistema vai atender clínicas** (multi-dentista). Isso
fica para o `/replica-backend`: dono dos dados passa de `account` para `clinic`
+ membros/papéis (ver `recon-smileo.md`, onda C). A onda A não depende disso.

| ID | status | notas |
| --- | --- | --- |
| S17 Início com linha do tempo + "Para resolver" | done | 6 pendências com atalho |
| S18 Indicadores | done | faturado, recebido, média/paciente, inadimplência, falta, conversão, consultas, novos; retenção |
| S19 Agenda em grade 15 min | done | semana/dia, ocultar fim de semana, linha do agora, sem horário no topo da coluna |
| S23 Orçamento com desconto/qtd/arcada/formas | done | também no documento impresso |
| Parcelas | done | definidas ao aprovar; entrada paga; receber/desfazer; vencidas destacadas |
| S24 Retornos em funil | done | substitui o "Reativar" (30 dias) por prazo por procedimento (padrão 6 meses) |
| S26 Tratamentos parados | done | — |
| S27 Lista de espera | done | cancelamento mostra o horário vago e avisa por toast |
| S30 Despesas pago × a pagar | done | — |
| Arquivar paciente | done | — |

Testado no navegador: aprovação de R$ 3.250 com R$ 250 de desconto em 3x com
entrada → R$ 1.000 recebido, R$ 4.933,34 a receber; cancelar consulta → aviso de
lista de espera e horário vago listado. Sem erros no console.

Dados antigos no navegador são migrados (versão 2) sem perder nada.
Pendente: verificação em 390px das telas novas, prints para replica-diff.
