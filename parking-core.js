// Reine Simulations- und Trainingslogik der Einpark-Demo (parking.html) -- ohne
// jeden DOM-Bezug, damit dieselbe Datei im Browser laeuft und unter Node vom
// Selbsttest (scripts/parking-selftest.js) importiert werden kann. Die Seite
// bindet sie als klassisches <script src> ein, nicht als ES-Modul: type="module"
// wuerde beim Oeffnen per file:// an der CORS-Pruefung scheitern, und
// parking.html soll per Doppelklick oeffenbar bleiben.

const dt = 0.1, maxT = 10.0;
// Realistisch ist "an der Wand ankommen" kein Sonderfall: Unter 1cm Abstand
// gilt bereits als Kontakt/Crash, nicht erst bei exakt 0.
const crashDist = 0.01;
// Die Startdistanz ist als Trainingsparameter kaum aussagekraeftig, da das
// Neuron ohnehin nur dist/d0 sieht und der Input somit immer bei 1 startet.
// Die eigentlich interessante Stellschraube ist die Fahrzeugklasse
// (maxAccel), die ueber die Buttons unten ausgewaehlt wird.
const d0 = 20.0;

// Roll-/Windwiderstand: wirkt proportional zur Geschwindigkeit immer
// bremsend, egal was das Pedal gerade macht -- bricht bewusst die Symmetrie
// zwischen Beschleunigen und Bremsen (ohne ihn waeren beide durch dasselbe
// maxAccel exakt gleich stark, siehe Kommentar bei noteFor). Global und
// nicht pro Fahrzeugklasse, da es eine Umgebungseigenschaft ist, keine
// Fahrzeugeigenschaft.
const dragCoeff = 0.08;

// Hard-Tanh (clamp auf [-1,1]) statt tanh: bildet ein Gaspedal, das bei 100%
// hart saettigt, exakter ab als tanhs nur asymptotische Annaeherung an ±1 --
// und braucht bei nur einem Neuron mit numerischem Differenzen-Gradienten
// (statt Backprop durch viele Schichten) keine Glattheit.
function hardTanh(x) { return Math.max(-1, Math.min(1, x)); }

// Erster Zeitpunkt, an dem sich Distanz/Geschwindigkeit nicht mehr aendern (Fahrzeug
// ist -- nachdem es sich bewegt hat -- endgueltig zum Stillstand gekommen). Sowohl bei
// simulate() (laeuft technisch bis maxT durch) als auch bei einem Self-Drive-Lauf
// (laeuft bis Handbremse/Zeitlimit/Crash durch) ist das Ende der Trajektorie nicht der
// relevante Zeitpunkt fuer die Zeitstrafe in noteFor() -- das waere sonst immer
// (fast) maxT bzw. die Laufzeit bis zum Handbremse-Druck, egal wie fix das Fahrzeug
// tatsaechlich stand.
function stopIndexOf(traj) {
  let hasMoved = false;
  for (let i = 0; i < traj.length; i++) {
    if (traj[i].speed > 0.3) hasMoved = true;
    if (hasMoved && traj[i].speed <= 0.02) return i;
  }
  return traj.length - 1;
}
function stopTimeOf(traj) { return traj[stopIndexOf(traj)].t; }

