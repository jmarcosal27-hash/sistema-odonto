---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/shell.tsx","components/ui.tsx","app/globals.css"]
---

# Superfície: shell do app + Início (e o sistema de componentes compartilhado)

Modo: Operate. Público: recepção e dentistas, computador e celular por igual.
Tarefa: abrir o dia (agenda de hoje, caixa, parcelas) e navegar para qualquer módulo em um clique.
Restrições: logo e cores da marca SmileOS fixos; temas claro/escuro; WCAG AA; alvos de 44px.

## Direction contract

THESIS: O SmileOS é o bloco timbrado da clínica: papel claro, tinta da marca e status batidos como carimbo. Recusa o painel SaaS de cards iguais com acento roxo em degradê.

OWN-WORLD: Fundo de papel levemente lavanda (#F7F6FA), folhas brancas com filete de 1px, barra lateral chapada em tinta da marca (#1F1B2E) com item ativo em papel e marca lavanda, violeta #6D4FD8 só para ação, seleção e "em andamento". Cabeçalho timbrado com filete duplo (3px + 1px). Status como carimbo: contorno 1.5px, versalete espaçado, leve inclinação. Numeração de série "Nº 000123" em algarismos tabulares. Public Sans, uma família, escala rígida.

STORY: A recepção vê em segundos quem está na cadeira, quem não confirmou e o que entra no caixa hoje; o dentista acha o paciente e o prontuário sem caçar.

FIRST VIEWPORT: Rail de 248px em tinta à esquerda; à direita, cabeçalho timbrado (clínica · data em versalete, saudação 28px, ações Novo paciente / Marcar consulta à direita); abaixo duas folhas: Agenda de hoje (tabela hora/paciente/dentista/carimbo, linha atual em lavanda) e Caixa de hoje com Nº de série, grade de valores e parcelas.

FORM: Receituário (direção sorteada, posição 3 da lista própria), paleta trocada pela identidade SmileOS a pedido do usuário. seed:58264dc309712219

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
