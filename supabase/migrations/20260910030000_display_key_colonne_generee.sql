-- Performance : `display_key` cesse d'etre recalcule a chaque requete.
--
-- MESURE AVANT (explain analyze, `select count(*) from offers_dashboard where
-- candidature_statut = 'retenue'`, base a 4 511 offres / 1 387 jugees) :
-- 175 ms, dont 4 balayages sequentiels d'`offers`. Le poste dominant est la
-- regexp de `display_key`, evaluee ligne a ligne sur les 4 511 offres puis
-- triee : le seul `Seq Scan on offers o_3` de la branche
-- `offer_application_state` coute 73,8 ms, et le `Sort` pose dessus 83,5 ms.
-- Cette regexp est evaluee DEUX fois de plus dans la meme requete (l'auto-
-- jointure de `offer_application_state`, puis le `distinct on` d'
-- `offers_dashboard`).
--
-- Ce cout etait paye par CHAQUE appel du tableau de bord, y compris un
-- `pageSize=1` qui ne veut qu'un total : ni le `distinct on` ni les fonctions
-- de fenetrage d'`offers_dashboard` ne laissent descendre un filtre, donc la
-- vue est integralement materialisee avant que `candidature_statut` ne
-- retienne quoi que ce soit (`Rows Removed by Filter: 1272` dans le plan).
--
-- Le calcul est deplace a l'ECRITURE : une colonne generee stockee, calculee
-- une fois par offre a l'insertion, plus jamais a la lecture.
--
-- L'expression est reprise MOT POUR MOT de la vue posee par
-- `20260910005000_display_key_ignore_annotation_suffix.sql` — liste blanche de
-- suffixes d'annotation comprise. Une divergence, meme d'un caractere,
-- regrouperait les offres autrement qu'avant sans que rien ne le signale ;
-- c'est la seule chose a verifier en relisant ce fichier. Egalite verifiee
-- ligne a ligne apres application (voir la sonde du rapport).
--
-- `generated always as (...) stored` exige une expression IMMUTABLE. Les trois
-- fonctions employees le sont (`lower`, `regexp_replace` a 4 arguments,
-- `nullif`), et le repli `id::text` l'est aussi — verifie sur une table
-- temporaire avant d'ecrire cette migration, parce qu'un cast refuse ici
-- aurait fait echouer la migration en cours de route plutot qu'a la lecture.
alter table offers
  add column if not exists display_key text
  generated always as (
    coalesce(
      nullif(regexp_replace(lower(coalesce(company_name, '')), '[^a-z0-9]', '', 'g'), '')
        || '|' ||
        regexp_replace(
          lower(regexp_replace(
            title,
            '(\s*\((h/f|f/h|h-f|it|cdi|cdd|alternance|stage)\))+\s*$', '', 'gi')),
          '[^a-z0-9]', '', 'g'),
      id::text
    )
  ) stored;

-- Sans cet index, la colonne stockee supprime le calcul mais pas les tris :
-- `offer_application_state` rapproche deux fois `offers` par `display_key`
-- (l'auto-jointure qui propage une candidature a tout son groupe), et
-- `offers_dashboard` fait un `distinct on` dessus. C'est l'index qui permet au
-- planificateur de partir des 10 lignes d'`offer_applications` et de remonter
-- au groupe par recherche indexee, au lieu de trier les 4 511 offres.
create index if not exists offers_display_key_idx on offers (display_key);

-- La vue devient une simple projection. Memes noms, memes types qu'avant
-- (`offer_id` uuid, `display_key` text) : `create or replace` l'exige, et les
-- deux vues qui la lisent (`offer_application_state`, `offers_dashboard`) ne
-- changent pas d'une ligne.
create or replace view offer_display_groups as
select o.id as offer_id, o.display_key
from offers o;

-- `security_invoker` repose EXPLICITEMENT, jamais suppose reconduit par le
-- `create or replace`. C'est exactement le trou mesure le 2026-09-09 sur
-- `offers_dashboard` (1 245 lignes rendues a la cle `anon` la ou `offers` en
-- rendait 0, migration `20260910020000`) : le RLS d'une table ne protege pas
-- une vue posee dessus, et l'oubli est silencieux.
alter view offer_display_groups set (security_invoker = on);
