# Refonte du tableau de bord — maquette

La maquette de la refonte du tableau de bord sur la bibliothèque de composants
du socle, `@automation-ia-dev/ui` v1.3.0. Le contexte et ce qui reste à trancher
sont dans [`../../ETAT.md`](../../ETAT.md), section « Refonte du tableau de
bord ».

**Artefact publié** : <https://claude.ai/artifact/PA1qcNAgjLmMeoiQfZUMCb>
(privé tant qu'il n'est pas partagé depuis son menu « Partager »).

## Ce qui la distingue des maquettes de la phase 3

Elle n'est pas dessinée : c'est une petite application Vite + React 19 qui
importe les **vrais composants** de la bibliothèque — coque d'application,
barre latérale, `CarteKPI`, graphiques visx, `TableauDonnees`,
`PanneauLateral`, `PaletteCommandes`, `Curseur`. Ce qu'on y voit est ce que le
code rendra, y compris en mode clair, sur téléphone et sous les thèmes
vitrines Nocturne et Aurore (menu « Apparence », en haut à droite).

Les compositions propres à fast-travail — couple de scores, cascade du rang,
entonnoir, pipeline — sont dans `src/composants/` et `src/maquette.css`, et
n'emploient que des tokens `--aia-*` : aucune couleur, police ni rayon
littéral.

## Les données sont réelles

`src/donnees-base.ts` est **généré** depuis la base distante le 2026-10-20
(`npx supabase db query --linked`) : intitulés, employeurs, scores, verdicts,
bonus, candidatures, séries par jour, technos. Les comptes de `src/donnees.ts`
viennent des mêmes requêtes. Rien n'y est inventé ; la maquette affiche
notamment la panne du jugement (P32) telle qu'elle était ce jour-là.

Deux limites assumées :

- « Toute la veille » ne charge que les 14 premières offres à décider, sur
  2 966 ; les comptes des onglets, eux, sont les vrais.
- Les décisions prises dans la maquette (Garder, Écarter) et les poids réglés
  ne sont pas enregistrés : ils vivent le temps de la visite.

## Rouvrir, modifier, exporter

```bash
cd docs/design/refonte
npm install          # la bibliothèque vient de vendor/, empaquetée par `npm pack`
npm run dev          # aperçu en direct
npm run build        # vérifie les types, construit, puis écrit export/
```

`npm run build` produit, dans `export/` (non versionné) :

| Fichier | Usage |
|---|---|
| `fast-travail-refonte.html` | La maquette en **un seul fichier** de ~2 Mo, polices comprises. À joindre à un message ; s'ouvre hors ligne, dans n'importe quel navigateur. |
| `artefact.html` | Le même contenu sans squelette `<html>`, pour republier l'artefact au même lien. |
| `captures/*.png` | Captures ×2 de chaque écran, régénérées à la main. |

**Mettre à jour la bibliothèque** : refaire `npm pack` dans
`socle/packages/ui` vers `vendor/`, ajuster la version dans `package.json`,
puis `npm install`.
