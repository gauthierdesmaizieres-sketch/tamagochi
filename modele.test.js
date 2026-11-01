// Auto-tests du modèle. `node modele.test.js` en console ; la page les rejoue au chargement.
(function (racine) {
  'use strict';

  function autotest(M) {
    const { ETAT_INITIAL: E0, REPAS, flux, avancer, manger, bouger, expliquer, triglycerides } = M;

    // Fait tourner `duree` minutes et collecte le min et le max de chaque valeur suivie.
    function simuler(s, duree, suivi = (x) => x) {
      const hist = [];
      for (let t = 0; t < duree; t++) { s = avancer(s, 1); hist.push(suivi(s)); }
      return { fin: s, hist, max: Math.max(...hist), min: Math.min(...hist) };
    }
    const glycemie = (x) => x.G, insuline = (x) => x.I;
    const fructoseSeul = { glucose: 0, fructose: 60, gras: 0 };
    const glucoseSeul = { glucose: 60, fructose: 0, gras: 0 };

    const verifications = [
      ['le glycogène hépatique baisse pendant un jeûne', () => {
        const j = simuler(E0, 24 * 60).fin;
        return j.glycogeneFoie < E0.glycogeneFoie * 0.5 && j.glycogeneMuscle > E0.glycogeneMuscle * 0.97;
      }],
      ['le jeûne augmente l\'oxydation des graisses', () =>
        flux(simuler(E0, 24 * 60).fin).oxydationGras > flux(E0).oxydationGras],
      ['la glycémie tient pendant 72 h de jeûne', () => {
        const j = simuler(E0, 72 * 60, glycemie);
        return j.min > 0.6 && j.fin.glycogeneFoie < 10;
      }],
      ['l\'insuline monte après un repas glucidique', () => {
        const r = simuler(manger(E0, REPAS.pates), 180, insuline);
        return r.max > 3 * E0.I && r.max < 120;
      }],
      ['la glycémie monte après un repas puis redescend', () => {
        const r = simuler(manger(E0, REPAS.pates), 300, glycemie);
        return r.max > 1.15 && r.max < 1.8 && r.fin.G < 1.05;
      }],
      ['un repas remplit foie et muscles', () => {
        const r = simuler(manger(E0, REPAS.pates), 240).fin;
        return r.glycogeneFoie > E0.glycogeneFoie + 5 && r.glycogeneMuscle > E0.glycogeneMuscle + 10;
      }],
      ['un repas glucidique coupe l\'oxydation des graisses', () =>
        flux(simuler(manger(E0, REPAS.pates), 90).fin).oxydationGras < 0.5 * flux(E0).oxydationGras],
      ['le glycogène musculaire baisse pendant l\'exercice', () => {
        const r = simuler(bouger(E0), 60).fin;
        return r.glycogeneMuscle < E0.glycogeneMuscle - 30 && r.G > 0.7;
      }],
      ['l\'exercice brûle des graisses et fait taire l\'insuline', () => {
        const r = simuler(bouger(E0), 30).fin;
        return flux(r).oxydationGras > 3 * flux(E0).oxydationGras && r.I < 0.6 * E0.I;
      }],
      ['le fructose alimente surtout le foie', () => {
        const r = simuler(manger(E0, fructoseSeul), 240).fin;
        const gainFoie = r.glycogeneFoie - E0.glycogeneFoie, gainMuscle = r.glycogeneMuscle - E0.glycogeneMuscle;
        return gainFoie > 2 * gainMuscle && gainFoie > simuler(manger(E0, glucoseSeul), 240).fin.glycogeneFoie - E0.glycogeneFoie;
      }],
      ['le fructose élève peu glycémie et insuline, à dose égale de glucose', () => {
        const f = simuler(manger(E0, fructoseSeul), 180, insuline).max;
        const g = simuler(manger(E0, glucoseSeul), 180, insuline).max;
        return f < 0.6 * g;
      }],
      ['la lipogenèse fructose augmente quand le foie est plein', () => {
        const plein = { ...E0, glycogeneFoie: 115 };
        const pic = (s) => simuler(manger(s, fructoseSeul), 120, (x) => flux(x).lipogenese).max;
        return pic(plein) > 2 * pic(E0);
      }],
      ['un repas gras élève les triglycérides sans insuline', () => {
        const r = simuler(manger(E0, REPAS.fromage), 240, triglycerides);
        return r.max > triglycerides(E0) + 0.3 && simuler(manger(E0, REPAS.fromage), 240, insuline).max < 2 * E0.I;
      }],
      ['le ventre plein refuse de manger', () => {
        let s = E0, n = 0;
        while ((s = manger(s, REPAS.pates)) && n < 20) n++;
        return n > 1 && n < 10;
      }],
      ['une longue séance à jeun fait baisser la glycémie sans la vider', () => {
        const vide = simuler(E0, 48 * 60).fin;
        const r = simuler(bouger(bouger(bouger(vide))), 170, glycemie);
        return r.min < 0.72 && r.min > 0.45;
      }],
      ['il y a toujours une explication', () =>
        [E0, simuler(E0, 3000).fin, manger(E0, REPAS.soda), bouger(E0)].every((s) => expliquer(s).length > 0)],
      ['le modèle reste fini sous une pluie de repas', () => {
        let s = E0;
        for (let i = 0; i < 40; i++) s = simuler(manger(s, REPAS.soda) || s, 30).fin;
        return Object.values(s).every(Number.isFinite) && s.G < 3;
      }],
    ];

    return verifications.map(([nom, f]) => ({ nom, ok: f() === true }));
  }

  if (typeof module !== 'undefined' && require.main === module) {
    const resultats = autotest(require('./modele.js'));
    for (const r of resultats) console.log(`${r.ok ? 'ok  ' : 'ÉCHEC'} ${r.nom}`);
    process.exit(resultats.every((r) => r.ok) ? 0 : 1);
  }
  racine.autotest = autotest;
})(this);
