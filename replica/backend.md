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
- [x] Convites por e-mail: tabela pronta + RPC `claim_invites` (aceita ao entrar). **Falta a tela de equipe** (onda C).
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
- [ ] `npm audit` — ver resultado abaixo
- [x] Rascunho de política de privacidade listando processadores (`/privacidade`) — **precisa de revisão jurídica**

## Resultados
(preenchido abaixo após rodar os testes)

### 2026-11-13 — Supabase local (`npx supabase start`)
- Migration aplicada sem erros.
- `node scripts/rls-test.mjs`: **16/16 PASS** (isolamento entre clínicas, RPCs recusam outra clínica, `grant_access` bloqueado para usuário comum, total do orçamento calculado no banco, parcelas somam o total, aprovar duas vezes é recusado, acesso vencido = só leitura).
- Build e lint limpos com as chaves do Supabase local.
- **Ainda não testado no navegador em modo nuvem** (cadastro → criar clínica → fluxo completo) nem o Stripe (precisa das chaves de teste do usuário).
