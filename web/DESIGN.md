# Design system SmileOS — "Receituário"

O sistema é o bloco timbrado da clínica: papel claro, tinta da marca e status batidos como carimbo. Modo Operate: a tarefa vem antes da expressão; a marca vive nos detalhes.

Fonte de verdade dos valores: `app/globals.css` (tokens) e `components/ui.tsx` (componentes). Produto: `PRODUCT.md`. Direção: `.impeccable/surfaces/app-page-tsx.md`.

## Cor

Estratégia: contida, com um campo comprometido (a barra lateral). Cores da identidade são obrigatórias.

| Papel | Token (classe) | Claro | Escuro |
|---|---|---|---|
| Fundo de papel | `paper` | `#f6f4fa` | `#15121c` |
| Folha (card, modal, input) | `surface-100` / `surface-200` | `#ffffff` | `#221e2e` / `#1c1926` |
| Preenchimento sutil | `surface-300` | `#eeeaf7` | `#2c2740` |
| Texto | `ink` | `#1f1b2e` | `#f2effa` |
| Texto secundário | `ink-muted` | `#625c78` | `#b6aecb` |
| Filete (cabeçalhos, tabelas) | `rule` | `#1f1b2e` | `#b6aecb` |
| Ação / seleção / "em andamento" | `brand` | `#6d4fd8` | `#bba8f5` |
| Barra lateral | `rail`, `rail-ink`, `rail-muted`, `rail-mark` | `#1f1b2e`, `#ece8f8`, `#b3abcf`, `#bba8f5` | iguais |
| Estados | `success`, `warning`, `danger` (+ `-soft`) | `#0f766e`, `#8a5a00`, `#b42318` | `#5eead4`, `#f5c451`, `#ffa59b` |

Regras:
- Violeta só para ação primária, link, seleção e o que está acontecendo agora (paciente na cadeira). Nunca decoração, nunca degradê.
- A barra lateral é um campo chapado na tinta da marca nos dois temas; o item ativo é uma "folha" de papel com marca lavanda de 3px à esquerda.
- Logo: na barra lateral sempre a versão para fundo escuro (`<Logo onDark />`). SVGs nunca recoloridos.

## Tipografia

Uma família: **Public Sans** (`next/font`, variável `--font-public`), algarismos tabulares no corpo inteiro (dinheiro alinha).

| Uso | Tamanho / peso |
|---|---|
| Título da página (cabeçalho timbrado) | 26px/32 bold, -0.015em (20px no celular) |
| Título de seção na página | 28px (`text-xl`) bold |
| Título de folha (`SheetTitle`) | 16px bold |
| Corpo / tabela | 14–16px regular |
| Rótulo em versalete (metadados, cabeçalho de tabela, rótulo de valor) | 11px semibold, maiúsculas, +0.08em |
| Valor de caixa | 22px/28 bold, -0.01em |

Hierarquia vem de tamanho e peso, não de caixas coloridas.

## Assinaturas

1. **Cabeçalho timbrado**: filete duplo (3px + 1px, cor `rule`) sob o título; acima, linha em versalete com clínica · data por extenso. Usado no topo do shell e no cabeçalho do `Modal`.
2. **Carimbo** (`Badge`): contorno de 1.5px na cor do estado, fundo transparente, 11px maiúsculo +0.08em, raio 4px, inclinação de -1° (`.so-stamp`, reta na impressão). Tons: `success` atendido/pago, `warning` a confirmar/em aberto, `danger` vencido/faltou/glosa, `accent` em andamento, `info` confirmado, `neutral` arquivado.
3. **Número de série** (`Serial`): "Nº 000123" em 11px tabular, para orçamento, recibo, lote.
4. **Valor de folha de caixa** (`Kpi`): filete de tinta de 2px no topo, cantos retos, rótulo em versalete, só o valor recebe a cor do estado.

## Forma e espaço

- Raios: `sm` 4px (carimbo), `md` 8px (botão, input, item de menu), `lg` 12px (folha/card, modal). `pill` só para filtros segmentados e botões de ícone.
- Elevação: folhas usam só borda de 1px (`border`), sem sombra. Sombra (`shadow-md`) só em sobreposições (modal, menu).
- Espaço: escala de 4px (`--space-1..8`). Folhas com 20px de respiro; 20–24px entre folhas; mais espaço acima de título do que abaixo.
- Conteúdo e cabeçalho alinham na mesma coluna (máx. 68rem de conteúdo no desktop).

## Componentes (`components/ui.tsx`)

- `Button`: `primary` violeta; `secondary` branco com contorno 1.5px `border-strong` e texto `ink`; `ghost` texto violeta; `danger`; `soft`. Retangular (8px); `pill` só quando pedido. Alturas 36/44/48. Pressionado desce 1px. Desabilitado em `surface-300`.
- `Input`/`Select`/`Textarea`: contorno 1.5px, foco com borda violeta + anel de 3px.
- `Card`: folha branca, borda 1px, sem sombra.
- `Modal`: folha com cabeçalho timbrado; no celular sobe como gaveta.
- `Badge` (carimbo), `Serial`, `SheetTitle`, `Kpi`, `Segmented`, `Toggle`, `Avatar`, `Empty`, `Skeleton`, `ErrorNote`.
- Tabelas: cabeçalho em versalete sobre filete `rule`; linhas separadas por `border`; linha "agora" em `brand-soft` com marca violeta de 2px.

## Movimento

150ms ease-out para cor e pressão. Sem animação de entrada. `prefers-reduced-motion` respeitado globalmente.

## Superfícies do navegador

Seleção em `brand-soft`, cursor de texto e `accent-color` em violeta, barra de rolagem em `border-strong`, anel de foco de 3px em `focus-ring`.
