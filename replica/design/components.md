# Componentes — clone do Adianta Odonto

Specs de todo componente listado em `replica/recon.md` (seção "Componentes"),
mais os primitivos de base (Button, Input, Nav item) que o resto depende mas
que o recon não lista separadamente. Tokens sempre pelos nomes do
`tokens.json` — nunca hex cru.

```
Button
  variantes  primary (bg accent / texto on-accent), secondary (bg surface,
             borda border-input, texto text), ghost (sem bg, texto accent),
             danger (bg danger, texto on-accent)
  tamanhos   sm 32px, md 40px, lg 48px (altura); padding horizontal 16/20/24
  raio       pill (999) -- todo botão do original é totalmente arredondado,
             nunca retangular com cantos levemente curvos
  estados    default, hover (escurece 6%), active (escurece 10%),
             focus-visible (anel 2px accent, offset 2px), disabled (opacidade
             .45, cursor not-allowed -- visto no botão "Salvar" do plano
             zerado), loading (spinner + mantém o texto para leitor de tela,
             via aria-busy)
  tokens     bg accent, texto on-accent, radius pill, fonte sm/600
  a11y       elemento <button> real, nunca <div onClick>; foco visível;
             loading usa aria-busy="true" e mantém o label (não troca por só
             ícone)
  usado em   S01 (Continuar), S02 (Salvar), S05 (+Novo paciente), S07
             (+Compromisso), S12 (+Procedimento) -- todo CTA primário do app

Input (texto, data, telefone, CEP)
  variantes  texto simples, com máscara (telefone, CEP, CPF), data com ícone
             de calendário, textarea (observações)
  estados    default (borda border-input), focus (borda accent + anel 2px),
             filled, placeholder (texto-muted, ex. "dd/mm/aaaa",
             "(11) 99999-0000"), error (borda danger + texto de erro abaixo),
             disabled (bg surface-sidebar, texto-muted)
  tokens     bg surface, borda border-input, radius md, texto sm/400, texto
             placeholder text-muted
  a11y       <label> associado (não placeholder como único rótulo); erro
             anunciado via aria-describedby; máscara não deve travar
             navegação por teclado (setas, backspace)
  usado em   S05 (Novo paciente), S07 (Novo compromisso), S04 (Lançar
             atendimento), S02 (nome/nascimento/telefone do paciente)

Sidebar nav item
  variantes  default, ativo (destacado -- recon mediu bg mais escuro que o
             painel), com ícone à esquerda
  estados    default, hover, ativo, focus-visible
  tokens     bg (ativo) um tom abaixo de surface-sidebar, texto text,
             radius md, ícone 20px
  a11y       lista de navegação semântica (<nav><ul>), item ativo marcado com
             aria-current="page"
  usado em   todas as telas internas (S01-S14)

Odontograma (SVG interativo)
  variantes  arcada adulta (32 dentes) / infantil (dentição decídua, menos
             dentes), filtro por quadrante (arcada inteira / sup. dir. / sup.
             esq. / inf. esq. / inf. dir.)
  estados    dente neutro (contorno border, sem preenchimento), dente
             selecionado (anel accent), dente com 1+ condição (cor de
             preenchimento por condição -- ver mapeamento abaixo), hover
             (contorno accent claro), foco por teclado (navegação por setas,
             confirmado no recon: "Selecione um dente. Use as setas no
             teclado.")
  mapeamento de cor por condição (papéis, não as cores exatas do original):
             hígido/em erupção -> success; cariado/fraturado/com
             mobilidade/restauração insatisfatória -> danger; restaurado/com
             endodontia/com prótese/implante -> accent; incluso/ausente ->
             text-muted (contorno tracejado)
  a11y       cada dente é um elemento focável (role="button" com
             aria-pressed quando selecionado, ou <button> dentro do <svg> via
             <foreignObject> se o framework de SVG não suportar foco nativo);
             número do dente (FDI) como aria-label, não só posição visual;
             navegação por setas do teclado move o foco entre dentes
             vizinhos, replicando o comportamento visto no original
  usado em   S02

Modal de condição do dente
  variantes  --
  estados    aberto/fechado, com busca de procedimento ativa, com resultado
             destacado "Mais usados"
  tokens     bg surface, radius lg, shadow pop, overlay bg preto/40%
  comportamento  multi-seleção de condições (chips toggle), busca de
             procedimento com matching por nome e especialidade, link
             "+Criar um procedimento meu" sempre visível no fim da lista
  a11y       foco preso dentro do modal (focus trap), Esc fecha, foco volta
             pro dente que abriu o modal ao fechar
  usado em   S02

Card KPI
  variantes  neutro (bg surface), tinta positiva (bg surface-success-subtle),
             tinta informativa (bg surface-info-subtle), tinta de alerta (bg
             surface-warning-subtle), tinta terciária (bg
             surface-accent-subtle) -- o original usa a cor do card para
             comunicar o tom (bom/neutro/aguardando/atenção), não só o texto
  estrutura  título pequeno (xs, text-muted) + valor grande (xl, text,
             weight 700) + subtítulo opcional (xs, text-muted)
  estados    default, vazio (valor "0" ou "R$ 0,00" -- visto em toda tela no
             recon por ser conta nova), com link de ação no canto (ex.
             "Analisar financeiro →", "Ver orçamentos →")
  tokens     radius lg, padding 24 (space-5), shadow card (quase imperceptível
             -- o original separa blocos por cor, não por sombra)
  a11y       se o card inteiro é clicável, usar <a>/<button> envolvendo tudo,
             nunca só o link de texto final preso num <div> clicável maior
  usado em   S01, S03, S04, S05, S10, S12

Barra de abas (pill)
  variantes  2 a 3 abas, ícone opcional antes do rótulo
  estados    ativa (bg surface cheio, texto text, dentro de um trilho bg
             surface-sidebar), inativa (texto text-muted, sem bg), hover
             (texto text), focus-visible
  tokens     trilho bg surface-sidebar, radius pill, aba ativa bg surface
  a11y       role="tablist" / role="tab" com aria-selected, navegação por
             setas esquerda/direita entre abas
  usado em   S03 (Todos/Apresentados/Autorizados), S07-S09
             (Agenda/Confirmar/Retornos), S10 (Financeiro/Gastos), S12
             (Procedimentos e preços/Especialidades), S13-S14
             (Ajustes/Sua conta)

Modal de criação (padrão)
  variantes  com campos simples (Lançar atendimento), com seleção de tipo via
             pills (Novo compromisso: Consulta/Retorno/Pessoal)
  estados    campo obrigatório vazio -> CTA primário desabilitado; validando;
             erro de validação por campo; sucesso (fecha e mostra toast)
  estrutura  título + subtítulo de ajuda em itálico/text-muted + campos +
             rodapé com "Cancelar" (ghost) à esquerda e CTA primário à
             direita
  tokens     bg surface, radius lg, shadow pop, overlay
  a11y       focus trap, Esc fecha com confirmação se houver dados
             preenchidos (evitar perda acidental), primeiro campo recebe foco
             ao abrir
  usado em   Novo paciente (S05), Novo compromisso (S07), Lançar atendimento
             (S04)

Botão de horário ("slot")
  variantes  livre (outline), ocupado (não aparece como slot -- vira item na
             lista do dia), selecionado (preenchido)
  estados    default (borda accent, texto accent, bg transparente), hover
             (bg surface-accent-subtle), selecionado (bg accent, texto
             on-accent)
  tokens     radius pill, borda 1px accent quando livre
  a11y       <button> com aria-pressed quando selecionado; grade de horários
             navegável por teclado (Tab ou setas)
  usado em   S07

Linha de FAQ (acordeão)
  variantes  --
  estados    fechada (chevron para baixo), aberta (chevron para cima,
             conteúdo empurra o restante da lista para baixo -- não é
             overlay), hover, focus-visible
  tokens     bg surface-sidebar (levemente destacado do fundo do modal),
             radius md, texto sm/600 na pergunta, sm/400 na resposta
  a11y       <button aria-expanded> controlando um painel com
             aria-controls/id; uma pergunta aberta por vez é opcional, não
             obrigatório (o original parece permitir várias abertas)
  usado em   S15 (modal de ajuda)

Badge de status
  variantes  neutro (A confirmar), positivo (Confirmado/Concluído/Já
             atendido), negativo (Cancelado/Faltou)
  tokens     positivo: bg surface-success-subtle, texto success; negativo: bg
             surface-warning-subtle ou tinta de danger, texto danger; neutro:
             bg surface-sidebar, texto text-muted
  tamanho    xs, padding 4/8, radius pill
  a11y       não depender só da cor -- sempre com texto (já é o padrão
             observado: "✓ Já atendido", não só um ponto colorido)
  usado em   S05, S06, modal de compromisso

Toggle (switch)
  variantes  --
  estados    off (bg border-input), on (bg accent), focus-visible (anel),
             disabled (opacidade .5)
  tokens     trilho radius pill, bolinha bg surface com shadow sutil
  a11y       role="switch" com aria-checked, operável via teclado
             (Space/Enter), rótulo clicável associado (não só o toggle)
  usado em   "Já recebi" (Lançar atendimento), "Marcar a próxima consulta",
             "Lembrar quando sumir" (S06)

Ícones de topo (sino, engrenagem, "?", tema claro/escuro)
  variantes  com badge de contagem (notificações não lidas -- não confirmado
             se o original usa, manter como estado possível)
  estados    default, hover (bg surface-sidebar circular), active, aberto
             (quando abre modal/dropdown)
  tokens     ícone 20px, botão circular 36px, hover bg surface-sidebar
  a11y       cada ícone precisa de aria-label (ex. "Notificações",
             "Ajustes", "Ajuda", "Alternar tema"), não só o ícone visual
  usado em   todas as telas internas, fixo no header
```