// Referenzzeit fuer die Zeitstrafe unten: kuerzeste moegliche Zeit, in der ein
// Bang-Bang-Manoever (Vollgas, an einem einzigen Zeitpunkt Wechsel auf Vollbremsung)
// exakt mit v=0 an der Wand ankommt. Numerisch per Bisektion ueber den Wechselzeitpunkt
// bestimmt statt per geschlossener Formel (2*sqrt(d0/maxAccel)), weil dragCoeff das
// Optimum leicht verschiebt (siehe Kommentar bei noteFor).
//
// Der Umschaltzeitpunkt wird dabei *anteilig* im betroffenen Schritt angewandt, nicht
// auf das dt-Raster gerundet. Ohne das kann die Bisektion nur ganze Rasterschritte
// treffen, und zwischen "ein Schritt zu wenig Gas" und "ein Schritt zu viel" klafft
// eine Luecke, die kein Manoever ausfuellt: bei maxAccel=2.0 blieb das so gefundene
// "Optimum" 0.72m vor der Wand stehen, erfuellte die Aufgabe also gar nicht, und die
// Vorgabe war mit 6.3s statt 6.4s zu optimistisch -- rund die Haelfte des dem Nutzer
// angezeigten Zeitueberschusses war damit ein Rechenartefakt. (Die geschlossene Formel
// lag mit 6.32s naeher dran als die gerasterte Bisektion; das Problem war nie der
// Luftwiderstand, sondern die Quantisierung.)
//
// Pro Fahrzeugklasse (maxAccel) nur einmal berechnet und gecacht, da sonst jeder
// einzelne costOf()-Aufruf im Trainings-Suchlauf zusaetzlich ~40 Bisektions-
// Simulationen mitschleppen wuerde. Der Cache-Key fuehrt startDist mit, weil das
// Ergebnis davon genauso abhaengt wie von maxAccel.
function bangBangFinal(tSwitch, maxAccel, startDist = d0) {
  let dist = startDist, speed = 0, t = 0;
  while (t < maxT - 1e-9) {
    // Liegt tSwitch mitten im Schritt, bekommt genau dieser Schritt eine anteilige
    // Aktion (+1 bis -1) statt einer gerundeten -- sonst waere das Manoever auf das
    // dt-Raster quantisiert, siehe Kommentar oben.
    const tEnd = t + dt;
    let action;
    if (tEnd <= tSwitch) action = 1;
    else if (t >= tSwitch) action = -1;
    else action = 2 * ((tSwitch - t) / dt) - 1;
    speed = Math.max(0, speed + (action * maxAccel - dragCoeff * speed) * dt);
    dist -= speed * dt;
    t += dt;
    // Dieselbe Crash-Schwelle wie simulate(): mit `dist <= 0` duerfte die Referenz in
    // einen Bereich fahren, der im Training schon als Crash zaehlt.
    if (dist <= crashDist) return { dist: Math.max(0, dist), t, stopped: false };
    if (speed === 0) return { dist, t, stopped: true };
  }
  return { dist, t, stopped: false };
}
const minTimeCache = {};
function minTimeFor(maxAccel, startDist = d0) {
  const key = maxAccel + ':' + startDist;
  if (minTimeCache[key] !== undefined) return minTimeCache[key];
  // lo: spaetestens hier ohne Crash zum Stehen gekommen (zu frueh gebremst, Rest-dist
  // > 0). hi: spaetestens hier gecrasht (zu spaet gebremst). Gesucht ist die Grenze
  // dazwischen -- der zeit-optimale Wechselzeitpunkt.
  let lo = 0, hi = maxT;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = bangBangFinal(mid, maxAccel, startDist);
    if (r.stopped && r.dist > 0) lo = mid; else hi = mid;
  }
  minTimeCache[key] = bangBangFinal(lo, maxAccel, startDist).t;
  return minTimeCache[key];
}

