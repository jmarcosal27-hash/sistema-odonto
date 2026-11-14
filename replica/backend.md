# Backend

Stack: **Supabase** (Postgres + Auth + RLS) · **Stripe Checkout** (pagamento único, modo teste) · Next.js route handlers.
Código: `web/supabase/migrations/`, `web/lib/remote.ts`, `web/lib/supabase/`, `web/app/api/`, `web/middleware.ts`.

## Dois modos, mesmas telas

- **Sem** `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`: modo demonstração (dados no navegador, `lib/store.ts`).
- **Com** as chaves: modo nuvem (`lib/remote.ts`). Login obrigatório (middleware), dados da clínica no Postgres.
- As telas chamam o mesmo `api.*` nos dois modos.

## O que você (usuário) precisa criar — eu não crio contas nem digito chaves

1. Projeto no **Supabase** (região São Paulo, `sa-east-1`). Copiar URL, anon key e service role para `web/.env.local` (modelo em `.env.example`).
2. Rodar as migrations no projeto: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. Em Auth → URL Configuration: Site URL = domínio do app; Redirect URLs: `https://SEU-DOMINIO/auth/callback` (e `http://localhost:3000/auth/callback` para dev).
4. Auth → SMTP: configurar **Resend** (ou Postmark) com domínio próprio — o SMTP padrão do Supabase tem limite baixo de e-mails por hora e não serve para produção. Textos dos e-mails de confirmação e troca de senha: escrever em português em Auth → Email Templates.
5. **Stripe** em modo teste: criar um Produto "Plano anual" com Preço **único** (one-time) em BRL → `STRIPE_PRICE_ANNUAL`. Ativar **Pix** e cartão em Payment methods. Webhook para `https://SEU-DOMINIO/api/stripe/webhook` com eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` → `STRIPE_WEBHOOK_SECRET`. Em dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
6. Backups: plano Pro do Supabase tem backup diário automático; no Free **não há** — ligar antes de ter pacientes reais.

## Auth

- [x] Cadastro por e-mail com confirmação (link) — `app/entrar`, `app/auth/callback`
- [x] Troca de senha por e-mail — `app/auth/nova-senha`
- [x] Sessão em cookie http-only (Supabase SSR), renovada no `middleware.ts`
- [x] Sair deste aparelho / sair de todos os aparelhos
- [x] Exclusão de conta que apaga de verdade (`/api/conta/excluir`: apaga a clínica em cascata se for o único dono, depois o usuário)
- [x] Papéis: `owner`, `dentist`, `receptionist`, `finance` em `clinic_members`; funções `is_member`, `has_role`, `can_write` respondem "pode?"
- [x] Convites por e-mail: tabela pronta + RPC `claim_invites` (aceita ao entrar, só com e-mail confirmado). **Falta a tela de equipe** (onda C).
- [ ] Login com Google — opcional; precisa de app OAuth do usuário no Google Cloud.
- [ ] Magic link — o original não tem; não implementado.

## Banco

- [x] Migration única versionada: `20261113000001_clinic_schema.sql` (clínica, membros, acesso, pacientes, plano/itens, orçamentos, parcelas, atendimentos, despesas, agenda, modelos de mensagem, lista de espera, retornos, eventos Stripe)
- [x] RLS em **todas** as tabelas. Leitura = membro ativo; escrita = membro ativo **e** acesso em vigor (`can_write`) → acesso vencido vira só-leitura no próprio banco, não só na tela.
- [x] Despesas só para `owner`/`finance`. Modo "consultório dividido": dentista vê só os próprios pacientes (tabela `patients`; demais tabelas ainda seguem o modo compartilhado — completar na onda C).
- [x] Operações de várias linhas atômicas em RPC: `create_clinic`, `create_budget` (total calculado no banco), `authorize_budget` (parcelas e atendimentos; recusa aprovar duas vezes), `grant_access` (só service role).
- [x] Teste com segundo usuário: `node scripts/rls-test.mjs` (resultado abaixo)
- [ ] Seed na nuvem: usar o modo demonstração para dados de exemplo; não semear dados fictícios no banco de produção.
- [ ] Backups (ver item 6 acima)

Desvio consciente do skill: validação de entrada fica no **banco** (CHECK constraints + RPCs) e no cliente (zod nos formulários de auth), em vez de zod em cada rota — as escritas vão direto do navegador ao Postgres pela API do Supabase, protegidas por RLS. Rotas próprias (checkout, webhook, exclusão) validam com zod/assinatura.

## Pagamentos

Decisão de produto (herdada do Adianta, contra a maior reclamação do setor no ReclameAqui): **pagamento único anual, sem cobrança recorrente**. Por isso não há Customer Portal nem eventos de assinatura (`customer.subscription.*`, `invoice.payment_failed`): não existe assinatura para cancelar.

- [x] Checkout do Stripe (`/api/stripe/checkout`), só o dono compra/renova; sem formulário de cartão próprio
- [x] Webhook verifica assinatura, registra o `event.id` (idempotente), libera acesso por `grant_access` (idempotente pelo id da sessão; renovação soma ao tempo restante)
- [x] Pix/boleto: libera só em `async_payment_succeeded`
- [x] Chave de teste obrigatória fora de produção (`lib/stripe.ts` recusa `sk_live` em dev)
- [ ] Garantia de 7 dias: reembolso manual pelo painel do Stripe (sem automação)
- [ ] Planos por número de dentistas (Smileo tem 1 / 5 / 10): hoje um preço único; decidir antes do lançamento

## E-mail e jobs

- [x] E-mails de conta (confirmação, senha) pelo Supabase Auth
- [ ] SMTP próprio (Resend) — item 4
- [ ] Lembretes automáticos por WhatsApp (Cloud API) — **não implementado**. Exige conta Meta Business verificada, número dedicado e **templates aprovados pela Meta** (dias a semanas). Comece o processo cedo. Até lá, confirmação e retorno funcionam por link `wa.me` com a mensagem pronta (um clique do usuário).

## Integrações

| integração | API oficial | escopos/permissões | revisão do provedor | limites |
| --- | --- | --- | --- | --- |
| CEP | ViaCEP (pública, sem chave) | — | — | uso razoável; preenchimento manual se cair |
| WhatsApp (envio manual) | links `wa.me` | — | — | — |
| WhatsApp (automático, futuro) | WhatsApp Cloud API (Meta) | `whatsapp_business_messaging` | verificação da empresa + aprovação de cada template | por tier de qualidade do número |
| Pagamento | Stripe Checkout | chave secreta + webhook | ativação da conta Stripe no Brasil | — |

## Segurança

- [x] Segredos só em variáveis de ambiente; `.env*` no `.gitignore` (exceto `.env.example`); service role só em código `server-only`
- [x] Autorização no banco em toda leitura e escrita; testado com segundo usuário
- [x] Webhook verifica assinatura
- [x] Redirecionamento do callback de auth só para caminhos internos (sem open redirect)
- [x] Sem dados de paciente em URLs (só ids)
- [ ] Rate limit: o Supabase Auth já limita login/cadastro/e-mails por padrão; **revisar os limites** em Auth → Rate Limits antes do lançamento. Rotas próprias sem rate limit (checkout exige login; webhook exige assinatura).
- [ ] Uploads (logo, radiografias) — ainda não existem; quando vierem (onda B): bucket privado, limite de tamanho e tipo, URLs assinadas
- [x] Dados clínicos (evolução e anamnese, onda B parcial): tabelas `clinical_notes`, `anamnesis_templates`, `anamnesis_records` com RLS (leitura = membro; escrita = `can_write`; modo dividido respeitado via `patients`), testadas em `scripts/rls-test.mjs` (a rodar após aplicar a migration `20261114000001`)
- [ ] Anamnese por link público (token com expiração, rota sem login, limite de uso) — pendente
- [ ] `npm audit` — ver resultado abaixo
- [x] Rascunho de política de privacidade listando processadores (`/privacidade`) — **precisa de revisão jurídica**

## Resultados
(preenchido abaixo após rodar os testes)

### 2026-11-13 — Supabase local (`npx supabase start`)
- Migration aplicada sem erros.
- `node scripts/rls-test.mjs`: **16/16 PASS** (isolamento entre clínicas, RPCs recusam outra clínica, `grant_access` bloqueado para usuário comum, total do orçamento calculado no banco, parcelas somam o total, aprovar duas vezes é recusado, acesso vencido = só leitura).
- Build e lint limpos com as chaves do Supabase local.
- **Ainda não testado no navegador em modo nuvem** (cadastro → criar clínica → fluxo completo) nem o Stripe (precisa das chaves de teste do usuário).

## Revisão 2026-11-14 (segurança e corretude, antes da Onda B)

Correções aplicadas em `web/` e na migration nova
`web/supabase/migrations/20261114000002_correcoes_seguranca.sql` (as anteriores não foram editadas).
**Nada disto foi executado contra um Supabase real**: `scripts/rls-test.mjs` ganhou os casos
novos, mas só passa a valer depois de aplicar a migration e rodá-lo. `npm run lint`, `npx tsc --noEmit`,
`node --check scripts/rls-test.mjs` e `node scripts/safe-next-test.mjs` passam.

| # | achado | situação | como |
| --- | --- | --- | --- |
| 1 | CRÍTICO `members_self_update` deixava virar owner, reativar membro desativado e trocar `clinic_id` | corrigido | policy removida; RPC `update_my_profile(nome, cro, tema)` (só linha ativa do próprio usuário); trigger impede mudar `clinic_id` de membro; `remote.ts` usa a RPC |
| 2 | ALTO `claim_invites` | corrigido | exige `email_confirmed_at`; convite repetido para quem já é membro é descartado sem erro; `loadRemote` agora devolve estado de erro se a RPC falhar |
| 3 | ALTO open redirect no callback | corrigido | `lib/safe-next.ts` resolve com `new URL` e compara a origem; teste em `scripts/safe-next-test.mjs` (`//evil.com`, `/\evil.com`, `/%09/evil.com`...) |
| 4 | ALTO webhook Stripe | corrigido | `stripe_events` deixou de ser usado (a tabela continua existindo); `grant_access` já é idempotente pela sessão; confere `mode === "payment"`, `payment_status === "paid"`, `clinic_id` UUID e clínica existente (inválido = 200 ignorando) |
| 5 | ALTO modo "consultório dividido" | corrigido | trigger `patients_guard` (dentista grava a si mesmo; dono também se não informar; só o dono troca o responsável; `clinic_id` imutável); `patient_visible` e `can_see_patient` aplicadas a plans, budgets, installments, treatments, appointments, patient_events, waitlist, recall_states e plan_items (via plano); notas e anamneses já usavam `exists` sobre `patients` |
| 6 | ALTO `loadRemote` truncava em 1000 linhas | corrigido | `loadAll` pagina com `.range()` e ordem estável |
| 7a | patient_events apagável; escrita sem papel; decline sem checagem | corrigido | histórico sem update/delete; parcelas: só dono/financeiro/recepção atualizam; atendimentos: valor e pagamento só dono/financeiro/recepção (trigger); apagar orçamento/parcela/atendimento só dono; `decline_budget` exige `presented`; trigger `budgets_guard` impede mudar status por update direto |
| 7b | referências entre clínicas | corrigido | `can_see_patient(clinic_id, patient_id)` nas policies; trigger `enforce_same_clinic_refs` (plano, orçamento, item); `create_budget` confere o paciente |
| 7c | produção sem env liberava o modo demonstração | corrigido | middleware responde 503 em produção sem as variáveis; `/entrar` mostra "Serviço indisponível" |
| 7d | AuthorizeDialog | corrigido | só fecha se deu certo, estado `busy`, `localApi.authorize` e `decline` exigem `presented` |
| 7e | `coalesce(p_installments, 1)` | corrigido | `authorize_budget` recriada (também grava só os itens realmente do plano) |
| 7f | faturado ignorava desconto | corrigido | `billed()` aplica o fator total/subtotal do orçamento de origem |
| 7g | datas em UTC | corrigido | `todayISO`/`toISODate` em `atendimentos/page.tsx` e `finance.ts` (inclui `presentedAt` e `createdAt`) |
| 7h | exclusão de conta | corrigido | pede a senha e valida num cliente descartável; confere todos os 409 antes de apagar qualquer coisa |

