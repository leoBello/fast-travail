import { assertEquals } from '@std/assert';
import { emptyOffer, WINDOW_DAYS } from '../types.ts';

Deno.test('emptyOffer renseigne l\'identité et met tout le reste à null', () => {
  const offer = emptyOffer('france_travail', 'ABC123', 'Développeur React');

  assertEquals(offer.source, 'france_travail');
  assertEquals(offer.external_id, 'ABC123');
  assertEquals(offer.title, 'Développeur React');
  assertEquals(offer.description, null);
  assertEquals(offer.latitude, null);
  assertEquals(offer.rate_raw, null);
  assertEquals(offer.search_radius_km, null);
});

Deno.test('emptyOffer couvre toutes les clés de NormalizedOffer', () => {
  const offer = emptyOffer('adzuna', 'X', 'Y');
  // Verrou anti-oubli : si une colonne est ajoutée au type sans être ajoutée
  // à emptyOffer, ce compte change et le test échoue.
  assertEquals(Object.keys(offer).length, 25);
});

Deno.test('la fenêtre de collecte vaut 3 jours en delta et 31 en backfill', () => {
  assertEquals(WINDOW_DAYS.delta, 3);
  assertEquals(WINDOW_DAYS.backfill, 31);
});
