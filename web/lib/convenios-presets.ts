// Convênios e planos com cobertura odontológica que costumam aparecer em Brasília/DF.
// Lista SUGERIDA: a clínica revisa antes de usar. Nenhum registro ANS foi confirmado, então `ans` fica vazio
// (confira em https://www.gov.br/ans, "Consulta de operadoras"). Não há ranking oficial de "mais usados" no DF.
//  - source "gdf": operadoras que o GDF/Secretaria de Economia lista para o plano odontológico dos servidores
//    (Ofício Circular SEEC/GDF nº 5/2025, SEI 168078402; economia.df.gov.br) ou o próprio GDF Saúde.
//  - source "geral": operadora de atuação nacional/conhecida; presença e rede no DF NÃO confirmadas em fonte oficial.
export type InsurerType = "odonto" | "saude_odonto" | "autogestao";

export interface InsurerPreset {
  name: string;
  type: InsurerType;
  ans: string;
  source: "gdf" | "geral";
}

const p = (name: string, type: InsurerType, source: InsurerPreset["source"]): InsurerPreset => ({ name, type, ans: "", source });

export const CONVENIOS_DF: InsurerPreset[] = [
  p("Prevident", "odonto", "gdf"),
  p("Odontogroup", "odonto", "gdf"),
  p("Odont", "odonto", "gdf"),
  p("Dental Uni", "odonto", "gdf"),
  p("Sempre Odonto", "odonto", "gdf"),
  p("Quallity Pro Saúde", "odonto", "gdf"),
  p("GDF Saúde", "autogestao", "gdf"),
  p("Odontoprev", "odonto", "geral"),
  p("Bradesco Dental", "odonto", "geral"),
  p("Amil Dental", "odonto", "geral"),
  p("SulAmérica Odonto", "odonto", "geral"),
  p("Porto Seguro Odonto", "odonto", "geral"),
  p("MetLife Dental", "odonto", "geral"),
  p("Caixa Seguradora Odonto", "odonto", "geral"),
  p("Uniodonto Brasília", "odonto", "geral"),
  p("Unimed Brasília (com odonto)", "saude_odonto", "geral"),
  p("Interodonto", "odonto", "geral"),
  p("Odonto Empresas", "odonto", "geral"),
  p("Odontosystem", "odonto", "geral"),
  p("Sorridents", "odonto", "geral"),
  p("Brasil Dental", "odonto", "geral"),
  p("Amo Docs", "odonto", "geral"),
  p("CAPESESP", "autogestao", "geral"),
  p("Cassi", "autogestao", "geral"),
  p("GEAP Saúde", "autogestao", "geral"),
  p("Saúde Caixa", "autogestao", "geral"),
  p("Assefaz", "autogestao", "geral"),
  p("Plan-Assiste (MPU)", "autogestao", "geral"),
  p("Fusex / Pró-Social", "autogestao", "geral"),
];

export const INSURER_TYPE_LABEL: Record<InsurerType, string> = {
  odonto: "Odontológico exclusivo", saude_odonto: "Saúde com odonto", autogestao: "Autogestão",
};

export const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
