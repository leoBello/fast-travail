create or replace view offers_dashboard as
select distinct on (g.display_key)
  s.*,
  g.display_key,
  count(*)              over (partition by g.display_key) as group_size,
  array_agg(s.source)   over (partition by g.display_key) as group_sources,
  -- Les colonnes de candidature sont PREFIXEES, et ce n'est pas cosmetique :
  -- `s.*` projette les ~31 colonnes d'offers_scored, dont la liste evoluera.
  -- Le jour ou l'une d'elles s'appellerait `status` ou `outcome`, la vue
  -- exposerait deux colonnes de meme nom — PostgreSQL l'accepte a la creation
  -- et c'est le client qui recevrait la mauvaise, en silence. Le prefixe rend
  -- la collision impossible.
  st.status            as candidature_statut,
  st.outcome           as candidature_issue,
  st.opened_at         as candidature_ouverte_le,
  st.applied_at        as candidature_envoyee_le,
  st.last_followup_at  as candidature_relancee_le,
  st.interview_at      as candidature_entretien_le,
  st.heritee           as candidature_heritee
from offers_scored s
join offers o                     on o.id = s.id
join offer_display_groups g       on g.offer_id = s.id
left join offer_application_state st on st.offer_id = s.id
order by
  g.display_key,
  -- L'ELECTION SE FAIT PAR CONFIANCE, PAS PAR SCORE. Mesure qui l'impose :
  -- la mission ALLEGIS GROUP est jugee deux fois. Adzuna, sur 500 caracteres
  -- tronques, rend fit 75 et confiance basse ; Free-Work, sur le texte
  -- integral, rend fit 58 et confiance haute, avec un verdict bien plus
  -- precis. Elire par final_score mettrait donc en tete le jugement le MOINS
  -- informe — et propagerait au passage une unite de remuneration fausse
  -- (450 EUR etiquetes « salaire » annuel au lieu de TJM).
  case s.confidence when 'haute' then 0 when 'moyenne' then 1 else 2 end,
  length(o.description) desc nulls last,
  s.final_score desc,
  s.published_at desc nulls last,
  s.id;
