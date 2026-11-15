"use client";

import { useId, useState } from "react";
import { ChevronDown, MessageCircle, Mail, Smartphone } from "lucide-react";
import { Modal, Button, cx } from "./ui";

export const FAQ: { group: string; items: [string, string][] }[] = [
  {
    group: "Começando",
    items: [
      ["Qual o primeiro passo?", "Responda as quatro perguntas do guia inicial (especialidades, seu nome, como você atende e cor do documento). Depois, abra Plano de tratamento e monte o primeiro plano de um paciente. O guia pode ser reaberto por aqui a qualquer momento."],
      ["O sistema já vem com preços?", "Não. A lista de procedimentos vem pronta, mas o valor é sempre seu. Você pode definir um preço padrão em Tabela de preços ou digitar o valor na hora de montar o plano."],
    ],
  },
  {
    group: "Planos e orçamentos",
    items: [
      ["Como monto um plano?", "Escolha o paciente, clique no dente, marque o que encontrou e escolha o procedimento. Os itens são organizados por etapa. Ao gerar o orçamento você pode imprimir ou enviar pelo WhatsApp."],
      ["E se o paciente aprovar só uma parte?", "Na lista de orçamentos, use Aprovar e desmarque o que ficou de fora. Só os itens aprovados viram atendimentos."],
      ["Posso fazer duas opções para o mesmo paciente?", "Sim. Cada plano salvo gera um orçamento separado. Apresente os dois e aprove o que o paciente escolher."],
    ],
  },
  {
    group: "Atendimentos e dinheiro",
    items: [
      ["Qual a diferença entre atendido e recebido?", "Atendido é o que você já fez na cadeira. Recebido é o dinheiro que entrou. Um atendimento pode estar feito e ainda a receber — o Financeiro mostra os dois."],
      ["Atendi sem orçamento, e agora?", "Em Atendimentos, use Registrar atendimento: paciente, procedimento, valor e se já recebeu. Leva segundos."],
      ["Como lembro pacientes que pararam de vir?", "Em Agenda › Retornos aparecem os pacientes perto da data de voltar (6 meses por padrão, ou o prazo que você definir por procedimento). Um toque abre o WhatsApp com sua mensagem pronta, e você acompanha quem já foi contatado e quem agendou."],
      ["Por que o Resultado do mês é diferente do saldo do Caixa?", "O Resultado do mês é o que você recebeu menos as despesas lançadas no mês, pagas ou não. O saldo do Caixa conta só o dinheiro que de fato entrou e saiu da gaveta, incluindo o que sobrou de meses anteriores."],
      ["Para que serve a lista de espera?", "Para quem quer ser atendido antes. Quando uma consulta é cancelada, o horário aparece em Agenda › Lista de espera para você encaixar alguém."],
    ],
  },
  {
    group: "Seus dados",
    items: [
      ["Posso baixar tudo?", "Sim. Ajustes › Seus dados tem a exportação completa e a exportação de pacientes em planilha."],
      ["O que acontece se a assinatura vencer?", "Nada é apagado. Você continua entrando e consultando tudo; só não dá para registrar algo novo até renovar."],
    ],
  },
];

/** Perguntas da tela aberta, mostradas primeiro. Textos novos + perguntas do FAQ citadas pelo título. */
const ROUTE_HELP: [string, (string | [string, string])[]][] = [
  ["/plano", [
    ["Qual a diferença entre situação do dente e tratamento?", "A situação é o que você encontrou no exame (cárie, fratura, canal já feito). Ela fica registrada no odontograma, mas não entra no orçamento. O tratamento é o que você vai fazer, e é ele que vira item com valor."],
    "Como monto um plano?", "Posso fazer duas opções para o mesmo paciente?"]],
  ["/orcamentos", ["E se o paciente aprovar só uma parte?", "Posso fazer duas opções para o mesmo paciente?"]],
  ["/caixa", [
    ["O que é o valor de abertura?", "É o dinheiro que já estava na gaveta quando o dia começou (o troco). Ele entra no saldo do caixa, mas não é receita."],
    ["Como fecho o caixa do dia?", "No fim do dia, conte o dinheiro da gaveta e informe em Valor contado. O sistema mostra se sobrou ou faltou em relação ao saldo calculado."],
    "Por que o Resultado do mês é diferente do saldo do Caixa?"]],
  ["/financeiro", [
    ["O que entra em A receber?", "Todas as parcelas que ainda não foram pagas, vencidas ou não. Quando alguma já passou da data, o cartão fica em destaque."],
    "Por que o Resultado do mês é diferente do saldo do Caixa?", "Qual a diferença entre atendido e recebido?"]],
  ["/indicadores", [
    ["Inadimplência é o mesmo que A receber?", "Não. Inadimplência conta só as parcelas que já venceram e não foram pagas. A receber, no Financeiro, inclui também as que ainda vão vencer."],
    "Qual a diferença entre atendido e recebido?"]],
  ["/agenda", [
    ["Como confirmo as consultas de amanhã?", "Em Agenda › Confirmar, use Enviar ao próximo: o WhatsApp abre com a mensagem pronta para um paciente por vez, e quem já recebeu fica marcado."],
    "Para que serve a lista de espera?", "Como lembro pacientes que pararam de vir?"]],
  ["/atendimentos", ["Atendi sem orçamento, e agora?", "Qual a diferença entre atendido e recebido?"]],
  ["/pacientes", ["Como lembro pacientes que pararam de vir?", "Posso baixar tudo?"]],
  ["/ajustes", ["Posso baixar tudo?", "O que acontece se a assinatura vencer?"]],
];

