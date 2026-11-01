# Tamagotchi métabolique

Jouet pédagogique en français : on nourrit et on fait bouger Tama, une simulation métabolique tourne en coulisses. Pas un outil médical.

- `modele.js` : équations différentielles (RK4, pas de 1 min), sans DOM. Toute la physiologie vit ici.
- `modele.test.js` : auto-tests, rejoués au chargement de la page et affichés en pied de page.
- `index.html` : affichage seul, sans dépendance ni étape de build.

```bash
node modele.test.js
```

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Le second lance le serveur derrière le lien « Local · Tamagotchi » de Jarvis. La page s'ouvre aussi directement, sans serveur.

Toute modification du modèle garde les auto-tests verts ; un nouveau comportement physiologique ajoute son test.
