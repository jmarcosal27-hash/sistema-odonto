import type { MedicationRoute } from "./types";

// Presets sugeridos: nomes e posologias usuais de consultório, SEM preços.
// Tudo é ponto de partida editável; a responsabilidade clínica é do dentista.

/** Acrescentados ao fim de cada especialidade/grupo de catalog.ts (ids antigos não mudam). Duplicados por nome são ignorados. */
export const EXTRA_PROCEDURES: Record<string, Record<string, string[]>> = {
  geral: {
    "Avaliação": ["Consulta de emergência", "Teleorientação", "Atestado e relatório odontológico", "Anamnese e exame clínico completo", "Planejamento do tratamento"],
    "Prevenção": ["Profilaxia com jato de bicarbonato", "Remoção de cálculo (tártaro)", "Aplicação tópica de flúor – verniz", "Aplicação tópica de flúor – gel", "Dessensibilização dentária", "Educação em saúde bucal", "Controle de biofilme", "Aplicação de verniz de clorexidina"],
  },
  dentistica: {
    "Restaurações": [
      "Restauração em resina – classe I", "Restauração em resina – classe II", "Restauração em resina – classe III", "Restauração em resina – classe IV", "Restauração em resina – classe V",
      "Restauração em resina – face oclusal", "Restauração em resina – face mesial", "Restauração em resina – face distal", "Restauração em resina – face vestibular", "Restauração em resina – face lingual/palatina",
      "Restauração em ionômero de vidro", "Restauração em amálgama", "Restauração atraumática (ART)", "Capeamento pulpar direto", "Capeamento pulpar indireto", "Forramento com hidróxido de cálcio",
      "Restauração de lesão cervical não cariosa", "Reconstrução de dente fraturado em resina", "Reparo de restauração", "Polimento de restauração", "Ajuste e acabamento de restauração",
      "Núcleo de preenchimento em resina", "Núcleo de preenchimento em ionômero", "Selamento de cavidade", "Remoção de tecido cariado", "Remoção de restauração antiga",
    ],
    "Estética": [
      "Faceta em resina composta (indireta)", "Faceta em porcelana", "Clareamento caseiro supervisionado", "Clareamento de dente não vital", "Clareamento combinado (consultório + caseiro)",
      "Microabrasão do esmalte", "Remodelação estética (gengivo-dentária)", "Recontorno cosmético", "Fechamento de diastema com resina", "Restauração estética anterior",
      "Reanatomização de dente conoide", "Acabamento e polimento estético",
    ],
  },
  endo: {
    "Canal": [
      "Canal – dente unirradicular (incisivo/canino)", "Canal – pré-molar", "Canal – molar", "Canal – molar com 4 ou mais canais", "Retratamento – unirradicular", "Retratamento – birradicular", "Retratamento – multirradicular",
      "Urgência endodôntica – abertura e drenagem", "Pulpectomia", "Biopulpectomia", "Necropulpectomia", "Troca de medicação intracanal", "Obturação de canal", "Remoção de instrumento fraturado",
      "Remoção de pino ou núcleo", "Tratamento de perfuração radicular", "Apicificação", "Apicectomia com obturação retrógrada", "Clareamento interno (dente tratado)", "Radiografia de odontometria", "Radiografia de conduta",
      "Selamento coronário provisório", "Capeamento pulpar em endodontia", "Tratamento de reabsorção radicular",
    ],
  },
  perio: {
    "Tratamento": [
      "Raspagem e alisamento radicular – por sextante", "Raspagem supragengival – arcada completa", "Raspagem subgengival – arcada completa", "Raspagem a campo aberto", "Curetagem gengival",
      "Cirurgia periodontal ressectiva", "Cirurgia de aumento de coroa clínica", "Enxerto gengival livre", "Enxerto de tecido conjuntivo", "Recobrimento radicular", "Regeneração tecidual guiada",
      "Gengivoplastia estética", "Gengivectomia por dente", "Frenectomia labial", "Frenectomia lingual", "Controle de periodontite aguda (abscesso periodontal)", "Tratamento de gengivite ulcerativa necrosante",
      "Tratamento periodontal não cirúrgico completo", "Reavaliação periodontal", "Terapia fotodinâmica periodontal", "Splintagem (contenção de dentes com mobilidade)", "Ajuste oclusal periodontal",
    ],
  },
  cirurgia: {
    "Extrações": [
      "Exodontia simples de dente permanente", "Exodontia complexa (com retalho/odontosecção)", "Exodontia de siso incluso", "Exodontia de canino incluso", "Exodontia de dente supranumerário",
      "Exodontia de dente decíduo", "Exodontia de múltiplos dentes", "Remoção de resto radicular", "Reimplante dentário", "Tracionamento cirúrgico de dente incluso", "Cirurgia de dente retido",
    ],
    "Outros": [
      "Apicectomia", "Cistectomia", "Remoção de cisto odontogênico", "Biópsia incisional", "Biópsia excisional", "Frenectomia labial superior", "Frenectomia lingual", "Aprofundamento de vestíbulo",
      "Exérese de mucocele", "Exérese de lesão de tecido mole", "Remoção de torus palatino ou mandibular", "Regularização de rebordo alveolar", "Cirurgia pré-protética", "Redução de fratura dentoalveolar", "Tratamento de alveolite",
      "Hemostasia pós-operatória", "Sutura de ferimento bucal", "Remoção de sutura", "Tratamento de comunicação buco-sinusal",
    ],
  },
  protese: {
    "Fixa": [
      "Coroa em zircônia", "Coroa em dissilicato de lítio (e.max)", "Coroa provisória em acrílico", "Coroa metalocerâmica – por elemento", "Coroa total metálica",
      "Faceta em dissilicato de lítio", "Onlay cerâmico", "Inlay cerâmico", "Onlay em resina", "Inlay em resina", "Pino metálico pré-fabricado",
      "Ponte fixa metalocerâmica – por elemento", "Ponte fixa em zircônia – por elemento", "Prótese adesiva (Maryland)", "Cimentação de coroa", "Recimentação de coroa", "Remoção de coroa", "Moldagem de trabalho",
      "Prova de infraestrutura", "Prova estética", "Ajuste de contatos oclusais de prótese fixa",
    ],
    "Removível": [
      "Prótese total superior", "Prótese total inferior", "Prótese total imediata", "Prótese parcial removível – grampos", "Prótese parcial removível – encaixe de precisão", "Prótese parcial provisória (flipper)",
      "Reembasamento direto", "Reembasamento indireto", "Conserto de prótese – fratura", "Reparo de dente em prótese", "Ajuste de prótese removível", "Recondicionamento tecidual", "Moldagem funcional",
      "Registro de relação maxilomandibular", "Prova de dentes em cera",
    ],
  },
  implante: {
    "Implantes": [
      "Cirurgia de implante – 1 fixação", "Cirurgia de implante imediato", "Cirurgia de implante guiada", "Reabertura de implante", "Instalação de cicatrizador", "Moldagem de transferência (implante)",
      "Prótese provisória sobre implante", "Coroa sobre implante – metalocerâmica", "Coroa sobre implante – zircônia", "Prótese parcial fixa sobre implantes", "Protocolo total superior", "Protocolo total inferior",
      "Enxerto ósseo particulado", "Enxerto ósseo em bloco", "Regeneração óssea guiada com membrana", "Levantamento de seio – via lateral", "Levantamento de seio – via crestal", "Preservação alveolar", "Enxerto de tecido mole peri-implantar",
      "Manutenção de implante", "Tratamento de peri-implantite", "Remoção de implante", "Planejamento digital de implante",
    ],
  },
  orto: {
    "Aparelhos": [
      "Aparelho fixo metálico – instalação", "Aparelho fixo estético (cerâmico) – instalação", "Aparelho autoligado – instalação", "Aparelho lingual – instalação", "Alinhadores transparentes – planejamento",
      "Alinhadores transparentes – por etapa", "Manutenção mensal – aparelho fixo", "Manutenção mensal – aparelho estético", "Manutenção mensal – autoligado", "Aparelho ortopédico funcional", "Expansor palatino", "Disjuntor palatino (Hyrax)",
      "Mantenedor de espaço fixo", "Mantenedor de espaço removível", "Mini-implante ortodôntico", "Recolagem de braquete", "Troca de arco", "Contenção removível (placa de Hawley)", "Contenção removível transparente", "Contenção fixa 3x3",
      "Remoção do aparelho fixo", "Telerradiografia cefalométrica e traçado", "Análise cefalométrica", "Moldagem para estudo ortodôntico", "Ortodontia interceptora",
    ],
  },
  odontoped: {
    "Infantil": [
      "Aplicação de flúor – criança", "Aplicação de selante – por dente", "Restauração em resina – dente decíduo", "Restauração em ionômero – dente decíduo", "Pulpotomia – dente decíduo", "Pulpectomia – dente decíduo",
      "Coroa de aço em dente decíduo", "Coroa de acetato em dente decíduo", "Capeamento pulpar – dente decíduo", "Exodontia de dente decíduo", "Reabilitação de dentes anteriores decíduos",
      "Condicionamento infantil (adaptação)", "Orientação aos pais e responsáveis", "Controle de hábitos bucais", "Profilaxia infantil", "Atendimento de trauma dentário", "Reimplante de dente avulsionado", "Contenção de dente traumatizado",
      "Aplicação de cariostático (diamino fluoreto de prata)", "Tratamento restaurador atraumático (ART)", "Sedação com óxido nitroso",
    ],
  },
  radio: {
    "Exames": [
      "Radiografia periapical – por dente", "Radiografia periapical – boca toda (série)", "Radiografia interproximal (bite-wing)", "Radiografia oclusal", "Radiografia panorâmica de maxila e mandíbula", "Radiografia de ATM",
      "Telerradiografia lateral", "Tomografia computadorizada – região", "Tomografia computadorizada – maxila e mandíbula", "Tomografia de ATM", "Modelo de estudo", "Escaneamento intraoral", "Fotografias clínicas (documentação)",
      "Laudo radiográfico", "Laudo tomográfico",
    ],
  },
  dtm: {
    "Tratamento": ["Placa miorrelaxante – confecção", "Ajuste de placa miorrelaxante", "Placa de estabilização", "Reembasamento de placa", "Terapia com laser de baixa potência", "Aplicação de toxina botulínica (DTM)", "Acupuntura / agulhamento seco", "Orientações e exercícios para DTM", "Infiltração em ponto-gatilho", "Avaliação de dor orofacial", "Avaliação de bruxismo"],
  },
  estomato: {
    "Diagnóstico": ["Biópsia de mucosa oral", "Citologia esfoliativa", "Aplicação de laser em lesão oral", "Tratamento de candidíase oral", "Tratamento de herpes labial", "Avaliação de lesão suspeita (câncer bucal)", "Controle de xerostomia", "Tratamento de líquen plano oral"],
  },
  odontogeriatria: {
    "Cuidados": ["Higienização de prótese", "Orientação ao cuidador", "Tratamento de estomatite protética", "Avaliação de xerostomia no idoso", "Visita domiciliar odontológica"],
  },
};

