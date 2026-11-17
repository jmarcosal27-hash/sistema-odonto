# Design system SmillicOS — "Receituário"

O sistema é o bloco timbrado da clínica, numa leitura contemporânea: papel claro, tinta da marca, filetes finos e selos de status discretos. (Revisão 2026-11-15: menos peso estrutural, mais respiro.) Modo Operate: a tarefa vem antes da expressão; a marca vive nos detalhes.

Fonte de verdade dos valores: `app/globals.css` (tokens) e `components/ui.tsx` (componentes). Produto: `PRODUCT.md`. Direção: `.impeccable/surfaces/app-page-tsx.md`.

## Cor

Estratégia: contida, com um campo comprometido (a barra lateral). Cores da identidade são obrigatórias.

| Papel | Token (classe) | Claro | Escuro |
|---|---|---|---|
| Fundo de papel | `paper` | `#f7f6fa` | `#120f18` |
| Folha (card, modal, input) | `surface-100` / `surface-200` | `#ffffff` | `#221e2e` / `#1c1926` |
| Preenchimento sutil | `surface-300` | `#eeeaf7` | `#2c2740` |
| Texto | `ink` | `#1f1b2e` | `#f2effa` |
| Texto secundário | `ink-muted` | `#625c78` | `#b6aecb` |
| Filete (cabeçalhos, tabelas) | `rule` | `#1f1b2e` | `#b6aecb` |
| Ação / seleção / "em andamento" | `brand` | `#6d4fd8` | `#bba8f5` |
| Barra lateral | `rail`, `rail-ink`, `rail-muted`, `rail-active` | `#1f1b2e`, `#ece8f8`, `#b3abcf`, `#f7f6fa` | iguais |
| Estados | `success`, `warning`, `danger` (+ `-soft`) | `#0f766e`, `#8a5a00`, `#b42318` | `#5eead4`, `#f5c451`, `#ffa59b` |

Regras:
- Violeta só para ação primária, link, seleção e o que está acontecendo agora (paciente na cadeira). Nunca decoração, nunca degradê.
- A barra lateral é um campo chapado na tinta da marca nos dois temas, com filete `rail-line` à direita; o item ativo é uma "folha" de papel clara (`rail-active`) com ícone violeta, igual nos dois temas.
- Dinheiro: entrada em `success`; saída/despesa em `ink` com sinal de menos (despesa é rotina, não alarme); `danger` só para vencido, faltou, glosa e saldo final negativo; `warning` só para pendente/em aberto.
- "Agora" (linha do horário atual, linha da consulta em andamento) é sempre violeta, nunca vermelho.
- Logo: na barra lateral sempre a versão para fundo escuro (`<Logo onDark />`). SVGs nunca recoloridos.

## Tipografia

Uma família: **Public Sans** (`next/font`, variável `--font-public`), algarismos tabulares no corpo inteiro (dinheiro alinha).

| Uso | Tamanho / peso |
|---|---|
| Título da página (cabeçalho) | 28px/36 semibold, -0.025em (20px no celular); data por extenso ao lado em 14px `ink-muted` |
| Título de seção na página | 28px (`text-xl`) bold |
| Título de folha (`SheetTitle`) | 16px bold |
| Corpo / tabela | 14–16px regular |
| Rótulo de valor / metadado | 13px medium `ink-muted`, caixa normal |
| Cabeçalho de tabela | 12px `ink-muted`, caixa normal |
| Valor (Kpi) | 24px/32 semibold, -0.02em |

Hierarquia vem de tamanho e peso, não de caixas coloridas.

## Assinaturas

1. **Cabeçalho**: título grande + data por extenso na mesma linha, um único filete de 1px (`border`) embaixo, fundo de papel translúcido com desfoque ao rolar. O `Modal` usa o mesmo filete de 1px. (O filete duplo 3px+1px foi aposentado na tela.)
2. **Selo de status** (`Badge`): pílula de 24px, fundo `*-soft` do estado, ponto de 6px na cor do estado, texto 12px semibold em caixa normal. Sem inclinação. Tons: `success` atendido/pago, `warning` a confirmar/em aberto, `danger` vencido/faltou/glosa, `accent` em andamento, `info` confirmado, `neutral` arquivado.
3. **Número de série** (`Serial`): "Nº 000123" em 11px tabular, para orçamento, recibo, lote.
4. **Valor da folha** (`Kpi`, também em Indicadores): cartão de 16px de raio com borda de 1px, rótulo 13px, valor 24px semibold; só o valor recebe a cor do estado.
5. **Barra inferior no celular**: Início, Agenda, Pacientes, Caixa e "Mais" (abre o menu completo), alvo de 64px.

## Forma e espaço

- Raios: `sm` 4px, `md` 10px (botão, input, item de menu, bloco da agenda), `lg` 16px (folha/card, modal, Kpi). `pill` só para filtros segmentados, selos de status e botões de ícone; ações são sempre retangulares.
- Elevação: folhas usam só borda de 1px (`border`), sem sombra. Botões têm sombra de 1px de contato. Sombra (`shadow-md`) só em sobreposições (modal, menu) e no hover do bloco da agenda.
- Espaço: escala de 4px (`--space-1..8`). Folhas com 20px de respiro; 20–24px entre folhas; mais espaço acima de título do que abaixo.
- Conteúdo e cabeçalho alinham na mesma coluna (máx. 68rem de conteúdo no desktop).

## Componentes (`components/ui.tsx`)

- `Button`: `primary` violeta; `secondary` branco com contorno 1px `border-strong/70` e texto `ink`; `ghost` texto violeta; `danger`; `soft`. Retangular (10px); `pill` só quando pedido. Alturas 36/44/48. Pressionado encolhe para 98%. Desabilitado em `surface-300`.
- `Input`/`Select`/`Textarea`: contorno 1px `border-strong` (escurece no hover), foco com borda violeta + anel de 3px.
- `Card`: folha branca, borda 1px, sem sombra.
- `Modal`: folha com cabeçalho de filete fino, fundo escurecido com leve desfoque; no celular sobe como gaveta.
- `Badge` (carimbo), `Serial`, `SheetTitle`, `Kpi`, `Segmented`, `Toggle`, `Avatar`, `Empty`, `Skeleton`, `ErrorNote`.
- Tabelas: cabeçalho 12px `ink-muted` sobre filete `border`; linhas separadas por `border`; linha "agora" em `brand-soft` com horário em violeta.
- Agenda: bloco com borda de 1px na cor do estado (sem faixa lateral), nome do paciente primeiro e horário · procedimento na segunda linha.

## Movimento

150ms ease-out para cor e pressão. Um único movimento de entrada: o conteúdo da página sobe 6px e aparece em 320ms (`.so-enter`, curva exponencial) a cada troca de tela. `prefers-reduced-motion` respeitado globalmente.

## Superfícies do navegador

Seleção em `brand-soft`, cursor de texto e `accent-color` em violeta, barra de rolagem em `border-strong`, anel de foco de 3px em `focus-ring`.
