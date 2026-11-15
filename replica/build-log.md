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

## Onda B1 (documentos simples) — 2026-11-14

Receita e atestado sem storage, sem assinatura digital e sem receita controlada digital. Migration nova:
`web/supabase/migrations/20261114000003_documentos.sql` (as anteriores não foram editadas; só a RPC
`update_my_profile` foi substituída por uma versão com mais campos). Camada falsa em versão 4 (migração só
acrescenta listas vazias) e equivalente em `lib/remote.ts`. Clean-room: textos, rótulos, modelos e sugestões
de unidade são próprios; a lista de medicamentos começa vazia.

| ID | status | notas | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| Perfil profissional (CRO, UF, CPF, nascimento) | done | em Ajustes; RPC `update_my_profile` estendida sem reabrir a escalada de privilégio (só nome, CRO, UF, CPF, nascimento e tema); CPF guardado só com dígitos | CPF e nascimento são legíveis por outros membros da clínica porque `members_read` é ampla (ver riscos em `backend.md`) | trocar a assinatura da RPC exige remover a antiga (senão a chamada por nome fica ambígua) |
| Medicamentos por clínica | done | `medications`, único por clínica + nome sem diferenciar maiúsculas; nome novo usado na receita é cadastrado na hora e volta no autocomplete (datalist) | editar/excluir medicamento pela tela | — |
| Receita simples | done | `prescriptions` + `prescription_items`; criar, ver, editar, excluir; "controlado" só sinaliza e avisa que precisa de talonário oficial; receita e itens gravados numa transação (`save_prescription`) | receita de controle especial, assinatura digital | itens herdam a regra da receita via `exists` (a RLS de `prescriptions` vale dentro dele) |
| Atestado | done | por dias ou por horas, CID opcional só com consentimento (CHECK no banco), texto livre | horário de início/término; busca de CID | — |
| Modelos de receita | done | `prescription_templates` (itens em jsonb), usar ao criar receita, salvar a partir da receita | editar/excluir modelo pela tela | — |
| Ficha do paciente: Documentos | done | lista mista por data, estados vazio/preenchido/erro (no modal); só leitura quando o acesso venceu | — | — |
| Impressão A4 | done | `/receitas/[id]/imprimir` e `/atestados/[id]/imprimir`, sem o shell; cabeçalho com nome da clínica, profissional com CRO/UF, linha de assinatura à mão e aviso de minuta; avisa na tela se faltar nome, CRO ou UF | logo da clínica (não há upload), PDF no servidor | nome/CRO/UF ficam copiados no documento na emissão (não mudam se o perfil mudar) |
| Banco, RLS e `rls-test.mjs` | partial | RLS no padrão existente, `can_see_patient` nas tabelas com paciente, gatilhos de mesma clínica; casos novos no `rls-test.mjs` | **migration não aplicada e teste não executado** | — |

Verificação: `npm run lint`, `npx tsc --noEmit` e `node --check scripts/rls-test.mjs` limpos.
Não testado no navegador (sem servidor) nem contra um Supabase. Pendentes: 390px e passada só de teclado.

## Onda B1 — itens que ficaram de fora — 2026-11-14

Migration nova `web/supabase/migrations/20261114000004_documentos_extras.sql` (não aplicada). Camada falsa em versão 5.

| ID | status | notas | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| Logo na impressão A4 | done | `clinics.logo_data` (data URL png/jpeg/webp até 300 KB, CHECK no banco); upload em Ajustes reduz a imagem para 320 px no navegador; só o dono grava (política `clinics_update`); aparece no cabeçalho de receita, atestado e documento livre | `logo_path` antigo segue sem uso | — |
| Editar e excluir medicamentos e modelos | done | modal "Medicamentos e modelos" na ficha; renomear modelo; excluir medicamento mantém os itens das receitas já emitidas (nome é copiado no item); RLS inalterada: dono ou autor excluem/renomeiam, qualquer dono/dentista edita medicamento | editar os itens de um modelo (hoje só renomear ou recriar) | update/delete negado pela RLS volta sem erro e sem linhas; a camada nuvem trata "0 linhas" como "sem permissão" |
| Busca de CID | done | lista curta e original (25 códigos odontológicos comuns, descrições próprias) como sugestão no campo; consentimento obrigatório continua no formulário e no CHECK | tabela completa da CID | — |
| Documentos personalizados | done | `custom_documents` (título 1–120, texto até 10000), mesma regra de autoria dos atestados, impressão A4 em `/documentos/[id]/imprimir` com aviso de minuta | modelos de documento reutilizáveis | — |
| Arquivos do paciente | done | `patient_files` + bucket privado `patient-files` (PNG/JPG/WebP/PDF até 10 MB), caminho `<clínica>/<paciente>/<uuid>.<ext>`; leem e enviam dono, dentista e recepção (financeiro não); apagar: dono ou quem enviou; abre por link assinado de 60 s; na demonstração fica em localStorage (limite 1 MB) | apagar objetos do storage quando o paciente é excluído; antivírus; miniaturas | política de storage precisa da linha de `patient_files` para saber quem enviou: o app apaga o objeto antes da linha |
| Teste 390 px | not tested | layout usa flex-wrap, `break-all` nos nomes e modais em tela cheia no celular, mas **não foi aberto no navegador** (o dev server foi encerrado por falta de memória e não deveria ser religado) | passada visual em 390 px e só de teclado | — |
| Assinatura digital ICP-Brasil | skip | regulada | **decisão para o advogado** | — |
| Receita de controle especial / talonário | skip | regulada; "controlado" só sinaliza | **decisão para o advogado** | — |
| Banco, RLS e `rls-test.mjs` | partial | casos novos para logo, documentos livres, arquivos (tabela e storage, incluindo B, financeiro, modo dividido e acesso vencido) | **migrations 3 e 4 não aplicadas; teste não executado** | — |

