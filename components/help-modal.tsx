"use client";

import { useId, useState } from "react";
import { ChevronDown, MessageCircle, Mail, Smartphone } from "lucide-react";
import { Modal, Button, cx } from "./ui";

const FAQ: { group: string; items: [string, string][] }[] = [
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
      ["Como lembro pacientes que pararam de vir?", "Em Agenda › Reativar aparecem os pacientes sem visita há mais de 30 dias. Um toque abre o WhatsApp com sua mensagem pronta."],
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

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-md bg-surface-sidebar">
      <h4>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
          {q}<ChevronDown aria-hidden className={cx("size-4 shrink-0 transition", open && "rotate-180")} />
        </button>
      </h4>
      <div id={id} hidden={!open} className="px-4 pb-3 text-sm text-muted">{a}</div>
    </div>
  );
}

export function HelpModal({ open, onClose, onStartTour }: { open: boolean; onClose: () => void; onStartTour: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Ajuda" subtitle="Respostas rápidas e contato direto.">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <a href="https://wa.me/" target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-md bg-surface-success-subtle p-3 text-sm font-semibold">
            <MessageCircle aria-hidden className="size-5 text-success" />WhatsApp
          </a>
          <a href="mailto:suporte@exemplo.com" className="flex flex-col items-center gap-1 rounded-md bg-surface-info-subtle p-3 text-sm font-semibold">
            <Mail aria-hidden className="size-5" />E-mail
          </a>
        </div>
        <div className="rounded-md bg-surface-accent-subtle p-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Smartphone aria-hidden className="size-4" />Instale no celular</p>
          <p className="text-xs text-muted mt-1">No Chrome ou Safari, abra o menu do navegador e escolha “Adicionar à tela inicial”. O sistema abre como um app.</p>
        </div>
        <Button variant="secondary" onClick={onStartTour} className="w-full">Refazer o guia inicial</Button>
        {FAQ.map((g) => (
          <section key={g.group} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.group}</h3>
            {g.items.map(([q, a]) => <Item key={q} q={q} a={a} />)}
          </section>
        ))}
      </div>
    </Modal>
  );
}
