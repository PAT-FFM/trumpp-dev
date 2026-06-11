# LinkedIn-Strategie — Arbeitsnotizen

> Interne Notizen. `/notes/*` wird in `netlify.toml` per Force-404 versteckt
> (analog zu `/workers/*`) und ist daher nach dem Deploy nicht öffentlich
> abrufbar.

## Ziel

Sichtbarkeit, nicht Akquise. Raus aus den durchgespielten LinkedIn-Patterns
("jung & frisch" / "erfahren" / "AI-Guru") — stattdessen eine Meta-Ebene:
Was machen wir als Entwickler eigentlich?

**Kernerkenntnis:** Die Meta-Ebene nicht als Geste (Contrarian-Posts über
LinkedIn sind selbst ein Pattern), sondern über Spezifität: konkrete
Beobachtungen aus echter Arbeit, die niemand als Werbung lesen kann.

## Die vier Ansätze

1. **Die übersprungenen Fragen** — Format aus dem eigenen Profil
   ("stellt die Fragen, die andere überspringen"). Pro Post eine Frage,
   die in Projekten routinemäßig übersprungen wird, und was passiert,
   wenn man sie stellt.
2. **Der Lineup-Blick auf Hypewellen** — 30 Jahre Wellen gesehen
   (Portale, SOA, Agile, Cloud, AI). Position: weder Guru noch Skeptiker,
   sondern Set-Leser. Was ist wirklich neu, was ist Mechanik von 2005?
3. **Die Konstanten** — Umkehrung des üblichen Posts: was sich in 30 Jahren
   NICHT geändert hat. These: Software ist die Übersetzung von vagem Wollen
   in präzises Verhalten; der Engpass war nie die Tastatur. AI beschleunigt
   das Tippen, nicht das Verstehen.
4. **Artefakte statt Behauptungen** — trumpp.dev selbst als Material:
   CV als MCP-Server, llms.txt, Chat-Widget, Stats. Zeigen statt behaupten.

## Praktische Leitplanken

- Frequenz niedrig (alle 1–2 Wochen), Stimme konstant. Aufmerksamkeit ≠ Reichweite.
- Deutsch, englische Fachbegriffe natürlich belassen.
- Erst Wochen substanziell kommentieren (die übersprungene Frage stellen),
  dann posten. Kein "Ich melde mich zurück"-Antrittspost.
- Keine Hashtag-Wände, keine "Agree?"-CTAs, kein Zeilenumbruch-Staccato.
- Posts enden leise, nicht mit Pointen-Trommelwirbel.

## Ausformulierte Entwürfe

### Entwurf 1 — „Was heißt bei euch eigentlich ‚fertig'?" (Ansatz 1)

„Was heißt bei euch eigentlich ‚fertig'?"

Ich stelle diese Frage seit fast dreißig Jahren in Projekten, und sie hat
noch nie eine schnelle Antwort bekommen.

Der Entwickler meint: kompiliert, Tests grün.
Der Product Owner meint: auf der Testumgebung klickbar.
Der Fachbereich meint: ich kann damit arbeiten — auch am Quartalsende,
auch mit den echten Daten.

Drei Definitionen, ein Wort. Das geht monatelang gut, weil alle dasselbe
Wort benutzen. Es fällt erst auf, wenn es teuer ist.

Projekte scheitern selten an Technik. Sie scheitern leise, an ungeprüften
Annahmen — und die wohnen fast immer in den Wörtern, die so
selbstverständlich klingen, dass niemand nachfragt.

Deshalb frage ich. Es kostet zehn Minuten und ist gelegentlich etwas
unbequem. Die Alternative kostet ein Eskalationsmeeting im November.

### Entwurf 2 — Die Konstante (Ansatz 3)

Was sich seit 1996 in meinem Beruf geändert hat: die Sprachen, die
Frameworks, die Buildzeiten, die Buzzwords — und zuletzt, wer den Code tippt.

