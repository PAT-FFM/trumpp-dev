#!/usr/bin/env node
// Selbsttest fuer die Einpark-Demo: faehrt alle Fahrzeugklassen x Lossfunktionen
// durch und prueft, dass das Training brauchbare Ergebnisse liefert.
//
// Hintergrund: die Kommentare in parking-core.js begruenden die gewaehlten
// Loss-Gewichte mit Stichproben ("N=200 Einzellaeufe", "8/8 Testlaeufen"), die
// bisher nirgends reproduzierbar waren. Dieses Skript ist dieses fehlende
// Artefakt -- es macht die Behauptungen nachpruefbar und faengt Regressionen,
// wenn jemand an noteFor(), simulate() oder runOnce() dreht.
//
//   node scripts/parking-selftest.js [--runs N]
//
// Exit-Code 1, sobald eine der Schranken unten verletzt wird.

const core = require('../parking-core.js');
const { d0, lossVariants, simulate, runOnce, stopTimeOf, minTimeFor } = core;

const RESTARTS = 5;              // identisch zum trainBtn-Handler in parking.html
const CAR_CLASSES = [1.5, 2.0, 3.5];
const CLASS_NAMES = { 1.5: 'Kleinwagen', 2.0: 'Mittelklasse', 3.5: 'Sportwagen' };

// Bewusst locker: der Test soll Regressionen fangen, nicht bei der normalen
// Streuung des Zufallsstarts rot werden.
const MAX_DIST = 0.30;           // m Restabstand zur Wand
const MAX_TIME_OVER = 1.0;       // s ueber der Bang-Bang-Vorgabe

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > -1 ? parseInt(process.argv[runsArg + 1], 10) : 20;

// Ein vollstaendiger Trainingsklick: bester aus RESTARTS unabhaengigen Versuchen.
function train(maxAccel, loss) {
  let best = null;
  for (let i = 0; i < RESTARTS; i++) {
    const r = runOnce(d0, maxAccel, loss);
    if (!best || r.cost < best.cost) best = r;
  }
  return best;
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

console.log('Einpark-Demo Selbsttest  --  ' + RUNS + ' Trainings je Kombination, '
  + 'bester aus ' + RESTARTS + ' Restarts\n');
console.log('Fahrzeug      Loss              Crash   Ø Stopp (Vorgabe)   Ø Rest    w-Spanne');
console.log('-'.repeat(80));

const failures = [];

for (const maxAccel of CAR_CLASSES) {
  const minTime = minTimeFor(maxAccel);
  for (const key of Object.keys(lossVariants)) {
    const loss = lossVariants[key];
    let crashes = 0;
    const stopTimes = [], dists = [], ws = [];

    for (let i = 0; i < RUNS; i++) {
      const best = train(maxAccel, loss);
      const r = simulate(best.w, best.b, d0, maxAccel, loss);
      const last = r.traj[r.traj.length - 1];
      ws.push(best.w);
      if (r.crashed) { crashes++; continue; }
      stopTimes.push(stopTimeOf(r.traj));
      dists.push(last.dist);
    }

    const ok = RUNS - crashes;
    const avgT = ok ? mean(stopTimes) : NaN;
    const avgD = ok ? mean(dists) : NaN;
    ws.sort((a, b) => a - b);

    console.log(
      CLASS_NAMES[maxAccel].padEnd(14) +
      loss.label.padEnd(18) +
      (crashes + '/' + RUNS).padEnd(8) +
      (avgT.toFixed(2) + 's (' + minTime.toFixed(1) + 's)').padEnd(20) +
      (avgD.toFixed(3) + 'm').padEnd(10) +
      ws[0].toFixed(2) + '..' + ws[ws.length - 1].toFixed(2)
    );

    const where = CLASS_NAMES[maxAccel] + ' / ' + loss.label;
    if (crashes > 0) failures.push(where + ': ' + crashes + '/' + RUNS + ' Crashes');
    if (ok && avgD > MAX_DIST) failures.push(where + ': Ø Restabstand ' + avgD.toFixed(3) + 'm > ' + MAX_DIST + 'm');
    if (ok && avgT > minTime + MAX_TIME_OVER) failures.push(where + ': Ø Stoppzeit ' + avgT.toFixed(2) + 's > Vorgabe + ' + MAX_TIME_OVER + 's');
  }
}

console.log('\nBang-Bang-Vorgabezeiten:');
for (const a of CAR_CLASSES) {
  console.log('  ' + CLASS_NAMES[a].padEnd(14) + 'maxAccel=' + a.toFixed(1) + '  minTime=' + minTimeFor(a).toFixed(2) + 's');
}

if (failures.length) {
  console.log('\nFEHLGESCHLAGEN:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\nAlle Schranken eingehalten.');
