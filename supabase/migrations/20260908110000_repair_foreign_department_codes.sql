-- Un code postal etranger devenait un code de departement francais.
--
-- mapper.ts tranchait `offer.postal_code?.slice(0, 2)` sans verifier le
-- format. Free-Work liste des offres hors de France, et deux formes de
-- pollution en resultaient : un code alphanumerique britannique comme
-- "BS1 2HP" -> "BS" (inerte, ne matche jamais un departement reel), et un
-- code purement numerique mais non francais comme un "1300" belge -> "13",
-- le departement de Marseille -- celui-la est actif : l'offre entre dans
-- `offers_shortlist` marquee `acces = 'local'`, presentee comme commutable
-- alors qu'elle est a l'etranger.
--
-- Mesure en base le 2026-09-08, avant correction du mapper (voir le commit
-- qui l'accompagne) : cinq lignes deja polluees, toutes source free_work --
-- trois "BS1 2HP" -> "BS" (Bristol), une "EC2R 8AH" -> "EC" (Royaume-Uni),
-- une "G2 1AL" -> "G2" (Glasgow). Aucun cas numerique constate a ce jour,
-- mais le mecanisme est le meme et corrige au meme endroit.
--
-- Cette migration ne touche que les deux sources scrapees, jamais adzuna ni
-- france_travail : elles ne passent jamais par ce chemin de code, et leurs
-- departements viennent d'un autre mapper (`departmentCodeFromName` /
-- `departmentCodeFromArea`, sur des noms de departement, pas des codes
-- postaux).
--
-- Sur la divergence Corse 20/2A (probleme ouvert P7, voir ETAT.md), soyons
-- exacts plutot que rassurants : "2A" ne passe PAS la condition ci-dessous et
-- serait donc mis a null. C'est sans effet, mais pas parce que la condition
-- l'epargne — parce qu'aucune des deux sources scrapees ne peut produire
-- "2A". departmentCodeFromCityName ne rend que 13, 83 ou 84, et le seul autre
-- chemin est la tranche d'un code postal a cinq chiffres. Verifie en base :
-- zero ligne free_work ou collective avec un departement dans (20, 2A, 2B).
update offers
   set department = null
 where source in ('free_work', 'collective')
   and department is not null
   and department !~ '^[0-9]{2}$';