Também corrigido: o campo CPF de Ajustes usava `/D/g` em vez de `/\D/g` e aceitava letras.
Riscos: logo e arquivos exigem decisão de retenção LGPD; excluir paciente apaga as linhas de `patient_files`, mas os objetos ficam no storage (limpar manualmente por enquanto).

## Anamnese: rascunho, conclusão e revisões — 2026-11-15

Origem: item 1 de `INTEGRACAO-SMILEOS.md`. Migration nova `web/supabase/migrations/20261115000001_anamnese_revisoes.sql` (não aplicada). Camada falsa em versão 6 (fichas antigas viram concluídas).

| ID | status | notas | o que falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| Resposta explícita | done | sim, não, não sei, não se aplica, conversa reservada em `answer`; `yes` (booleano) segue lido para fichas antigas e gravado só para sim/não; sem resposta = campo ausente, nunca "não" | — | — |
| Rascunho | done | ficha com `status = draft` salva no banco/store; "Continuar" reabre com as respostas e a cópia das perguntas | — | — |
| Conclusão | done | só dono e dentista; o gatilho grava `completed_at`/`completed_by` no servidor (valores enviados são ignorados) e recusa pergunta de sim/não sem resposta | — | — |
| Trava no banco | done | gatilho `anamnesis_guard`: concluída não aceita update nem delete diretos; exceções: cascata (apagar paciente/clínica/modelo/usuário) e service role | decisão de retenção LGPD (apagar paciente apaga fichas concluídas) | cascata e `ON DELETE SET NULL` disparam o gatilho: tratado com `pg_trigger_depth() > 1` |
| Revisão | done | nova linha com `revision_of` apontando a concluída (mesmo paciente); no máximo uma revisão por ficha (índice único); a original fica preservada e marcada "Substituída"; alertas vêm da ficha vigente | — | — |
| Papéis | done | dono/dentista: leem, preenchem, concluem, revisam; recepção: lê e edita/exclui rascunhos, não conclui; financeiro: sem acesso (antes lia). Policies de `anamnesis_records` recriadas na migration nova | confirmar com a clínica se recepção deve ler | — |
| Modelos | done | alterar ou excluir modelo não muda fichas (cópia das perguntas na ficha); revisão e rascunho usam a cópia da ficha, não o modelo atual | — | — |
| Banco, RLS e `rls-test.mjs` | partial | casos novos: rascunho, conclusão, trava de update/delete, resposta inválida, revisão (única, só de concluída, imutável), recepção, financeiro, B, split, dentista conclui, acesso vencido | **migration não aplicada e teste não executado** | — |
| Linha do tempo (eventos de anamnese) | skip | não pedido; auditoria de segurança não é a linha do tempo do produto | — | — |

Verificação: `npm run lint`, `npx tsc --noEmit` e `node --check scripts/rls-test.mjs` limpos. Não testado no navegador nem contra o Supabase.
Perguntas para o advogado: (1) guardar apenas `completed_by` e data basta como "conferência", ou é preciso registro de assinatura/consentimento do paciente? (2) retenção: ficha concluída some junto com o paciente (cascata); há prazo mínimo de guarda do prontuário a respeitar? (3) recepção pode ler e preencher anamnese (dado de saúde) ou só dentista e dono? (4) "Conversa reservada" é aceitável como resposta registrada?

## Onda C — 2026-11-15 (registro feito depois, a partir do git)

