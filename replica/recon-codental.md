# Recon: Codental, módulo do paciente (web)

Scope: ficha do paciente (Visão geral até Arquivos), com foco em documentos (prescrição, atestado, modelos), medicamentos, anamnese e arquivos.
For: SmileOS (Onda B: prontuário, documentos e arquivos).
Date: 2026-11-14

> **AVISO DE TERMOS DE USO (ler antes de usar este recon).** Os termos públicos
> do Codental (https://www.codental.com.br/termos-de-uso), cláusula 12.2, proíbem
> usar a plataforma para: (i) engenharia reversa, (iv) "criar novos aplicativos,
> módulos, produtos ou serviços utilizando a plataforma ou qualquer parte dela" e
> (vii) usar a propriedade intelectual para obras derivadas. A cláusula 13.5.2
> protege "conteúdos da plataforma, programas e bancos de dados". Este recon foi
> feito na conta de teste do usuário, em modo só leitura, sem ler código, sem ver
> rede e sem copiar conteúdo. Mesmo assim, **o risco contratual existe** (a conta
> é de uma clínica de teste, em nome de terceiro, com o e-mail do usuário como
> profissional convidado). Recomendação: tratar este documento como inspiração
> de funcionalidades genéricas do setor, escrever textos, modelos e banco de
> medicamentos próprios, e **não fazer mais recons nessa conta**. Nada foi aceito,
> salvo, emitido, enviado ou baixado.
>
> Dados pessoais (LGPD): o "paciente de exemplo" da conta tem telefone e e-mail
> reais da clínica; por isso **nenhuma tela com cabeçalho de paciente foi salva**.
> Os 5 prints em `screens/codental-*.jpg` são recortes sem dados pessoais.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | conta de teste do usuário (app) | https://app.codental.com.br/ | paciente de exemplo, 1 orçamento aprovado, 2 tratamentos, 1 evolução automática, 1 anamnese; documentos e arquivos vazios |
| 2 | termos de uso (público) | https://www.codental.com.br/termos-de-uso | lidos sem aceitar; cláusulas 5.4, 10.1, 12.2, 13.4 relevantes |
| 3 | site público | https://www.codental.com.br/ | rodapé cita "Receita digital", "Prontuário digital", "Anamnese inteligente", "Contrato Odontológico" |
| 4 | ajuda (guias de documentos, arquivos, assinatura) | linkados nas telas ("passo a passo") | **não abertos** neste recon; ficam como próxima fonte pública |

Não vistos: Política de Privacidade, central de ajuda, vídeos, app mobile, planos (exceto avisos de limite dentro do app).

## Core loop

Dentista abre a ficha, vê o odontograma e a linha do tempo, registra a evolução e emite receita/atestado/contrato em segundos, com campos do paciente e da clínica preenchidos sozinhos.

## Screens

Rota base: `/patients/:id`. IDs C01...

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| C01 | Lista de pacientes | `/patients` | achar paciente | busca, Aniversariantes, Retornos semestrais, filtro por categoria, exportar Excel/CSV, cadastrar | filled (2 itens) |
| C02 | Cabeçalho do paciente (fixo em todas as abas) | topo de C03..C12 | identidade e atalhos | foto (alterar), nome, selo "Alerta de saúde" (vem da anamnese), selo aniversário, WhatsApp, copiar telefone/CPF, idade, "Categorizar", adicionar retorno, Editar | filled |
| C03 | Visão geral | `/patients/:id` | resumo | odontograma permanente/decíduo, tarefas do paciente, bloco de notas livre (salva sozinho), informações cadastrais, últimas evoluções, histórico de consultas, mensagens (WhatsApp), consulta Serasa (créditos), pesquisa de satisfação | filled, vazio por bloco |
| C04 | Editar paciente | `/patients/:id/edit` | dados cadastrais | ver "Dados cadastrais"; botão "Link para o paciente preencher"; Excluir | filled |
| C05 | Anamneses (lista) | `/patients/:id/anamneses` | fichas do paciente | lista, "Preencher anamnese", "Solicitar assinatura", menu Editar/Imprimir/Excluir, dica de modelos | filled |
| C06 | Preencher anamnese | `/patients/:id/anamneses/new` | responder | seletor de modelo (4 prontos + criar), "Enviar para paciente responder", perguntas, Imprimir, Salvar respostas | vazio |
| C07 | Pré-visualização de solicitação de assinatura | modal de C05 | pedir assinatura do paciente | documento A4 (clínica, data, dados do paciente, tabela pergunta/resposta), "Solicitar assinatura do paciente" | filled |
| C08 | Orçamentos | `/patients/:id/quotes` | propostas | lista expansível (itens, entrada, parcelas, subtotal, desconto, total), status Aprovado, menu: Gerar contrato, Duplicar, Desfazer aprovação, Imprimir, Enviar por WhatsApp, Excluir | filled |
| C09 | Tratamentos | `/patients/:id/procedures` | execução | odontograma (Finalizado verde, Em aberto laranja, dente ausente com X), modal "Adicionar tratamento", cartões por tratamento (dente, status, preço de tabela riscado + preço final, dentista, link ao orçamento, evoluções, "Finalizar", "+ Evoluir") | filled |
| C10 | Pagamentos | `/patients/:id/debts` | recebíveis | totais pago/a receber, filtro por período e por status (Pagos, Aguardando, Em aberto, Em atraso), parcelas "1/3, 2/3", Pagar por parcela, seleção múltipla | filled |
| C11 | Evoluções | `/patients/:id/evolutions` | prontuário | formulário (profissional, data, editor de texto rico, imagens 0/20, "Transcrever com IA", "Melhorar com IA", "Assinar evolução"), histórico por mês, "Assinar digitalmente", Imprimir | filled |
| C12 | Documentos | `/patients/:id/documents` | receitas, atestados, personalizados | botões: Prescrição inteligente, Emitir prescrição, Emitir atestado, Personalizar; lista | empty (print 01) |
| C13 | Emitir receita | modal de C12 | prescrever | ver "Receita" | vazio |
| C14 | Prescrição inteligente | modal de C12 | prescrição assistida (provável IA) | barrou em "Atualizar dados pessoais": exige nº CRO, CRO/UF, CPF e nascimento do profissional | bloqueado por cadastro incompleto |
| C15 | Emitir atestado | modal de C12 | atestado | ver "Atestado" | vazio |
| C16 | Documento personalizado | `/patients/:id/custom_documents/new` | contratos, termos | título, editor de texto rico, "Modelos salvos" (5 de fábrica), termos-chave, assinatura do profissional/paciente, Salvar modelo, Gerar documento | vazio (print 03) |
| C17 | Termos-chave | modal de C16 | variáveis | ver "Variáveis" (print 02) | filled |
| C18 | Arquivos | `/patients/:id/uploads` | anexos e pastas | "Adicionar" com 2 opções: Arquivos (fotos, vídeos, documentos) e Pasta (organizar) | empty (print 04) |
| C19 | Modelos de anamnese | `/anamneses` (Configurações gerais) | modelos da clínica | 4 modelos de fábrica (padrão, cirurgia/implante, infantil, ortodôntica), "Criar modelo" (copiar de outro ou do zero) | filled (print 05) |
| C20 | Editor de modelo de anamnese | `/anamneses/:id/edit` | perguntas | busca, "tornar padrão", arrastar para reordenar, ativo/inativo, editar, remover, "Adicionar pergunta" | filled |
| C21 | Nova pergunta | modal de C20 | perguntas | texto, tipo de resposta (3 tipos), "exibir alerta no prontuário", "adicionar em todos os modelos" | vazio |
| C22 | Configurações gerais | `/settings` | hub | 6 cartões: clínica (`/establishment/edit`), profissionais (`/professionals`), taxas de maquininhas, mensagens, convênios, modelos de anamnese | filled |
| C23 | Profissionais | `/professionals` | equipe | colunas Nome, E-mail, CRO, Tipo (Dentista) | filled |

Observação: **não existe tela de cadastro/banco de medicamentos nas Configurações.** Medicamentos são criados na hora, dentro da receita (C13), e reaparecem no autocomplete. Modelos de receita ficam em "Modelos salvos" do próprio modal.

Não encontrado nesta conta: aba de Imagens/radiografias separada (imagens ficam em Arquivos e dentro de Evoluções); termo LGPD aparece só como modelo de documento.

## Flows

```
CF01 Emitir receita
    C12 -> "Emitir prescrição" -> C13 (profissional, data) -> [modelo salvo] ou digitar nome do medicamento
    -> escolher do autocomplete ou "Cadastrar novo medicamento" (uso interno/externo, controlado) -> quantidade + medida + posologia
    -> "Adicionar à receita" (repete) -> "Gerar receita" (imprime/PDF)
    happy path clicks: ~7 para 1 medicamento (abrir, nome, escolher, quantidade, medida, posologia, adicionar, gerar)
    edge: sem modelos salvos, medicamento novo, controlado, lista vazia, profissional sem CRO
    não testado: tela do documento gerado, salvar como modelo

CF02 Emitir atestado
    C12 -> "Emitir atestado" -> C15 (dias OU horas) -> data, CID opcional, quantidade de dias OU hora início/fim -> "Gerar atestado"
    happy path clicks: ~5
    edge: atestado para horas (início/término), CID pesquisável por código ou nome

CF03 Documento personalizado (contrato/termo)
    C12 -> "Personalizar" -> C16 -> escolher modelo de fábrica ou escrever -> variáveis %...% -> marcar assinatura profissional/paciente
    -> "Gerar documento" (ou "Salvar modelo de documento")
    happy path clicks: ~4 com modelo

CF04 Anamnese
    C05 -> "Preencher anamnese" -> C06 (trocar modelo) -> responder (Sim/Não/Não sei + info adicional) -> Salvar respostas
    alternativa: "Enviar para paciente responder" (link) ; depois "Solicitar assinatura" (C07)
    efeito: perguntas marcadas como alerta geram o selo "Alerta de saúde" no cabeçalho (C02)

CF05 Tratamento -> evolução automática
    C09 -> "Finalizar" tratamento -> cria evolução "X foi finalizado" na C11/C03 (ligada ao tratamento, dente e orçamento)
    ou C09 "+ Evoluir" / C11 formulário manual

CF06 Orçamento -> contrato
    C08 -> menu "Gerar contrato" (não aberto) ; "Enviar por WhatsApp"

CF07 Arquivos
    C18 -> "Adicionar" -> Arquivos (seletor do sistema) ou Pasta (não abertos para não fazer upload)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Abas do paciente (barra fixa que acompanha a rolagem) | 8 abas, badge numérico em Pagamentos | ativa, com pendência | C03..C18 |
| Odontograma (permanente / decíduo) | arcadas superior/inferior, 4 faces por dente | finalizado, em aberto, ausente (X), sem registro | C03, C09 |
| Modal | pequeno (atestado), grande com rolagem (receita), popup de ajuda | aberto, Escape fecha tudo | C13..C17, C21 |
| Editor de texto rico | negrito, itálico, tachado, alinhamento, listas, desfazer; extras na evolução (link, imagem, IA) | vazio | C11, C16 |
| Autocomplete com "cadastrar novo" | nome do medicamento (texto fantasma de sugestão), tratamento | sugerindo, sem resultado | C13, C09 modal |
| Select com busca de CID | código ou nome | vazio | C15 |
| Rádio de tipo | dias/horas; uso interno/externo | — | C15, C13 |
| Toggle | controlado, ativo, alerta no prontuário, assinar evolução, padrão | on/off | C13, C20, C21, C11 |
| Cartão de lista com menu "⋮" | orçamento, anamnese, tratamento | expandido, recolhido | C05, C08, C09 |
| Badge de status | Aprovado, Em aberto, Finalizado, Em atraso, Confirmada | — | C08..C10 |
| Banner de dica fechável | azul | visível/fechado | C05, C11 |
| Estado vazio com ilustração | por aba | — | C12, C18 |

## Dados cadastrais (C04, só rótulos)

Nome; celular (+55) com lembretes automáticos (não enviar / WhatsApp / SMS); e-mail; telefone fixo; como conheceu a clínica; profissão; gênero (4 opções); paciente estrangeiro (troca CPF por "Documento"); nascimento; CPF; RG; foto; observações; categorias (etiquetas); contato de emergência (nome, telefone); endereço (CEP, endereço com número, complemento, bairro, cidade, estado); responsável (nome, CPF, nascimento, documento); convênio (convênio, titular, nº da carteirinha, CPF do responsável); "link para o paciente preencher" (autocadastro).

## Variáveis de documento (print 02)

Padrão `%nome%` substituído na geração. Grupos: paciente (nome, nascimento, celular, CPF, e-mail, RG, CEP, endereço), responsável (nome, CPF), dentista relacionado (nome, CRO, CPF, e-mail), clínica (nome, CEP, endereço, CPF/CNPJ, cidade) e data (numérica e por extenso). Os nomes exatos são do produto; o SmileOS deve definir os seus.

## Inferred data model

Foco em documentos. Tudo com `clinic_id` (o Codental tem um estabelecimento por conta, ver termos 4.5).

```
Medication      id, clinic_id, name (inclui concentração, ex.: "Nome 500mg"), default_quantity?, default_unit?,
                route (internal | external), controlled (bool), default_posology?
                evidence: C13 "Cadastrar novo medicamento" (uso interno/externo, controlado), autocomplete com ícone de editar
                confidence: high (campos), medium (existência de padrões por medicamento)
                nota: banco parece ser POR CLÍNICA e começa quase vazio (autocomplete mostrou 1 item); não há catálogo grande

PrescriptionItem  prescription_id, medication_id | free_name, quantity, unit (ampola|caixa|comprimido|frasco|pacote|tubo|cápsula), posology (texto livre), position
                evidence: C13 "Medicamentos adicionados (n)" ; select de medida; campo posologia
                confidence: high

Prescription    id, clinic_id, patient_id, dentist_id (profissional responsável), issued_on, items[], created_at, signed_at?
                evidence: C13 data da emissão, profissional, paciente (travado); aparece na lista C12
                confidence: high (cabeçalho), guess (assinatura e armazenamento do PDF)

PrescriptionTemplate  id, clinic_id (ou dentist_id), name, items[]
                evidence: C13 "Modelos salvos" ("Nenhum modelo criado")
                confidence: medium

MedicalCertificate (atestado)  id, patient_id, dentist_id, kind (days | hours), issued_on, cid (código/nome), days?, start_time?, end_time?
                evidence: C15 campos por tipo
                confidence: high

CustomDocument  id, clinic_id, patient_id, dentist_id, title, body_html (com variáveis resolvidas na geração), request_professional_signature (bool), request_patient_signature (bool), status, created_at
                evidence: C16 título, editor, dois checkboxes de assinatura, "Gerar documento"
                confidence: high (campos), guess (status/fluxo de assinatura)

DocumentTemplate  id, clinic_id, title, body_html, builtin (bool)
                evidence: C16 "Modelos salvos" (5 de fábrica: 2 contratos, 1 termo de imagem, 1 termo de dados pessoais/LGPD, 1 termo de esclarecimento e consentimento) + "Salvar modelo de documento"
                confidence: high

SignatureRequest  id, document_id (anamnese | evolução | documento), signer (professional | patient), token/link, signed_at, signer_ip?, hash?
                evidence: C05/C07 "Solicitar assinatura do paciente"; C11 "Assinar digitalmente" + "Assinar evolução" + "10 assinaturas digitais grátis"; C16 checkboxes
                confidence: medium (existência), guess (mecanismo: provável link por e-mail/WhatsApp; provedor externo de assinatura)

PatientFile     id, patient_id, folder_id?, name, mime, size, storage_path, uploaded_by, created_at
PatientFolder   id, patient_id, parent_id?, name
                evidence: C18 "Adicionar > Arquivos (fotos, vídeos, documentos) | Pasta (organize seus arquivos)"; texto de ajuda "salvar arquivos e manipular pastas"
                confidence: high (existem), guess (aninhamento)

Evolution       id, patient_id, dentist_id, date, body_html, images[] (até 20), treatment_id?, quote_id?, tooth?, signed (bool), signed_at?, auto_generated (bool)
                evidence: C11 formulário e histórico; C03/C09 "foi finalizado" automático com dente e orçamento
                confidence: high

AnamnesisTemplate / Question / Record
                questions: text, answer_type (yes_no_unknown | yes_no_unknown_text | text_only), active, position, show_alert (bool)
                records: patient_id, template_id, answers[], created_at, signature request
                evidence: C06, C19..C21
                confidence: high
                nota: pergunta "Queixa principal" é só texto; demais Sim/Não/Não sei + "informações adicionais"

Professional    id, user_id, name, email, cro_number, cro_uf, cpf, birth_date, kind (dentist)
                evidence: C14 bloqueio ("é necessário preencher Nº CRO, CRO/UF, CPF e data de nascimento"), C23 coluna CRO
                confidence: high
```

Relationships: Patient 1-n Prescription, MedicalCertificate, CustomDocument, Evolution, AnamnesisRecord, PatientFile; Prescription 1-n PrescriptionItem n-1 Medication (opcional, nome livre também); Document n-1 Professional; Evolution n-1 Treatment n-1 Quote; PatientFolder 1-n PatientFile; documento 1-n SignatureRequest.

## O que o SmileOS já tem (cruzado com `build-log.md` e `types.ts`)

| tema | SmileOS | Codental |
| --- | --- | --- |
| Evolução clínica por consulta | feito (S22a): criar/editar/excluir, ligada a atendimento ou data | + editor rico, imagens (20), IA, assinatura, evolução automática ao finalizar tratamento |
| Anamnese com modelos | parcial: modelos, "sim vira alerta", histórico, alertas em destaque | + 4 modelos de fábrica, envio por link, assinatura, 3 tipos de resposta, reordenar, "propagar para todos os modelos" |
| Odontograma / plano / orçamento / parcelas | feito (S02, S03, S23) | semelhante; + "Gerar contrato" a partir do orçamento |
| Documentos (receita, atestado, personalizados, termos) | **não existe** (item 12 da Onda B pendente) | todos |
| Medicamentos | **não existe** | cadastro inline, controlado, uso interno/externo |
| Arquivos/imagens/pastas | **não existe** (item 11 pendente, falta bucket privado) | upload + pastas |
| Assinatura | **não existe** | solicitar assinatura (anamnese, evolução, documentos) |
| Cadastro do profissional com CRO | não consta em `Profile`/`Access` (confirmar) | exigido para prescrição |

## Feature matrix

See `features-codental.csv`. Colunas: feature, area, priority, original, clone, notes (a nota traz "SmileOS já tem: sim/parcial/não").

## Out of scope (cannot or should not be cloned)

- Banco/catálogo de medicamentos, textos de posologia, modelos de contrato e termos do Codental (conteúdo proprietário e jurídico); o SmileOS escreve os seus com revisão jurídica.
- "Prescrição inteligente" (provável IA/base clínica de terceiros) e "Transcrever/Melhorar com IA": só como projeto próprio e opcional, nunca como cópia.
- Assinatura digital com validade legal (ICP-Brasil, provedor homologado): comprar/integrar provedor, não construir.
- Receita de controle especial (portaria 344/98, receituário amarelo/azul, SNGPC, receita digital com certificado): exige regulação própria; ver riscos.
- Consulta Serasa, WhatsApp Cloud (já tratado em outras ondas), pesquisa de satisfação, Codental Cobranças (Asaas).

## Size

Telas mapeadas: 23. Fluxos: 7. Entidades: 12 (6 novas para documentos). Hard parts: (1) assinatura com validade legal e trilha de auditoria; (2) receita controlada e requisitos legais do receituário; (3) armazenamento privado de arquivos (bucket, RLS, antivírus, limites, backup, retenção de 5+ anos do prontuário). Tamanho: documentos sem assinatura **M**; arquivos e pastas **M**; assinatura digital com validade **L**; receita controlada/digital certificada **XL (reescopar)**.

## Encaixe no SmileOS

Proposta de ondas (ordem de implementação), reaproveitando a Onda B parcial (evolução e anamnese já feitas, camada falsa v3 e migration `20261114000001`).

**B1. Documentos simples (sem storage, sem assinatura)** [M]
1. `Professional` com CRO, CRO/UF, CPF e nascimento (perfil do dentista), pois o cabeçalho da receita e do atestado depende disso.
2. Atestado (dias/horas, CID opcional) e receita simples: tabela `prescriptions` e `prescription_items`; medicamento por nome livre + autocomplete dos já usados na clínica (tabela `medications` por clínica, vazia no início); posologia em texto.
3. Impressão/PDF no navegador (mesmo padrão do PDF do orçamento).
4. Modelos de receita salvos.
Reaproveita: tipo `ClinicalNote` (data/dentista/paciente), layout A4 do orçamento, RLS por `clinic`/paciente já usada em evolução, componente `Modal`.

**B2. Documentos personalizados e termos** [M]
5. Editor de texto básico + variáveis `%...%` próprias, modelos próprios (termo de consentimento, uso de imagem, LGPD, contrato) **escritos por nós e revisados por advogado**.
6. "Gerar contrato" a partir do orçamento aprovado (reaproveita `Budget`/`Installment`).
7. Aviso na tela de que o modelo é minuta e a responsabilidade do texto é da clínica (o Codental faz o mesmo nos termos, cláusula 5.4).

**B3. Arquivos, imagens e pastas** [M] **exige storage/bucket privado**
8. Bucket privado no Supabase, URL assinada com expiração, tabela `patient_files` + `patient_folders`, RLS idêntica à do paciente, limite de tamanho/tipo, nome sanitizado.
9. Anexos da evolução (até 20 imagens) e foto do paciente reaproveitam o mesmo bucket.
10. Envio de foto pelo celular (QR/link com token) fica depois.

**B4. Anamnese completa** [S] reaproveita o que existe
11. Envio por link (token público, expiração, uso único; já listado como pendência no build-log), 3 tipos de resposta, reordenar, modelos de fábrica próprios.

**B5. Assinatura** [L] **exige revisão jurídica**
12. Nível 1 (simples): aceite com nome, data/hora, IP e hash do documento, para termos e anamnese (consentimento).
13. Nível 2 (avançada/qualificada): integrar provedor (ex.: assinatura ICP-Brasil/gov.br); não construir criptografia própria.
14. Travamento da evolução após assinatura (já listado como falta no build-log).

**B6. Receita controlada e digital** [XL] **não começar sem decisão jurídica**
15. Receituário de controle especial exige modelo oficial, numeração, retenção e, para receita digital, certificado ICP-Brasil e plataforma validada (ITI/ANVISA/CFM-CFO). Recomendação: SmileOS marca "medicamento controlado" e **gera apenas rascunho para impressão em talonário oficial** até haver parceiro certificado.

### O que exige revisão jurídica (CFO/CFM, validade) antes de lançar
- Conteúdo mínimo da receita e do atestado (identificação do profissional com CRO, assinatura, data, paciente) conforme CFO e legislação sanitária; atestado com CID só com consentimento do paciente (sigilo).
- Prontuário: guarda mínima (a legislação e o Codental citam 5 a 6 anos; confirmar o prazo vigente), integridade e auditoria das alterações (o Codental mantém histórico de alterações por 3 meses; o SmileOS deve fazer melhor com `audit_log`).
- Validade de assinatura eletrônica (MP 2.200-2, Lei 14.063) e receita digital (regras de CFM/CFO/ITI).
- LGPD: dados de saúde são sensíveis; papel de controlador/operador (os termos tratam a clínica como co-controladora), base legal, retenção e exclusão.
- Textos de contratos e termos: sempre revisados por advogado; mostrar aviso de minuta.

### Não clonar
Nome/marca Codental, textos de interface, modelos de contrato/termos e anamnese de fábrica, lista de variáveis idêntica (usar nomes próprios), "Prescrição inteligente" e botões de IA, ilustrações.

### Próximo passo
Aprovar B1 e B3 (começar por B1, que não precisa de bucket); decidir com advogado o escopo de B5/B6; migrar o `Profile` do dentista para incluir CRO; só então `/replica-architect` para o schema das tabelas novas.
