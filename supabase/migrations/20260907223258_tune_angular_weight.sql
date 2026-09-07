-- Reglage de ponderation, decide sur observation du premier classement reel.
--
-- Constat sur les 699 offres du premier run : les postes Java/Angular
-- dominaient le haut du classement. Trois des dix premieres offres etaient des
-- « Tech Lead Java » ou « Node.js / Vue.js », remontees par le poids de 2
-- accorde a `angular`.
--
-- Angular est une competence reelle du profil (Sully Group 2019-2020, et
-- revendiquee au CV), mais ce n'est pas la cible : un poste Angular pur n'est
-- pas ce qui est recherche. Le meme raisonnement que pour `java` s'applique
-- donc — visible mais pas valorise : le poids passe de 2 (strong) a 1
-- (context).
--
-- Effet attendu : un poste « React + Angular » reste bien classe grace a
-- react(+3), tandis qu'un « Tech Lead Angular » cesse de concurrencer un vrai
-- poste React.
--
-- Aucune re-collecte necessaire : le score est une VUE, il se recalcule seul
-- sur les offres deja en base.
update skill_lexicon
set weight = 1,
    category = 'context'
where term = 'angular';