// Trotz vieler moeglicher (w,b)-Loesungen sieht die Geschwindigkeitskurve
// nach dem Training immer aehnlich aus (Rampe rauf, Spitze, dann runter):
// "Vollgas, dann volle Bremsung" ist die kostenoptimale Bang-Bang-Strategie
// fuer diese Aufgabe. Der Umschaltpunkt -b/w liegt deshalb ueber verschiedene
// Trainingslaeufe hinweg stets in einer aehnlichen Groessenordnung -- ohne
// dragCoeff waere er wegen der reinen Beschleunigen/Bremsen-Symmetrie exakt
// dist/d0 = 0.5, mit Widerstand (bremst immer mit) verschiebt er sich etwas
// nach hinten (~0.42-0.44), weil laenger beschleunigt werden kann, bevor
// aktiv gebremst werden muss.
//
// Waehlbare Lossfunktions-Varianten fuer den Trainings-Tab -- zeigt didaktisch, dass
// nicht nur w/b, sondern die Zielfunktion selbst das Trainingsergebnis bestimmt.
// distW/speedW/timeW sind die Gewichte der jeweiligen Terme in noteFor()'s
// "regulaer"-Zweig (0 = Term entfaellt komplett, nicht nur abgeschwaecht). timeW=5
// (bei "Kombiniert") ist experimentell, noch nicht empirisch feinjustiert: bei den vom
// Training typischerweise erreichten Endgenauigkeiten (wenige cm) ist dist*dist*1000
// schon nahe 0, ein kleiner Zeitueberschuss soll dort trotzdem den Ausschlag geben --
// gleichzeitig soll die Zeitstrafe bei echten dist-Fehlern (>schon ein paar cm) nicht
// dominieren. Bei timeW=5 entspricht 1s Zeitueberschuss ungefaehr 7cm dist-Fehler
// (sqrt(5/1000)), 2s ungefaehr 14cm -- spuerbar, aber nicht Genauigkeit ueberstimmend.
// Die Crash-Strafe (siehe noteFor) wiegt bei allen Varianten gleich schwer -- sie ist
// eine Sicherheitsschranke, kein didaktischer Vergleichsparameter. Genau dafuer gibt es
// crashW: es haelt sie auf derselben relativen Hoehe, wenn eine Variante auf einer
// anderen Zahlenskala rechnet.
// timeW=50 (10x) und selbst timeW=1000 (200x) fuer "Starke Zeitstrafe" wurden
// probeweise verworfen: unter der tatsaechlichen "beste von 5 Restarts"-Auswahl (wie
// im trainBtn-Handler) ueberlappen die Ergebnis-Streubereiche noch zu stark, um in
// einem einzelnen Trainingsklick zuverlaessig sichtbar zu sein. Erst timeW=10000
// (2000x) liefert reproduzierbar (8/8 Testlaeufen) ein klar erkennbares, konsistent
// hoeheres Spitzentempo als "Kombiniert" (~19.9-20 vs. 18.2-19.9 km/h Streubereich),
// weiterhin ohne Crashes.
// crashW skaliert den kompletten Crash-Block in noteFor() mit. Es gibt das Feld, weil
// die Crash-Strafe aus *absoluten* Konstanten besteht (50000 + |v|·5000) und deshalb
// beim Herunterskalieren der drei anderen Gewichte nicht mitgeht: "urgent" unten war
// dadurch nicht nur zeitstrenger, sondern ungewollt rund 100x crash-averser als
// "Kombiniert" (Verhaeltnis Crash- zu regulaerer Strafe ~2·10⁶ statt ~2·10⁴) -- der
// Vergleich zwischen den Varianten war damit konfundiert. Alle Varianten, die auf der
// urspruenglichen Skala rechnen, bekommen 1.
const lossVariants = {
  combined: { label: 'Kombiniert', distW: 1000, speedW: 100, timeW: 5, crashW: 1 },
  accuracy: { label: 'Genauigkeit', distW: 1000, speedW: 100, timeW: 0, crashW: 1 },
  // Gewichte gleichmaessig /100 gegenueber der unskalierten Fassung dieser Variante
  // (10/1/100 statt 1000/100/10000 -- nicht gegenueber "Kombiniert", das timeW=5 hat):
  // Sign-Gradient-Descent nutzt nur das Vorzeichen des Gradienten, eine gleichmaessige
  // Skalierung aller Gewichte aendert also nichts am gefundenen (w,b) -- nur die
  // Strafpunkte-Anzeige waere sonst um Groessenordnungen groesser als bei den anderen
  // Varianten (Δt²·10000 dominiert bei typischem excess~0.1-0.3s alles andere), was bei
  // nicht-technischen Usern verunsichert, obwohl das Ergebnis nicht "schlechter" ist.
  // Damit das wirklich eine reine Skalierung ist, muss crashW mitgezogen werden.
  urgent: { label: 'Starke Zeitstrafe', distW: 10, speedW: 1, timeW: 100, crashW: 0.01 },
  // Umgekehrte Gewichtung (Geschwindigkeit zaehlt staerker als Distanz): laut
  // Grossstichproben-Test (N=200 Einzellaeufe ohne Restart-Auswahl) moderat
  // zuverlaessiger als "Kombiniert" (0 statt 2/200 Crashes, kleinere Ausreisser),
  // aber kein dramatischer Unterschied -- bei "beste von 5 Restarts" (wie im
  // trainBtn-Handler) kaum sichtbar, da das ohnehin die meisten schlechten
  // Einzelversuche aussortiert.
  safety: { label: 'Sicherheit', distW: 100, speedW: 1000, timeW: 0, crashW: 1 },
};
function noteFor(dist, speed, crashed, stopTime, minTime, loss) {
  let note = dist * dist * loss.distW + speed * speed * loss.speedW;
  if (crashed) {
    note += (50000 + Math.abs(speed) * 5000) * loss.crashW;
  } else if (loss.timeW > 0 && stopTime !== undefined && minTime !== undefined) {
    const excess = Math.max(0, stopTime - minTime);
    note += excess * excess * loss.timeW;
  }
  // Strafpunkte sind ohnehin eine erfundene Groesse (keine physikalische
  // Einheit) -- x1000, damit auch sehr kleine dist/speed-Unterschiede nahe
  // der Wand als ganze Zahl sichtbar bleiben, statt beim Runden auf "0" zu
  // verschwinden (x100 reichte dafuer nicht: zwei Restarts nahe der Vorgabezeit
  // rundeten im Trainings-Log noch auf dieselbe "Strafpunkte=0"-Anzeige, obwohl
  // ihre tatsaechlichen -- fuer die Restart-Auswahl massgeblichen -- Kosten
  // sich unterschieden). Reine Multiplikation des fertigen Werts: aendert nichts
  // an Vorzeichen oder Reihenfolge, also weder am Sign-Gradient-Descent (der nur
  // das Vorzeichen der Differenz nutzt) noch an der "bester von 5"-Auswahl noch
  // an der Rangfolge-Faerbung der Landschaft (lsRamp/rankOf in parking.html).
  return note * 1000;
}

