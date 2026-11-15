-- HOF: "platisma" vira região própria (antes junto de "pescoco"). Troca o CHECK de regiões
-- aceitando os ids antigos + 'platisma' (19 ids). Idempotente; não altera dados.
alter table plan_items drop constraint if exists plan_items_hof_regions_check;
alter table plan_items add constraint plan_items_hof_regions_check check (
  cardinality(hof_regions) <= 19
  and hof_regions <@ array['testa','glabela','tempora_d','tempora_e','olheira_d','olheira_e','malar_d','malar_e',
    'nasogeniano_d','nasogeniano_e','nariz','labio_superior','labio_inferior','mento','mandibula_d','mandibula_e','pescoco','platisma','perioral']::text[]);
