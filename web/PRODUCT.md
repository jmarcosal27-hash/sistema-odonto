# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Clínicas odontológicas com vários dentistas (não só consultório solo). Dois usuários diários, em igual medida:
- **Recepção / gestão**: agenda, confirmações, caixa, comissões, convênios, cobrança. Fica o dia todo no sistema, alterna rápido entre pacientes.
- **Dentistas**: abrem prontuário, odontograma, plano de tratamento, orçamento, evolução e documentos entre um paciente e outro, muitas vezes com pouco tempo.

Uso em computador e em celular/tablet na mesma proporção (inclusive na cadeira), então toda tela precisa funcionar bem nos dois.

## Product Purpose
Gestão completa da clínica: pacientes e prontuário (anamnese, odontograma, evolução, imagens, documentos, receitas, atestados), plano de tratamento e orçamento, agenda, vendas, financeiro (parcelas, caixa, comissões, estornos), convênios (lotes, glosa), controle de prótese e indicadores. Sucesso = a clínica opera o dia inteiro aqui sem planilha paralela.

## Positioning
Acesso anual com pagamento único, sem cobrança recorrente: resposta direta às reclamações de mensalidade e cobrança de concorrentes (iClinic, Clinicorp). Feito para clínica com equipe (papéis, comissões por dentista e por procedimento) e não só para o dentista solo.

## Operating Context
- Recepção atendendo telefone e paciente no balcão enquanto usa a agenda e o caixa.
- Dentista entre atendimentos, às vezes de luvas trocadas, consultando no celular ou tablet.
- Documentos impressos (receitas, atestados, orçamentos) com rotas `/imprimir` próprias.
- Modo demonstração local (sem chaves) e modo nuvem (Supabase), com estado somente-leitura quando o acesso vence.

## Capabilities and Constraints
- Next.js 15 + React 19 + Tailwind 4, componentes próprios em `components/ui.tsx` (sem shadcn), ícones lucide-react.
- Temas claro, escuro e do sistema (seletor no topo).
- Tudo em pt-BR; valores em centavos, moeda BRL.
- Termos do domínio: paciente, plano de tratamento, orçamento, atendimento, parcela, caixa, comissão, convênio, lote, glosa, prótese, HOF.

## Brand Commitments
- Nome **SmileOS**, grafia exata (nunca "Smile OS", "SMILEOS", "Smileos").
- Logotipo e ícone em `public/brand/` são fixos: usados por `<img>`, nunca recoloridos; regras em `components/logo.tsx`.
- Cores da identidade são obrigatórias (decisão do usuário, 2026-11-15): tinta da marca `#1F1B2E`, violeta `#6D4FD8`, lavanda `#BBA8F5`, branco. Tipografia e o restante do visual podem ser refeitos.

## Evidence on Hand
Sem depoimentos, clientes ou números reais ainda: não inventar.

## Product Principles
1. Velocidade na rotina: a ação mais comum de cada tela fica a um clique, nos dois aparelhos.
2. Dinheiro sem ambiguidade: valores, status de pagamento e estornos sempre legíveis e conferíveis.
3. Confiança clínica: prontuário e documentos com aparência séria, organizada e imprimível.
4. Equipe, não indivíduo: tudo pensa em vários dentistas e papéis.

## Accessibility & Inclusion
WCAG AA de contraste nos dois temas, alvos de toque de 44px, foco visível em todo controle, respeito a `prefers-reduced-motion` (já presentes no código atual).
