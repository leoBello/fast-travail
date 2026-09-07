# fast-travail

Veille automatisée d'offres d'emploi pour développeur front-end React / TypeScript,
zone Marseille / Aix-en-Provence et full-remote national.

## Architecture

- **API** (France Travail, Adzuna) : Edge Functions Deno déclenchées par `pg_cron` sur Supabase Cloud.
- **Scrapers** (Free-Work, Codeur.com, Collective.work, Kicklox) : scripts Node locaux — plan B.
- **Code partagé** : `supabase/functions/_shared/`, TypeScript runtime-neutre, importable par Deno et Node.

Design : `docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`

## Commandes

    npm run db:push          # applique les migrations sur le projet distant
    npm test                 # tests unitaires Deno
    npm run fn:serve         # sert les Edge Functions en local
    npm run fn:deploy:ft     # déploie la collecte France Travail

## Consulter les offres

    select source, title, company_name, city, coalesce(rate_raw, salary_raw) as remu,
           score, matched_terms
    from offers_ranked
    where red_flags = 0 and core_hits >= 1
    order by score desc, published_at desc;
