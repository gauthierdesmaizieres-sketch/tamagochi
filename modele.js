// Modèle métabolique simplifié d'un adulte de 70 kg. Aucun accès au DOM : testable sous Node.
// Temps en minutes, masses en grammes, flux en g/min, glycémie et triglycérides en g/L, insuline en mU/L.
(function (racine) {
  'use strict';

  const P = {
    Vglucose: 11,      // L, volume de distribution du glucose
    Vplasma: 3,        // L
    Ibase: 8,          // mU/L
    GFmax: 120,        // g, glycogène hépatique
    GMmax: 450,        // g, glycogène musculaire
    repos: 1.2,        // kcal/min
    effort: 9,         // kcal/min en plus pendant une séance
    glucidesVersGras: 0.33, // g de gras par g de glucide : la lipogenèse perd beaucoup de masse
    tampon: 0.02,      // g/min d'acides gras du tissu adipeux réestérifiés par le foie
    TGbase: 0.8,       // g/L
    dureeSeance: 60,   // min
    ventreMax: 250,    // g, au-delà Tama refuse de manger
    LDLbase: 1.3,      // g/L sans traitement
    kLDL: Math.LN2 / (3 * 1440), // /min, une particule LDL vit environ 3 jours
    CE50: 0.5,         // concentration (en doses) qui donne la moitié de l'effet maximal
  };

  // Pharmacocinétique à un compartiment : absorption (ka, /min) puis élimination selon la demi-vie (min).
  // Les doses sont illustratives : une prise ajoute 1 au dépôt intestinal.
  const MEDICAMENTS = {
    metformine: { nom: 'Metformine', icone: '💊', ka: 1 / 60, demiVie: 5 * 60,
      action: 'freine la néoglucogenèse du foie' },
    glp1: { nom: 'GLP-1', icone: '💉', ka: 1 / 300, demiVie: 13 * 60,
      action: 'type liraglutide : ralentit l\'estomac et amplifie l\'insuline quand le sucre monte' },
    sglt2: { nom: 'SGLT2', icone: '💧', ka: 1 / 40, demiVie: 13 * 60,
      action: 'type dapagliflozine : le rein laisse partir du glucose dans les urines' },
    fibrate: { nom: 'Fibrate', icone: '🧪', ka: 1 / 90, demiVie: 20 * 60,
      action: 'type fénofibrate : active la lipoprotéine lipase, moins de VLDL' },
    statine: { nom: 'Statine', icone: '❤️', ka: 1 / 40, demiVie: 20 * 60,
      action: 'type atorvastatine : bloque l\'HMG-CoA réductase, le foie capte plus de LDL' },
  };

  const ETAT_INITIAL = Object.freeze({
    ventreGlucose: 0, ventreFructose: 0, ventreGras: 0,
    G: 0.9, I: 8,
    fructoseFoie: 0,
    glycogeneFoie: 70, glycogeneMuscle: 300,
    grasFoie: 30, tgSang: 0.33, grasAdipeux: 12000,
    seance: 0, e: 0,
    ldl: P.LDLbase,
    ...Object.fromEntries(Object.keys(MEDICAMENTS).flatMap((id) => [[`d_${id}`, 0], [`c_${id}`, 0]])),
  });

  // Part de l'effet maximal, de 0 à 1 (loi Emax).
  const effet = (s, id) => s[`c_${id}`] / (s[`c_${id}`] + P.CE50);

  // Repas en grammes. Le soda est du saccharose : moitié glucose, moitié fructose.
  const REPAS = {
    pates: { nom: 'Pâtes', icone: '🍝', glucose: 90, fructose: 0, gras: 10 },
    soda: { nom: 'Soda 1 L', icone: '🥤', glucose: 50, fructose: 55, gras: 0 },
    fromage: { nom: 'Fromage et noix', icone: '🧀', glucose: 5, fructose: 0, gras: 50 },
  };

  // Tous les flux instantanés (g/min) : c'est le cœur du modèle, derivees() ne fait que les additionner.
  function flux(s) {
    const { G, I, e } = s;
    const insuline = Math.max(0, I - P.Ibase);
    const ix = insuline / (insuline + 60); // action de l'insuline, de 0 à 1
    const rF = s.glycogeneFoie / P.GFmax;
    const rM = s.glycogeneMuscle / P.GMmax;
    const vidange = 1 - 0.5 * effet(s, 'glp1'); // le GLP-1 ralentit la vidange de l'estomac

    const absGlucose = vidange * 1.2 * s.ventreGlucose / (s.ventreGlucose + 15);
    const absFructose = vidange * 1.0 * s.ventreFructose / (s.ventreFructose + 10);
    const absGras = vidange * 0.2 * s.ventreGras / (s.ventreGras + 15);

    // Le fructose est phosphorylé par le foie sans contrôle de l'insuline ; le partage dépend du remplissage du foie.
    const fructolyse = 0.1 * s.fructoseFoie;
    const partGlycogene = 0.7 * (1 - rF ** 4);
    const partLipogenese = 0.05 + 0.5 * rF ** 6;
    const fructoseVersGlycogene = fructolyse * partGlycogene;
    const fructoseVersGras = fructolyse * partLipogenese;
    const fructoseVersGlucose = fructolyse - fructoseVersGlycogene - fructoseVersGras;

    const stockageFoie = 0.8 * ix * (1 - rF ** 4);
    const glucoseVersGras = 0.4 * ix * rF ** 8; // négligeable tant que le foie n'est pas plein
    const contreRegulation = 15 * Math.max(0, 0.8 - G);
    const glycogenolyse = (0.07 * (1 + contreRegulation) * (1 - ix) ** 4 + 0.38 * e) * s.glycogeneFoie / (s.glycogeneFoie + 15);
    const neoglucogenese = (0.055 + 0.04 * (1 - rF)) * (1 - 0.4 * effet(s, 'metformine'));

    const cerveau = 0.094 * G / (G + 0.1) * (0.6 + 0.4 * Math.min(1, rF / 0.3)); // foie vide : les cétones remplacent une partie du glucose
    const captageInsuline = 2.0 * ix * G / 0.9;
    const captageBase = 0.05 * G / 0.9 * Math.min(1, I / P.Ibase) ** 2; // à jeun, le muscle épargne le glucose pour le cerveau
    const captageEffort = 0.4 * e * Math.min(1, Math.max(0, (G - 0.5) / 0.3)); // en hypoglycémie, le muscle cesse de puiser dans le sang
    const partStockee = 0.7 * (1 - rM ** 4);
    const stockageMuscle = captageInsuline * partStockee;

    // À l'effort les glucides fournissent 65 % de l'énergie, moins quand le muscle se vide.
    const partGlucides = 0.65 * (0.3 + 0.7 * Math.min(1, rM / 0.3));
    const glucidesEffort = P.effort * e * partGlucides / 4;
    const glycogenolyseMuscle = Math.max(0, glucidesEffort - captageEffort) * s.glycogeneMuscle / (s.glycogeneMuscle + 10);

    // Au repos, les graisses couvrent ce que les glucides ne couvrent pas : l'insuline les éteint via l'afflux de glucose.
    const glucidesRepos = cerveau + captageBase + captageInsuline - stockageMuscle;
    const oxydationGras = Math.max(0.005, (P.repos - 4 * glucidesRepos) / 9) + P.effort * e * (1 - partGlucides) / 9;

    // Seuil rénal abaissé : même à glycémie normale, une partie du glucose filtré n'est plus réabsorbée.
    const glycosurie = 0.12 * effet(s, 'sglt2') * Math.max(0, G - 0.4);

    const lipogenese = (fructoseVersGras + glucoseVersGras) * P.glucidesVersGras;
    const vldl = 0.00067 * s.grasFoie * (1 - 0.3 * effet(s, 'fibrate'));
    const clairanceTG = 0.06 * s.tgSang * (1 + effet(s, 'fibrate'));
    const recepteursLDL = 1 + 0.8 * effet(s, 'statine'); // moins de cholestérol fabriqué : le foie expose plus de récepteurs

    return {
      ix, absGlucose, absFructose, absGras, fructolyse, fructoseVersGlycogene, fructoseVersGlucose,
      stockageFoie, glucoseVersGras, glycogenolyse, neoglucogenese, cerveau,
      captageInsuline, captageBase, captageEffort, stockageMuscle, glycogenolyseMuscle,
      oxydationGras, lipogenese, vldl, clairanceTG, glycosurie, recepteursLDL,
    };
  }

  function derivees(s) {
    const f = flux(s);
    const secretion = 88 * s.G ** 8 / (1.2 ** 8 + s.G ** 8);
    const incretines = (1 + 0.6 * f.absGlucose / (f.absGlucose + 0.4)) * (1 + effet(s, 'glp1'));
    const adrenaline = 1 - 0.7 * s.e;
    const d = {
      ventreGlucose: -f.absGlucose,
      ventreFructose: -f.absFructose,
      ventreGras: -f.absGras,
      G: (f.absGlucose + f.fructoseVersGlucose + f.glycogenolyse + f.neoglucogenese
        - f.cerveau - f.captageBase - f.captageInsuline - f.captageEffort - f.stockageFoie - f.glucoseVersGras - f.glycosurie) / P.Vglucose,
      I: 0.12 * (secretion * incretines * adrenaline - s.I),
      fructoseFoie: f.absFructose - f.fructolyse,
      glycogeneFoie: f.stockageFoie + f.fructoseVersGlycogene - f.glycogenolyse,
      glycogeneMuscle: f.stockageMuscle - f.glycogenolyseMuscle,
      grasFoie: f.lipogenese + P.tampon - f.vldl,
      tgSang: f.absGras + f.vldl - f.clairanceTG,
      grasAdipeux: f.clairanceTG - f.oxydationGras - P.tampon,
      seance: s.seance > 0 ? -1 : 0,
      e: ((s.seance > 0 ? 1 : 0) - s.e) / 3,
      ldl: P.kLDL * (P.LDLbase - s.ldl * f.recepteursLDL),
    };
    for (const [id, m] of Object.entries(MEDICAMENTS)) {
      d[`d_${id}`] = -m.ka * s[`d_${id}`];
      d[`c_${id}`] = m.ka * s[`d_${id}`] - Math.LN2 / m.demiVie * s[`c_${id}`];
    }
    return d;
  }

  function combine(s, d, h) {
    const r = {};
    for (const k in s) r[k] = s[k] + h * d[k];
    return r;
  }

  // Runge-Kutta d'ordre 4 : retourne un nouvel état, sans modifier l'ancien.
  function avancer(s, dt) {
    const k1 = derivees(s);
    const k2 = derivees(combine(s, k1, dt / 2));
    const k3 = derivees(combine(s, k2, dt / 2));
    const k4 = derivees(combine(s, k3, dt));
    const r = {};
    for (const k in s) r[k] = Math.max(0, s[k] + dt / 6 * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]));
    return r;
  }

  function manger(s, repas) {
    if (s.ventreGlucose + s.ventreFructose + s.ventreGras > P.ventreMax) return null;
    return {
      ...s,
      ventreGlucose: s.ventreGlucose + repas.glucose,
      ventreFructose: s.ventreFructose + repas.fructose,
      ventreGras: s.ventreGras + repas.gras,
    };
  }

  function bouger(s) {
    return { ...s, seance: s.seance + P.dureeSeance };
  }

  const prendre = (s, id) => ({ ...s, [`d_${id}`]: s[`d_${id}`] + 1 });

  // Triglycérides affichés : le plancher à jeun n'est pas simulé, seul l'excédent l'est.
  const triglycerides = (s) => P.TGbase + s.tgSang / P.Vplasma;

  // Ce qui se passe maintenant, du plus marquant au plus discret. Toujours au moins une phrase.
  function expliquer(s) {
    const f = flux(s);
    const phrases = [];
    if (s.e > 0.3) phrases.push('Séance : les muscles brûlent leur glycogène et l\'insuline s\'efface.');
    if (s.G < 0.72) phrases.push('Glycémie basse : le corps sécrète du glucagon et le foie envoie tout ce qu\'il peut.');
    if (effet(s, 'metformine') > 0.2) phrases.push('Metformine : le foie fabrique moins de glucose neuf. Chez Tama, en bonne santé, la glycémie bouge à peine.');
    if (effet(s, 'glp1') > 0.2) phrases.push('GLP-1 : l\'estomac se vide lentement, le pancréas répond plus fort au sucre.');
    if (f.glycosurie > 0.01) phrases.push('SGLT2 bloqué : le rein laisse filer du glucose dans les urines.');
    if (effet(s, 'fibrate') > 0.2) phrases.push('Fibrate : les triglycérides quittent le sang plus vite.');
    if (effet(s, 'statine') > 0.2) phrases.push('Statine : le foie fabrique moins de cholestérol et capte plus de LDL. Plein effet en quelques semaines.');
    if (f.absFructose > 0.05) phrases.push('Le fructose file droit au foie, sans passer par l\'insuline.');
    if (f.lipogenese > 0.03) phrases.push('Lipogenèse active : le foie transforme le surplus en graisse.');
    if (f.absGlucose > 0.1) phrases.push('Le glucose du repas passe de l\'intestin au sang.');
    if (s.I > 25) phrases.push('L\'insuline est haute : elle ouvre les muscles au glucose et coupe la libération de sucre par le foie.');
    if (f.stockageFoie + f.fructoseVersGlycogene > 0.06) phrases.push('Le foie stocke le glycogène.');
    if (f.stockageMuscle > 0.1) phrases.push('Les muscles refont leurs réserves de glycogène.');
    if (f.absGras > 0.03) phrases.push('Les graisses du repas arrivent dans le sang, puis vers le tissu adipeux. L\'insuline bouge à peine.');
    if (s.glycogeneFoie < 15) phrases.push('Foie presque vide : la néoglucogénèse prend le relais pour nourrir le cerveau.');
    else if (f.glycogenolyse > 0.04 && s.e < 0.3) phrases.push('À jeun, le foie libère son glycogène pour tenir la glycémie.');
    if (f.oxydationGras > 0.07 && s.e < 0.3 && f.ix < 0.05) phrases.push('Insuline basse : les graisses deviennent le carburant principal.');
    if (!phrases.length) phrases.push('Tout est calme : le corps passe d\'un carburant à l\'autre.');
    return phrases;
  }

  const api = { P, ETAT_INITIAL, REPAS, MEDICAMENTS, flux, effet, prendre, avancer, manger, bouger, expliquer, triglycerides };
  if (typeof module !== 'undefined') module.exports = api;
  else racine.Modele = api;
})(this);
