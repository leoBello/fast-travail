@echo off
REM Lance les deux scrapers l'un apres l'autre. Contrairement aux deux API, qui
REM tournent en Edge Functions declenchees par pg_cron et donc PC eteint, les
REM scrapers ne collectent que si cette machine est allumee. C'est le compromis
REM assume du ROADMAP : ils demandent un delai de politesse et du temps de
REM parcours, qui ne tiennent pas dans les 2 secondes de CPU d'une Edge Function.
REM
REM Le chemin WinGet ci-dessous utilise le nom court 8.3 (LO1A5A~1), pas
REM "C:\Users\Leo\..." ni "C:\Users\L?o\...". Le nom d'utilisateur reel porte un
REM accent (Leo), et un accent litteral dans un .cmd depend de l'encodage du
REM fichier ET du codepage actif au moment de l'execution planifiee : les deux
REM peuvent diverger en silence et faire echouer "where deno" sans message.
REM Le nom court est un alias ASCII stable fourni par Windows pour ce dossier,
REM verifie avec : cmd /c "where deno" apres avoir pose ce PATH.
setlocal
set PATH=%PATH%;C:\Users\LO1A5A~1\AppData\Local\Microsoft\WinGet\Links
cd /d "%~dp0.."
call npm run scrape:free-work -- --mode delta --trigger cron
call npm run scrape:collective -- --mode delta --trigger cron
endlocal