// Jeder traj-Eintrag fuehrt neben dem Zustand (t/dist/speed) auch die Zwischenwerte
// der Neuron-Rechnung mit, die zu ihm gefuehrt haben: z (= w'*dist+b vor der
// Aktivierung), die daraus folgende action, und dist/speed *vor* dem Schritt. Damit
// kann logNeuronTrace() in parking.html ein reiner Formatter sein, statt die
// Physikschleife ein zweites Mal nachzubauen -- sonst luegt das Log in dem Moment,
// in dem jemand die Physik nur an einer der beiden Stellen anfasst.
function simulate(w, b, startDist, maxAccel, loss) {
  let dist = startDist, speed = 0, t = 0, crashed = false;
  // Der Startpunkt traegt die Aktion, die das Neuron bei t=0 tatsaechlich ausgibt.
  // Mit `action: 0` fing das Gas/Bremse-Diagramm bei 0 an und sprang erst im zweiten
  // Punkt auf Vollgas -- ausgerechnet der erste Wert stammte dann nicht vom Neuron.
  const z0 = w * (dist / startDist) + b;
  const traj = [{ t, dist, speed, action: hardTanh(z0), z: z0, distBefore: dist, vBefore: 0 }];
  while (t < maxT - 1e-9) {
    const distBefore = dist, vBefore = speed;
    const z = w * (dist / startDist) + b;
    const action = hardTanh(z);
    speed = Math.max(0, speed + (action * maxAccel - dragCoeff * speed) * dt);
    dist -= speed * dt;
    t += dt;
    if (dist <= crashDist) {
      crashed = true;
      traj.push({ t, dist: 0, speed, action, z, distBefore, vBefore, rawDist: dist });
      break;
    }
    traj.push({ t, dist, speed, action, z, distBefore, vBefore, rawDist: dist });
  }
  const last = traj[traj.length - 1];
  const note = crashed
    ? noteFor(last.dist, last.speed, crashed, undefined, undefined, loss)
    : noteFor(last.dist, last.speed, crashed, stopTimeOf(traj), minTimeFor(maxAccel, startDist), loss);
  return { traj, note, crashed };
}

function costOf(w, b, startDist, maxAccel, loss) { return simulate(w, b, startDist, maxAccel, loss).note; }

// Suchraum fuer (w,b): eine Definition fuer Zufallssuche und Descent-Clamping
// zugleich. Vorher zog die Zufallssuche aus [-4,4]x[-3,3], der Descent clampte aber
// auf [-6,6]x[-4,4] -- zwei unabhaengig gewaehlte Zahlenpaare fuer dieselbe Sache.
const wMin = -6, wMax = 6, bMin = -4, bMax = 4;