Entrou pelos commits `80fc53c`…`491411e` (PR #5, merge `3cbfcdf`), sem registro neste log na época. Migrations novas,
**nenhuma aplicada**: `20261116000001_hof` a `20261116000007_convenios`.

| área | status | o que tem | o que falta |
| --- | --- | --- | --- |
| HOF (`000001`, `000005`) | done | faceograma por rosto, regiões, anotações e produto no plano/orçamento; platisma separado | conferir interação e impressão no navegador |
| Vendas (`000002`) | done | funil kanban, oportunidade criada/movida por gatilho a partir do orçamento, metas, comentários; RLS com `can_see_patient` | testar integração com orçamento |
| Prótese (`000003`) | done | laboratórios, serviços em kanban, histórico; RLS com `can_see_patient` | — |
| Agenda por profissional (`000004`) | done | profissionais, bloqueio de horário, status ampliado, vários procedimentos por agendamento; `scripts/agenda-test.mjs` | experiência mobile |
| Caixa e comissão (`000006`) | done (corrigido abaixo) | livro-caixa lido de parcelas/atendimentos/despesas + lançamentos manuais, abertura/fechamento do dia, estorno permanente, regras de % por dentista e procedimento | — |
| Convênios (`000007`) | done (corrigido abaixo) | convênios, tabela de repasse, lotes de faturamento com itens, glosa, CSV, paciente conveniado | — |

## Correções financeiras da revisão (Codex) — 2026-11-15

Branch `fix/financeiro-onda-c`. Migration nova `web/supabase/migrations/20261117000001_correcoes_financeiro.sql` (não aplicada;
as anteriores não foram editadas).

| achado | status | correção | o que falta |
| --- | --- | --- | --- |
| 1. Pagamento de comissão em 3 gravações soltas | done | RPC `pay_commission`: pagamento, itens e saída do caixa numa transação; recebimento já pago faz tudo voltar | o banco ainda confia no valor de comissão calculado no navegador (só valida formato e soma) |
| 2. Repasse de convênio podia entrar 2× no caixa | done | RPC `cash_billing_batch` trava o lote (`for update`), calcula no servidor o que falta lançar e grava a entrada com `cash_movements.billing_batch_id`; `cashed_cents` só muda pela função ou por estorno (gatilho devolve o valor ao "a lançar"); entrada ligada a lote não pode ser criada direto; botão desabilita durante o envio | — |
| 3. Itens de faturamento ignoravam o modo dividido | done | policies de `billing_items` recriadas com `can_see_patient` (como Vendas e Prótese); status do item e do lote passam a ser calculados por gatilho no banco, enxergando todos os itens | lote (cabeçalho) segue visível a todos os membros; só tem valores agregados de caixa |
| 4. Estorno não chegava ao Financeiro/Indicadores | done | `paidInstallments`/`receivedTreatments` em `lib/finance.ts` excluem o que foi estornado no Caixa; usados em `received()`, indicadores, ficha do paciente e Atendimentos | papéis que não leem `cash_receipts` (dentista, recepção) não enxergam o estorno; decidir se a parcela estornada volta a ser "a receber" |
| 5. Comissão usava só o 1º procedimento | done | parcela dividida entre os procedimentos do orçamento na proporção do preço (`splitProportional`, sem perder centavo); cada parte com a regra do seu procedimento; tela do Caixa mostra as partes quando as regras diferem | dentista ainda vem da agenda (ou do vínculo manual no recebimento), sem ligação direta com quem executou cada procedimento |
| 6. `optional()` engolia qualquer erro | done | só "tabela não existe" (`PGRST205`/`42P01`) vira lista vazia; rede, permissão e coluna sobem como erro | — |

Verificação: `npm run lint` e `npx tsc --noEmit` limpos; `scripts/financeiro-test.mjs` (novo: divisão proporcional,
comissão por procedimento, estorno nos totais, valor lançado do lote), `agenda-test.mjs` e `safe-next-test.mjs` passam;
`node --check scripts/rls-test.mjs` ok com casos novos (RPC de comissão com rollback, caixa do convênio sem duplicar com
chamadas simultâneas, estorno do repasse, status calculado no banco, split nos itens).
**Supabase local (Docker), 2026-11-15:** as 12 migrations pendentes (`20261114000001` a `20261117000001`) aplicadas sem erro
com `supabase migration up`; `node scripts/rls-test.mjs` → **551 PASS, 0 FAIL**. Ainda não aplicadas na nuvem. Os inventários `features*.csv` e trechos de `backend.md` estão desatualizados (marcam
HOF, Vendas, Prótese e arquivos como ausentes).