function routeHelp(path?: string): [string, string][] {
  const hit = path && ROUTE_HELP.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  if (!hit) return [];
  const all = FAQ.flatMap((g) => g.items);
  return hit[1].flatMap((x) => typeof x === "string" ? all.filter(([q]) => q === x) : [x]);
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Buscar paciente, tela ou ação"],
  ["/", "Ir para a busca da tela (ou abrir a busca geral)"],
  ["?", "Abrir esta ajuda"],
  ["N", "Agenda: nova consulta · Pacientes: novo paciente"],
  ["T", "Agenda: voltar para hoje"],
  ["← →", "Agenda: dia ou semana anterior e seguinte"],
  ["A / P", "Ficha do paciente: agendar / novo plano"],
  ["E", "Caixa: lançar entrada"],
  ["S", "Caixa: lançar saída"],
];

function Item({ q, a, initial }: { q: string; a: string; initial?: boolean }) {
  const [open, setOpen] = useState(!!initial);
  const id = useId();
  return (
    <div className="rounded-md bg-surface-300">
      <h4>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
          {q}<ChevronDown aria-hidden className={cx("size-4 shrink-0 transition", open && "rotate-180")} />
        </button>
      </h4>
      <div id={id} hidden={!open} className="px-4 pb-3 text-sm text-ink-muted">{a}</div>
    </div>
  );
}

export function HelpModal({ open, onClose, onStartTour, question, path }: { open: boolean; onClose: () => void; onStartTour: () => void; question?: string; path?: string }) {
  const here = routeHelp(path);
  const hereQs = new Set(here.map(([q]) => q));
  return (
    <Modal open={open} onClose={onClose} title="Ajuda" subtitle="Respostas rápidas e contato direto.">
      <div className="space-y-5">
        {here.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">Sobre esta tela</h3>
            {here.map(([q, a], i) => <Item key={q + (q === question ? "-open" : "")} q={q} a={a} initial={q === question || (!question && i === 0)} />)}
          </section>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a href="https://wa.me/" target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-md bg-success-soft p-3 text-sm font-semibold">
            <MessageCircle aria-hidden className="size-5 text-success" />WhatsApp
          </a>
          <a href="mailto:suporte@exemplo.com" className="flex flex-col items-center gap-1 rounded-md bg-brand-soft p-3 text-sm font-semibold">
            <Mail aria-hidden className="size-5" />E-mail
          </a>
        </div>
        <div className="rounded-md bg-brand-soft p-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Smartphone aria-hidden className="size-4" />Instale no celular</p>
          <p className="text-xs text-ink-muted mt-1">No Chrome ou Safari, abra o menu do navegador e escolha “Adicionar à tela inicial”. O sistema abre como um app.</p>
        </div>
        <Button variant="secondary" onClick={onStartTour} className="w-full">Refazer o guia inicial</Button>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-muted">Atalhos de teclado</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-surface-300 p-4 text-sm">
            {SHORTCUTS.map(([k, d]) => <div key={k} className="contents"><dt><kbd className="rounded-sm border border-border-strong bg-surface-200 px-1.5 py-0.5 text-xs font-semibold">{k}</kbd></dt><dd>{d}</dd></div>)}
          </dl>
        </section>
        {FAQ.filter((g) => g.items.some(([q]) => !hereQs.has(q))).map((g) => (
          <section key={g.group} className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">{g.group}</h3>
            {g.items.filter(([q]) => !hereQs.has(q)).map(([q, a]) => <Item key={q + (q === question ? "-open" : "")} q={q} a={a} initial={q === question} />)}
          </section>
        ))}
      </div>
    </Modal>
  );
}