// "Lernen" heisst hier: ein einzelnes Neuron (2 Parameter w/b, siehe
// simulate()) wird per Gradientenabstieg auf die Strafpunkte optimiert --
// keine Backprop durch Schichten (dafuer gibt es hier keine), sondern ein
// numerischer (finite-Differenzen-)Gradient auf costOf(), und davon nur das
// Vorzeichen statt des Betrags (sign-gradient descent), siehe Begruendung
// unten. Ein einzelner Trainingsversuch: Zufallssuche + Sign-Gradient-Descent.
// Der zu optimierende Cost ist wegen des Crashs nicht stetig (kleine
// Aenderungen an w/b koennen abrupt zwischen "crasht" und "crasht nicht"
// umschlagen), daher ist der numerische Gradient oft lokal flach und der
// Descent kann in einem mittelmaessigen Crash-Punkt haengen bleiben, obwohl
// eine bessere Loesung existiert. Die aeussere Schleife im Klick-Handler
// wiederholt diesen Versuch deshalb mehrfach und behaelt den besten.
function runOnce(startDist, maxAccel, loss) {
  let bestW = 0.5, bestB = -0.5, bestCost = costOf(bestW, bestB, startDist, maxAccel, loss);
  for (let k = 0; k < 60; k++) {
    const rw = wMin + Math.random() * (wMax - wMin);
    const rb = bMin + Math.random() * (bMax - bMin);
    const c = costOf(rw, rb, startDist, maxAccel, loss);
    if (c < bestCost) { bestCost = c; bestW = rw; bestB = rb; }
  }
  let w = bestW, b = bestB;

  // Mitschrift der besuchten (w,b) fuer die Landschaftsdarstellung in parking.html.
  // Reine Zugabe -- die Optimierung selbst liest das Array nie. bestStep haelt fest,
  // an welcher Stelle des Pfades der zurueckgegebene Bestwert gefunden wurde; das ist
  // haeufig lange vor dem Ende (im Median bei Iteration 254 von 350), und ohne diese
  // Zahl sieht man der Anzeige nicht an, dass der Rest des Laufs nichts mehr beitraegt.
  const path = [{ w: w, b: b }];
  let bestStep = 0;

  let stepW = 0.25, stepB = 0.25;
  const totalSteps = 350;
  for (let step = 0; step < totalSteps; step++) {
    // eps ist hier kein numerischer Epsilon-Wert, sondern der Radius, in dem der
    // Differenzenquotient die Crash-Kante ueberhaupt bemerkt. Reicht der Tastpunkt
    // ueber die Kante, meldet der Gradient den Abgrund und der Abstieg wird von ihr
    // weggestossen; liegen beide Tastpunkte auf derselben Seite, misst er das
    // Gefaelle *innerhalb* der Crash-Strafe und zeigt woanders hin. Die erreichbare
    // Naehe zur Kante ist damit ungefaehr eps selbst -- eps muss deshalb mit der
    // Schrittweite mitschrumpfen, sonst hoert der Lauf auf besser zu werden, lange
    // bevor er durch ist. Mit dem frueheren festen eps war davon rund ein Drittel
    // des Laufs betroffen, mit einer zu hoch angesetzten Untergrenze das letzte
    // Viertel.
    //
    // Die Untergrenze ist reiner Schutz fuer den Fall, dass jemand totalSteps
    // erhoeht; bei der aktuellen Schrittfolge greift sie nie, und genau so soll es
    // sein. Sie liegt knapp oberhalb der Breite der Crash-Kante: darunter liegen
    // beide Tastpunkte innerhalb der Crash-Region und der Gradient wird
    // bedeutungslos. Die Fliesskomma-Aufloesung ist dabei nicht die Grenze -- der
    // Quotient bleibt noch weit darunter stabil.
    const eps = Math.max(1e-4, stepW);
    const cw = (costOf(w + eps, b, startDist, maxAccel, loss) - costOf(w - eps, b, startDist, maxAccel, loss)) / (2 * eps);
    const cb = (costOf(w, b + eps, startDist, maxAccel, loss) - costOf(w, b - eps, startDist, maxAccel, loss)) / (2 * eps);
    w -= Math.sign(cw) * stepW;
    b -= Math.sign(cb) * stepB;
    w = Math.max(wMin, Math.min(wMax, w));
    b = Math.max(bMin, Math.min(bMax, b));
    stepW *= 0.98; stepB *= 0.98;
    path.push({ w: w, b: b });

    // Sign-Gradient-Descent hat kein Gedaechtnis: er kann von einer bereits
    // guten Loesung in eine flache Zone abdriften (Gradient dort exakt 0,
    // z.B. wenn das Auto nie anfaehrt) und dort haengen bleiben. Deshalb den
    // besten je gesehenen Zustand separat mitfuehren statt nur den letzten.
    const c = costOf(w, b, startDist, maxAccel, loss);
    if (c < bestCost) { bestCost = c; bestW = w; bestB = b; bestStep = path.length - 1; }
  }
  return { w: bestW, b: bestB, cost: bestCost, path: path, bestStep: bestStep };
}

// Browser: kein `module`, der Block wird uebersprungen -- alle Namen oben liegen
// ohnehin schon im globalen Scope, genau wie vor der Auslagerung. Node: CommonJS
// (das Repo hat keine package.json, .js ist also CJS), require() bekommt hier
// seine Exporte.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dt, maxT, crashDist, d0, dragCoeff,
    hardTanh, stopIndexOf, stopTimeOf,
    bangBangFinal, minTimeFor,
    lossVariants, noteFor,
    wMin, wMax, bMin, bMax,
    simulate, costOf, runOnce,
  };
}