Pendências e riscos:
- Aplicar a migration e rodar `node scripts/rls-test.mjs` (o teste de `claim_invites` com e-mail NÃO confirmado não foi escrito: o Supabase não deixa esse usuário entrar para chamar a RPC).
- A restrição por papel muda o comportamento: dentista não marca parcela paga nem altera valor/pagamento de atendimento. Se a clínica quiser que dentista receba, afrouxar em `installments_update` e `treatments_guard`.
- Compromissos do tipo `personal` ainda aparecem para todos os dentistas no modo dividido.
- Já existiam pacientes com `dentist_id` nulo: continuam visíveis a todos os dentistas até o dono atribuir um responsável.
- A conferência de senha na exclusão não serve para quem entra só por link/OAuth (hoje o app só tem senha).
- `loadRemote` continua carregando tudo; a paginação só remove o corte, não o custo para clínicas muito grandes.

## Onda B1 — documentos simples (2026-11-14)

Migration `20261114000003_documentos.sql`. **Ainda não aplicada**; depois de aplicar, rodar `node scripts/rls-test.mjs`.

- [x] `clinic_members` ganhou `cro_uf`, `cpf` (11 dígitos) e `birth_date`. RPC `update_my_profile(nome, cro, tema, uf, cpf, nascimento)` substitui a de 3 parâmetros; continua mexendo só nesses campos da linha ativa do próprio usuário (nada de papel, status ou clínica).
- [x] Tabelas `medications`, `prescriptions`, `prescription_items`, `prescription_templates`, `certificates` com CHECKs (dias 1–365, horas 1–24, tipo, via interna/externa, quantidade > 0, CID só com consentimento).
- [x] Leitura: membro ativo + `can_see_patient` (respeita "consultório dividido"). Medicamentos e modelos não têm dado de paciente: leitura por qualquer membro.
- [x] Emitir receita/atestado: só `owner` ou `dentist`, em nome de si mesmo (`professional_id = auth.uid()`). Editar e excluir: só o dono da clínica ou o autor. Justificativa: são documentos de responsabilidade do profissional; recepção e financeiro só leem. Medicamentos e modelos: criar por dono/dentista; excluir pelo dono ou criador.
- [x] Gatilhos: clínica, paciente e autor do documento não mudam; item e medicamento precisam ser da mesma clínica da receita.
- [x] RPC `save_prescription` (security invoker, RLS vale): receita + itens numa transação; nomes novos entram no catálogo da clínica.
- [x] Nada de dado de saúde em URL: só ids (`/receitas/[id]/imprimir`, `/atestados/[id]/imprimir`).
- [ ] Riscos e decisões a revisar: (1) a policy `members_read` deixa qualquer membro ler a linha de todos, então CPF e nascimento de colegas ficam visíveis dentro da clínica (confirmado); se for um problema, mover para tabela privada; (2) nome/CRO/UF do documento são um snapshot enviado pelo cliente (não há verificação de que o CRO é real); (3) sem trilha de auditoria de edição/exclusão dos documentos; (4) sem assinatura digital: o documento vale só impresso e assinado à mão.
