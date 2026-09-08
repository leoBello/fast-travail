import { assert, assertEquals } from '@std/assert';
import { extractJsonLd, extractNextData, htmlToText } from '../html.ts';

const jobPage = await Deno.readTextFile(
  new URL('../../free-work/__tests__/fixtures/job-contractor-tjm.html', import.meta.url),
);
const listPage = await Deno.readTextFile(
  new URL('../../collective/__tests__/fixtures/jobs-fr-page1.html', import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

Deno.test('extractJsonLd trouve le JobPosting de la page réelle', () => {
  const blocks = extractJsonLd(jobPage);
  assertEquals(blocks.length, 2);

  const posting = blocks.filter(isRecord).find((b) => b['@type'] === 'JobPosting');
  assert(posting, 'aucun bloc JobPosting');
  assertEquals(posting['title'], 'Developpeur React/Node/NestJS - Anglais courant obligatoire');
});

Deno.test('extractJsonLd ignore un bloc illisible sans perdre les autres', () => {
  const html = [
    '<script type="application/ld+json">{ ceci n’est pas du JSON }</script>',
    '<script type="application/ld+json">{"@type":"JobPosting"}</script>',
  ].join('');
  const blocks = extractJsonLd(html);
  assertEquals(blocks.length, 1);
});

Deno.test('extractNextData rend le payload de la page réelle', () => {
  const data = extractNextData(listPage);
  assert(isRecord(data));
  assert(isRecord(data['props']));
});

Deno.test('extractNextData rend null quand la balise est absente', () => {
  assertEquals(extractNextData('<html><body>rien</body></html>'), null);
});

Deno.test('htmlToText retire les balises et rétablit les coupures', () => {
  const html = '<h3>Contexte</h3><p>Une phrase.</p><ul><li>un</li><li>deux</li></ul>';
  assertEquals(htmlToText(html), 'Contexte\nUne phrase.\nun\ndeux');
});

Deno.test('htmlToText traite <br> comme une coupure', () => {
  assertEquals(htmlToText('a<br />b<br>c'), 'a\nb\nc');
});

Deno.test('htmlToText décode les entités en une seule passe', () => {
  assertEquals(htmlToText('R&amp;D &lt;tag&gt; l&#39;équipe &nbsp;fin'), "R&D <tag> l'équipe fin");
  // Une passe unique : &amp;lt; rend le TEXTE &lt;, jamais le caractère <.
  assertEquals(htmlToText('&amp;lt;'), '&lt;');
});

Deno.test('htmlToText laisse une entité numérique hors plage en texte littéral', () => {
  assertEquals(htmlToText('avant &#1114112; apres'), 'avant &#1114112; apres');
});

Deno.test('htmlToText décode une entité numérique astrale valide', () => {
  assertEquals(htmlToText('&#128512;'), '😀');
});

Deno.test('htmlToText réduit une espace insécable brute à une espace ordinaire', () => {
  assertEquals(htmlToText('a\u00A0b'), 'a b');
});
