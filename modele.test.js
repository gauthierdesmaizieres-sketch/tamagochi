// Auto-tests du modèle. `node modele.test.js` en console ; la page les rejoue au chargement.
(function (racine) {
  'use strict';

  function autotest(M) {
    const { ETAT_INITIAL: E0, REPAS, MEDICAMENTS, flux, avancer, manger, bouger, expliquer, triglycerides, prendre } = M;

    // Fait tourner `duree` minutes et collecte le min et le max de chaque valeur suivie.
    function simuler(s, duree, suivi = (x) => x) {
      const hist = [];
      for (let t = 0; t < duree; t++) { s = avancer(s, 1); hist.push(suivi(s)); }
      return { fin: s, hist, max: Math.max(...hist), min: Math.min(...hist) };
    }
    const glycemie = (x) => x.G, insuline = (x) => x.I;
    const fructoseSeul = { glucose: 0, fructose: 60, gras: 0 };
    const glucoseSeul = { glucose: 60, fructose: 0, gras: 0 };
    // Une prise, puis `attente` minutes pour que le médicament soit au plus haut.
    const sous = (id, attente) => simuler(id ? prendre(E0, id) : E0, attente).fin;
    const traiter = (id, jours) => {
      let s = E0;
      for (let t = 0; t < jours * 1440; t++) s = avancer(t % 1440 ? s : prendre(s, id), 1);
      return s;
    };

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
      ['un médicament monte puis s\'élimine selon sa demi-vie', () => {
        const pic = simuler(prendre(E0, 'metformine'), 600, (x) => x.c_metformine);
        const tPic = pic.hist.indexOf(pic.max);
        const apres = pic.hist[tPic + MEDICAMENTS.metformine.demiVie];
        return tPic > 60 && tPic < 240 && apres > 0.45 * pic.max && apres < 0.6 * pic.max;
      }],
      ['la metformine freine la néoglucogenèse sans hypoglycémie', () => {
        const r = simuler(prendre(E0, 'metformine'), 24 * 60, glycemie);
        return flux(sous('metformine', 150)).neoglucogenese < 0.8 * flux(sous(null, 150)).neoglucogenese && r.min > 0.8;
      }],
      ['le GLP-1 aplatit le pic de glycémie après un repas', () => {
        const pic = (id) => simuler(manger(sous(id, 600), REPAS.pates), 300, glycemie).max;
        return pic('glp1') < pic(null) - 0.1;
      }],
      ['le SGLT2 fait perdre du glucose dans les urines sans hypoglycémie', () => {
        const r = simuler(prendre(E0, 'sglt2'), 24 * 60, glycemie);
        return flux(sous('sglt2', 150)).glycosurie * 1440 > 20 && r.min > 0.75 && r.fin.G < simuler(E0, 24 * 60).fin.G;
      }],
      ['le fibrate abaisse le pic de triglycérides après un repas gras', () => {
        const pic = (id) => simuler(manger(sous(id, 300), REPAS.fromage), 360, triglycerides).max;
        return pic('fibrate') < pic(null) - 0.2;
      }],
      ['une statine quotidienne baisse le LDL de 25 à 50 % en deux semaines', () => {
        const ldl = traiter('statine', 14).ldl / E0.ldl;
        return ldl > 0.5 && ldl < 0.75 && Math.abs(simuler(E0, 1440).fin.ldl - E0.ldl) < 0.01;
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
