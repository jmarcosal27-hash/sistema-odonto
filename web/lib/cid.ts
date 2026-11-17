// Sugestões de CID (datalist do formulário) para atestado odontológico: poucos códigos comuns do capítulo de
// dentes e boca da CID-10, com descrições escritas pelo SmillicOS (não é a tabela oficial).
// A busca é a do próprio navegador sobre código e descrição. O campo continua livre: qualquer outro código pode ser digitado.

export interface CidOption { code: string; label: string }

export const CID_OPTIONS: CidOption[] = [
  { code: "K00.6", label: "Alteração na erupção dos dentes" },
  { code: "K01.1", label: "Dente incluso (impactado)" },
  { code: "K02.0", label: "Cárie limitada ao esmalte" },
  { code: "K02.1", label: "Cárie que atinge a dentina" },
  { code: "K02.2", label: "Cárie que atinge o cemento" },
  { code: "K02.9", label: "Cárie dentária sem outra especificação" },
  { code: "K03.0", label: "Desgaste excessivo dos dentes" },
  { code: "K03.8", label: "Outra alteração especificada dos tecidos duros do dente" },
  { code: "K04.0", label: "Inflamação da polpa (pulpite)" },
  { code: "K04.1", label: "Morte da polpa (necrose)" },
  { code: "K04.5", label: "Inflamação crônica na ponta da raiz" },
  { code: "K04.6", label: "Abscesso na ponta da raiz com fístula" },
  { code: "K04.7", label: "Abscesso na ponta da raiz sem fístula" },
  { code: "K05.0", label: "Gengivite aguda" },
  { code: "K05.1", label: "Gengivite crônica" },
  { code: "K05.3", label: "Periodontite crônica" },
  { code: "K06.0", label: "Retração gengival" },
  { code: "K07.6", label: "Dor ou disfunção da articulação da mandíbula (ATM)" },
  { code: "K08.1", label: "Perda de dentes por acidente, extração ou doença" },
  { code: "K08.8", label: "Outra alteração especificada dos dentes e do suporte" },
  { code: "K10.2", label: "Inflamação dos ossos da mandíbula" },
  { code: "K12.0", label: "Aftas recorrentes na boca" },
  { code: "K13.7", label: "Lesão da mucosa da boca" },
  { code: "S02.5", label: "Fratura de dente" },
  { code: "S03.2", label: "Luxação de dente" },
];

export const cidLabel = (code: string) => CID_OPTIONS.find((o) => o.code.toLowerCase() === code.trim().toLowerCase())?.label;
