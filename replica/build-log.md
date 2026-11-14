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

## Onda B (parcial) — 2026-11-14

Itens 9 e 10 do prontuário, sem storage. Imagens/radiografias (11) e documentos
(12) ficam para quando houver bucket privado. Migration nova:
`web/supabase/migrations/20261114000001_prontuario_evolucao_anamnese.sql`
(a migration anterior não foi alterada). Camada falsa em versão 3 (migração
completa os campos novos sem perder dados) e equivalente em `lib/remote.ts`.

| ID | status | notas | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| 10 Evolução clínica (S22a) | done | nota por consulta na ficha do paciente: criar, editar, excluir; ligada a um atendimento ou só a uma data; estados vazio/preenchido/erro no modal; só leitura quando o acesso venceu | assinatura/travamento da nota após prazo; anexos (precisam de storage) | RLS: a nota precisa respeitar o modo "consultório dividido". Resolvido com `exists` sobre `patients`, cuja RLS vale dentro da política; também impede nota apontando para paciente de outra clínica |
| 9 Anamnese (S22c) | partial | modelos editáveis por clínica (perguntas sim/não ou texto, "sim vira alerta"), modelo padrão próprio com 13 perguntas, preenchimento na ficha, histórico de fichas, alertas da última ficha em destaque | **envio por link para o paciente preencher** (precisa de token público e rota sem login, com expiração e limite de uso); reordenar perguntas; assinatura | A ficha guarda cópia do texto das perguntas, para editar ou apagar o modelo não alterar respostas antigas |

Não testado no navegador nem contra o Supabase real (a migration e as políticas
novas só foram escritas; rodar `node scripts/rls-test.mjs` após aplicar).
Pendente também: teste em 390px e passada só de teclado nas telas novas.

## Correções da revisão de segurança — 2026-11-14

Migration `20261114000002_correcoes_seguranca.sql`, ajustes em `lib/remote.ts`, `lib/finance.ts`,
`lib/store.ts`, callback de auth, webhook do Stripe, exclusão de conta e `authorize-dialog`.
Detalhes e pendências em `backend.md` (seção "Revisão 2026-11-14"). Lint, tsc e `node --check`
limpos; **migration e `rls-test.mjs` ainda não rodados contra um Supabase**.

## Identidade visual SmileOS — 2026-11-14

Fonte: design system em `D:\SISTEMA DENTISTA\design-system` (tokens, logos, regras de marca). Os tokens antigos de `replica/design/` foram substituídos (arquivos mantidos só com uma nota de obsolescência).

| item | status | pendências | o mais difícil |
| --- | --- | --- | --- |
| Logos em `web/public/brand/` e nome `SmileOS` em `lib/brand.ts` | done | — | O nome só aparecia via `APP_NAME`; não havia "Consultório" solto nas telas |
| Tokens claro/escuro em `globals.css` (cores, espaço, raio, sombra, tipografia) | done | Escala `space-*` fica só como variável CSS (Tailwind usa a própria escala) | Migrar ~700 usos de classes antigas (`bg-surface`, `text-muted`, `bg-accent`...) para as novas por substituição em lote, mantendo o seletor de tema `data-theme` |
| Fonte Plus Jakarta Sans 400–800 (`next/font/google`) | done | — | — |
| Componentes (`ui.tsx`, `shell.tsx`): botões 44px, foco 3px, campos com borda forte, cartões, etiquetas | done | Vários botões/links feitos à mão nas telas ainda têm 32–36px de altura (alvo de toque < 44px) | Manter a API de props; `Button` ganhou `pill` |
| Logotipo no shell e em `/entrar` (claro/escuro por tema), ícone no cabeçalho mobile | done | Conferir visualmente | Alternar logo claro/escuro respeitando `data-theme` e `prefers-color-scheme` sem JavaScript (classes em `globals.css`) |
| Ícone do app, favicon e manifest (SVG + PNG 192/512 via sharp) | done | Ícone "maskable" não gerado | `favicon.ico` antigo removido; não há `.ico` novo |
| Ícones | done | — | O app já usava Lucide (traço 2px por padrão); nada a trocar |
| Contraste (leitura + cálculo WCAG dos pares principais, claro e escuro) | done | — | Todos os pares passam; `brand-violet` sobre `brand-ink` (3,0:1) não é usado |
| Verificação | lint e `tsc` limpos; `build` ok | Conferência visual das telas **não testada** (sem servidor) | A primeira execução do build falhou ao baixar a fonte do Google (rede); a seguinte passou |