export interface MedPreset { name: string; route: MedicationRoute; controlled: boolean; unit?: string; posology: string }
const I = "internal" as const, E = "external" as const;
const m = (name: string, route: MedicationRoute, unit: string | undefined, posology: string, controlled = false): MedPreset => ({ name, route, controlled, unit, posology });

export const MEDICATIONS_DISCLAIMER = "As posologias são sugestões editáveis e não substituem a avaliação clínica. Revise dose, duração e contraindicações (alergias, gestação, função renal/hepática, interações). A responsabilidade da prescrição é do dentista.";

export const PRESET_MEDICATIONS: MedPreset[] = [
  // Antibióticos
  m("Amoxicilina 500 mg", I, "cápsula", "1 cápsula via oral a cada 8 horas por 7 dias."),
  m("Amoxicilina 875 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 7 dias."),
  m("Amoxicilina 500 mg + clavulanato de potássio 125 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 7 dias."),
  m("Amoxicilina 875 mg + clavulanato de potássio 125 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 7 dias."),
  m("Amoxicilina 500 mg (profilaxia pré-procedimento)", I, "cápsula", "4 cápsulas (2 g) via oral, dose única, 30 a 60 minutos antes do procedimento."),
  m("Azitromicina 500 mg", I, "comprimido", "1 comprimido via oral 1 vez ao dia por 3 dias."),
  m("Claritromicina 500 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 7 dias."),
  m("Clindamicina 300 mg", I, "cápsula", "1 cápsula via oral a cada 6 horas por 7 dias."),
  m("Metronidazol 250 mg", I, "comprimido", "2 comprimidos via oral a cada 8 horas por 7 dias. Evitar álcool durante o uso e por 48 horas após."),
  m("Metronidazol 400 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 7 dias. Evitar álcool durante o uso."),
  m("Cefalexina 500 mg", I, "cápsula", "1 cápsula via oral a cada 6 horas por 7 dias."),
  m("Cefadroxila 500 mg", I, "cápsula", "1 cápsula via oral a cada 12 horas por 7 dias."),
  // Anti-inflamatórios e analgésicos
  m("Ibuprofeno 600 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 3 dias, após as refeições."),
  m("Ibuprofeno 400 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 3 dias, após as refeições."),
  m("Nimesulida 100 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 3 dias, após as refeições."),
  m("Cetoprofeno 100 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 3 dias, após as refeições."),
  m("Diclofenaco potássico 50 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 3 dias, após as refeições."),
  m("Diclofenaco sódico 50 mg", I, "comprimido", "1 comprimido via oral a cada 8 a 12 horas por 3 dias, após as refeições."),
  m("Naproxeno sódico 550 mg", I, "comprimido", "1 comprimido via oral a cada 12 horas por 3 dias, após as refeições."),
  m("Etoricoxibe 90 mg", I, "comprimido", "1 comprimido via oral 1 vez ao dia por 3 dias."),
  m("Paracetamol 500 mg", I, "comprimido", "1 a 2 comprimidos via oral a cada 6 a 8 horas, se dor. Máximo de 4 g por dia."),
  m("Paracetamol 750 mg", I, "comprimido", "1 comprimido via oral a cada 6 a 8 horas, se dor. Máximo de 4 g por dia."),
  m("Dipirona sódica 500 mg", I, "comprimido", "1 a 2 comprimidos via oral a cada 6 horas, se dor ou febre."),
  m("Dipirona sódica 1 g", I, "comprimido", "1 comprimido via oral a cada 6 a 8 horas, se dor ou febre."),
  m("Dipirona sódica 500 mg/mL gotas", I, "frasco", "20 a 40 gotas via oral a cada 6 horas, se dor ou febre."),
  m("Tramadol 50 mg", I, "cápsula", "1 cápsula via oral a cada 8 horas, se dor intensa, por até 3 dias. Pode causar sonolência.", true),
  m("Codeína 30 mg + paracetamol 500 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas, se dor intensa, por até 3 dias. Pode causar sonolência.", true),
  // Corticoides
  m("Dexametasona 4 mg", I, "comprimido", "Pós-cirúrgico: 1 comprimido via oral 1 vez ao dia por 2 a 3 dias, ou conforme esquema definido pelo dentista."),
  m("Prednisona 20 mg", I, "comprimido", "1 comprimido via oral pela manhã, após o café, por 3 a 5 dias."),
  m("Prednisolona 20 mg", I, "comprimido", "1 comprimido via oral pela manhã, após o café, por 3 a 5 dias."),
  m("Betametasona 0,5 mg", I, "comprimido", "Conforme esquema definido pelo dentista, por 2 a 3 dias."),
  // Uso tópico, bochechos e antivirais/antifúngicos
  m("Clorexidina 0,12 % solução bucal", E, "frasco", "Bochechar 15 mL por 30 segundos, 2 vezes ao dia, por 7 a 14 dias. Não engolir."),
  m("Clorexidina 0,2 % solução bucal", E, "frasco", "Bochechar 10 a 15 mL por 1 minuto, 2 vezes ao dia, por 7 dias. Não engolir."),
  m("Clorexidina gel 0,2 %", E, "tubo", "Aplicar sobre a região 2 vezes ao dia por 7 dias."),
  m("Nistatina 100.000 UI/mL suspensão oral", E, "frasco", "Bochechar 4 a 6 mL, reter por 2 minutos e engolir, 4 vezes ao dia, por 14 dias."),
  m("Fluconazol 150 mg", I, "cápsula", "1 cápsula via oral 1 vez ao dia por 7 a 14 dias, conforme esquema definido pelo dentista."),
  m("Miconazol gel oral 20 mg/g", E, "tubo", "Aplicar sobre a lesão 4 vezes ao dia por 14 dias."),
  m("Aciclovir 200 mg", I, "comprimido", "1 comprimido via oral 5 vezes ao dia (a cada 4 horas, sem acordar à noite) por 5 a 7 dias."),
  m("Aciclovir 400 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 7 dias."),
  m("Aciclovir creme 50 mg/g", E, "bisnaga", "Aplicar sobre a lesão labial 5 vezes ao dia por 5 dias."),
  m("Lidocaína gel 2 % (anestésico tópico)", E, "tubo", "Aplicar pequena quantidade sobre a região dolorida, até 3 vezes ao dia."),
  m("Benzocaína 20 % gel (anestésico tópico)", E, "pote", "Aplicar pequena quantidade na mucosa antes da injeção ou sobre a região dolorida."),
  m("Triancinolona 0,1 % orabase", E, "tubo", "Aplicar fina camada sobre a lesão 2 a 3 vezes ao dia, após as refeições e à noite."),
  m("Benzidamina 0,15 % solução bucal", E, "frasco", "Bochechar 15 mL, 2 a 3 vezes ao dia, por até 7 dias."),
  m("Solução fluoretada de NaF 0,05 % (bochecho diário)", E, "frasco", "Bochechar 10 mL por 1 minuto, 1 vez ao dia, à noite. Não ingerir nada por 30 minutos."),
  m("Solução fluoretada de NaF 0,2 % (bochecho semanal)", E, "frasco", "Bochechar 10 mL por 1 minuto, 1 vez por semana. Não ingerir nada por 30 minutos."),
  m("Dentifrício com 5.000 ppm de flúor", E, "tubo", "Escovar 1 vez ao dia, à noite, sem enxaguar em seguida."),
  m("Dentifrício dessensibilizante (nitrato de potássio)", E, "tubo", "Escovar 2 vezes ao dia por 4 semanas, deixando um pouco de pasta sobre a região sensível."),
  m("Saliva artificial (spray)", E, "frasco", "Borrifar na boca conforme necessidade, várias vezes ao dia."),
  // Ansiolíticos (controlados) e outros
  m("Diazepam 5 mg", I, "comprimido", "1 comprimido via oral na noite anterior e 1 hora antes do procedimento. Não dirigir após o uso.", true),
  m("Diazepam 10 mg", I, "comprimido", "1/2 a 1 comprimido via oral 1 hora antes do procedimento. Não dirigir após o uso.", true),
  m("Midazolam 7,5 mg", I, "comprimido", "1 comprimido via oral 30 a 60 minutos antes do procedimento. Vir com acompanhante. Não dirigir após o uso.", true),
  m("Midazolam 15 mg", I, "comprimido", "1/2 a 1 comprimido via oral 30 a 60 minutos antes do procedimento. Vir com acompanhante.", true),
  m("Alprazolam 0,5 mg", I, "comprimido", "1 comprimido via oral 1 hora antes do procedimento. Não dirigir após o uso.", true),
  m("Clonazepam 0,5 mg", I, "comprimido", "Conforme esquema definido pelo dentista (ansiedade/bruxismo), à noite.", true),
  m("Ciclobenzaprina 5 mg", I, "comprimido", "1 comprimido via oral à noite por 7 dias (dor muscular/DTM). Pode causar sonolência."),
  m("Ciclobenzaprina 10 mg", I, "comprimido", "1 comprimido via oral à noite por 7 dias (dor muscular/DTM). Pode causar sonolência."),
  m("Ondansetrona 4 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas, se náusea, por até 2 dias."),
  m("Metoclopramida 10 mg", I, "comprimido", "1 comprimido via oral até 3 vezes ao dia, se náusea, por até 2 dias."),
  m("Omeprazol 20 mg", I, "cápsula", "1 cápsula via oral em jejum, 1 vez ao dia, durante o uso do anti-inflamatório."),
  m("Loratadina 10 mg", I, "comprimido", "1 comprimido via oral 1 vez ao dia por 3 a 5 dias (alergia/edema)."),
  m("Dexclorfeniramina 2 mg", I, "comprimido", "1 comprimido via oral a cada 8 horas por 3 dias. Pode causar sonolência."),
  m("Ácido tranexâmico 250 mg", I, "comprimido", "Conforme esquema definido pelo dentista, por até 5 dias (sangramento pós-extração)."),
];
