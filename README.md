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
    npm run verify           # fmt + lint + typecheck + tests — la porte unique
    npm run fn:local:ft      # lance la collecte FT en local, sur la base DISTANTE
    npm run fn:local:adzuna  # idem pour Adzuna
    npm run fn:deploy:ft     # déploie la collecte France Travail
    npm run fn:deploy:adzuna # déploie la collecte Adzuna

**Ne pas utiliser `npm run fn:serve` pour essayer une collecte.**
`supabase functions serve` **réserve** les noms `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` et ignore **silencieusement** les valeurs de
`.env.local` : la collecte écrit alors dans une Postgres locale éphémère et
vide en croyant écrire sur le projet distant. Aucune erreur, aucune ligne — un
faux succès complet. Passer par `fn:local:ft` ou `fn:local:adzuna`, qui lancent
le point d'entrée via `deno run --env-file=.env.local` sur le port 8000.

## Consulter les offres

    select source, title, company_name, city, coalesce(rate_raw, salary_raw) as remu,
           score, matched_terms
    from offers_ranked
    where red_flags = 0 and core_hits >= 1
    order by score desc, published_at desc;
