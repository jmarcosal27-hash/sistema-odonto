# Recon: agenda do CEVA PRO (sistema de salão do próprio usuário)

Data: 14/11/2026. Fonte: https://ceva-pro.vercel.app/agenda, sessão já logada do usuário (dono do sistema), somente leitura. Nada foi salvo; os diálogos foram fechados sem enviar. Nomes de clientes e profissionais reais não são reproduzidos aqui.

## Tela

Rota `/agenda`. Menu lateral: Agenda, Financeiro, Estoque, Clientes, Marketing, Relatórios, Ajustes. Menu recolhível.

Layout em duas colunas:
- **Coluna esquerda**: mini-calendário do mês (navegação por mês, dia atual destacado), lista de **Profissionais** com caixa de seleção e bolinha de cor por profissional (filtra as colunas), e **Buscar agendamento** (nome ou telefone).
- **Área principal**: título com a data por extenso, navegação (anterior, Hoje, próximo), alternador de granularidade **30 min / 60 min**, botões **Bloquear** e **Novo agendamento**, legenda de status em chips coloridos, e a grade.

## Grade

- **Uma coluna por profissional** (visão de recursos) para o dia; faixa de cor no topo de cada coluna igual à cor do profissional. Rolagem horizontal quando há muitas colunas.
- Linhas por hora (08:00 a 19:00+), subdivisão em 30 min. Horário fora do expediente do profissional fica hachurado/cinza.
- Cartão de agendamento: faixa lateral, horário inicial e final, nome do cliente, nome do serviço (truncado), e um **botão de status** (bolinha + seta) que abre menu rápido.
- Altura do cartão proporcional à duração. Cartões curtos mostram só "Cliente · Serviço".
- Cartão com "encaixe" mostra a etiqueta no texto.

## Status

Agendado, Confirmado, Aguardando, Em atendimento, Concluído, Faltou. Troca em um clique no cartão. Cores: cinza, azul, laranja, roxo, verde, vermelho.

## Novo agendamento (diálogo)

- Cliente: busca por nome, telefone, e-mail ou CPF, mais botão "Novo cliente" (cadastro rápido).
- Data.
- **Serviço 1** (bloco repetível, botão "Adicionar serviço"): Serviço (lista), Valor final do serviço (preenchido com o preço de tabela, editável), Profissional, Início, Fim (fim calculado pela duração do serviço).
- Opções: **Forçar encaixe** (ignora conflito), **Fora do expediente** (só o dono), **Repetir este agendamento**, Etiqueta, Observações.
- Total em R$ no rodapé (soma dos serviços). Botões Fechar e Salvar.

## Bloquear horário (diálogo)

Profissional, Início, Fim, Motivo (padrão "Bloqueio"), opção avançada "vários dias". Salvar.

## Notificações

Ícone de sino no topo.

## Comparação com a agenda atual do SmileOS (`web/app/agenda/page.tsx`)

Já existe: mini-calendário com pontos nos dias, navegação, visões Dia/Semana, linha da hora atual, cartões por status, formulário de consulta, compromisso pessoal, horário a definir.

Falta no SmileOS (candidatos a implementar):
1. **Visão por profissional** (colunas por dentista) com filtro de profissionais e cor por profissional. Hoje a semana é por dia e não há profissional no agendamento.
2. **Menu rápido de status no cartão**, com mais estados: Aguardando (paciente na recepção) e Em atendimento. Hoje: a confirmar, confirmado, atendido, faltou, cancelado.
3. **Bloquear horário** (almoço, folga, manutenção), por profissional e por vários dias.
4. **Granularidade 30/60 min** no zoom da grade.
5. **Vários procedimentos no mesmo agendamento**, com duração e valor somados.
6. **Encaixe** (forçar conflito) com marca visível, e detecção de conflito por profissional.
7. **Repetir agendamento** (retornos periódicos, ex.: manutenção ortodôntica).
8. **Etiqueta** do agendamento e **busca** de agendamento por nome ou telefone.
9. **Fora do expediente** e expediente por profissional (faixa cinza).

## Plano sugerido (adaptação, não cópia)

Reescrever do zero em React/Tailwind do SmileOS, com os mesmos conceitos e vocabulário próprio da odontologia (paciente no lugar de cliente, procedimento no lugar de serviço, cadeira ou dentista como recurso). Mudanças de dados:
- `Appointment`: adicionar `professionalId`, `procedures[]` (nome, valor, duração), `label`, `forced`, `recurrence`; status ganha `waiting` e `in_service`.
- Nova entidade `TimeBlock` (profissional, início, fim, motivo, vários dias).
- Nova entidade `Professional` com cor e expediente (ou reaproveitar o perfil da clínica quando houver só um dentista).
- Migration nova no Supabase e RLS por clínica, nas duas camadas (`lib/store.ts` e `lib/remote.ts`).

Tamanho: M. Ordem sugerida: (1) profissional + colunas, (2) menu de status, (3) bloqueio, (4) vários procedimentos, (5) repetir e encaixe.