## Notas de fidelidade

- O original usa **texto escuro sobre fundo claro de accent** nos botões
  primários (medido: preenchimento ~#8EE5EC com texto ~#034C55) — um padrão
  menos comum (a maioria dos SaaS usa texto branco sobre accent saturado).
  **Decisão para o clone:** não repetir esse padrão específico por ser parte
  da identidade visual do original; o placeholder `accent` dos tokens já é
  saturado o suficiente para usar `on-accent` branco com contraste AA
  (5.31:1, ver `components.md` + `contrast.py`). Quando replica-brand definir
  a cor final, reconferir esse par.
- Cards de status com **fundo pastel colorido por papel semântico** (não só
  bordas/ícones coloridos) são um padrão real e recorrente do original — vale
  manter esse padrão no clone (`surface-success-subtle`,
  `surface-info-subtle`, etc.), só trocando os tons exatos.
- Botões **sempre totalmente arredondados (pill)**, inputs com raio médio,
  cards com raio grande — essa hierarquia de raio (pill > lg > md) é
  consistente em todas as 4 telas de referência e deve ser mantida.
- Tema escuro do original **não foi observado** durante o recon (a conta
  ficou no tema claro/sistema); os valores em `tokens.css` para
  `prefers-color-scheme: dark` são uma inversão estimada, não medida — testar
  visualmente antes de confiar neles.
