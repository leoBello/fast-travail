// Après `vite build` : deux sorties du même fichier autonome.
//  - export/fast-travail-refonte.html : la page complète, à joindre à un message ou ouvrir hors ligne ;
//  - export/artefact.html : le même contenu sans squelette <html>/<head>/<body>, que l'hôte
//    d'artefacts pose lui-même.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const page = readFileSync('dist/index.html', 'utf8');
mkdirSync('export', { recursive: true });
writeFileSync('export/fast-travail-refonte.html', page);

const tete = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'));
const corps = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'));
const sansMeta = tete.replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
writeFileSync('export/artefact.html', `${sansMeta.trim()}\n${corps.trim()}\n`);
console.log('export : %d Ko', Math.round(page.length / 1024));