Was sich nicht geändert hat: Software ist der Versuch, vages Wollen in
präzises Verhalten zu übersetzen. Und der Engpass in dieser Übersetzung
war noch nie die Tastatur.

Ein Missverständnis, das früher drei Sprints brauchte, um in Produktion
zu gehen, schafft das heute am selben Nachmittag. Das ist echter
Fortschritt — nur an einer anderen Stelle, als die Demo vermuten lässt.

Die wertvollste Arbeit passiert immer noch vor dem ersten Prompt:
herausfinden, was eigentlich gemeint ist. Davon habe ich noch kein Tool
gesehen, das es übernimmt. Ich habe allerdings auch noch keinen Menschen
gesehen, der es freiwillig tut.

### Entwurf 3 — Plattform / Agent (Ansatz 2)

2002 habe ich E-Business-Plattformen gebaut. Das Wort „Plattform" hat
damals genau das versprochen, was „Agent" heute verspricht: Das System
erledigt es ab jetzt selbst, ihr müsst nur noch zuschauen.

Geblieben ist von den Plattformen vor allem eines: die Integrationsarbeit.
Schnittstellen, Datenqualität, die Frage, wer das Ding nachts um drei
wieder hochfährt. Das Versprechen war recycelbar, die Arbeit nicht.

Ich sage das nicht als Skeptiker — ich baue selbst mit LLMs und finde die
aktuelle Welle technisch bemerkenswert. Aber nach ein paar Jahrzehnten im
Wasser erkennt man die Sets: Die Welle ist echt. Die Versprechen sind
gebraucht. Beides kann gleichzeitig wahr sein.

### Entwurf 4 — CV als MCP-Server (Ansatz 4)

Mein Lebenslauf ist jetzt ein MCP-Server.

AI-Agenten können trumpp.dev maschinenlesbar abfragen — llms.txt für die
Crawler, ein MCP-Endpoint mit get_profile-Tool für die Agenten, ein
Chat-Widget für Menschen. Kein Framework, ein Cloudflare Worker, ein
Wochenende.

Das Interessanteste war der System-Prompt. Ich musste ausdrücklich
hineinschreiben, dass das Modell nicht übertreiben soll. Ohne diese Zeile
wurde aus „langjähriger Java-Erfahrung" zuverlässig ein „visionärer
Technologie-Pionier".

Das Modell hat LinkedIn offensichtlich in den Trainingsdaten.

Einem LLM Bescheidenheit beizubringen ist eine Zeile Arbeit. Anderswo,
höre ich, dauert es länger.

## Backlog — weitere übersprungene Fragen (Ansatz 1)

- „Wer liest dieses Reporting eigentlich?" (Antwort nach 8 Jahren: niemand mehr)
- „Was tut das System, wenn das Feld leer ist?"
- „Woher kommen diese Daten — und wer hat das zuletzt geprüft?"
- „Was passiert, wenn der Import zweimal läuft?"
- „Wen rufen wir an, wenn das nachts um drei steht?"
- „Welches Problem hatten wir, bevor wir dieses Tool eingeführt haben?"
- „Meinen wir mit ‚Kunde' alle dasselbe?" (CRM-Klassiker)

## Backlog — weitere Post-Ideen

- Migration von >1 Mio. Media-Assets: was man dabei über Datenqualität
  lernt, das in keinem Architektur-Diagramm steht (Ansatz 1/3)
- „I build software that runs in production — not in demos": der Abstand
  zwischen Demo und Betrieb als eigentliches Berufsbild (Ansatz 3)
- Stats-Auswertung: wer ruft llms.txt tatsächlich ab — Bots, Agenten,
  Menschen? Mit echten Zahlen von trumpp.dev (Ansatz 4)
- Mathematik-Diplom als Berufsgrundlage: „Was wissen wir eigentlich,
  wenn wir sagen ‚es funktioniert'?" (Ansatz 3, epistemisch)
