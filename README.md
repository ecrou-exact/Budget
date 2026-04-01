# Budge v4.2 — Structure du Projet

Application de gestion budgétaire personnelle, organisée en modules clairs.

---

## 📁 Structure

```
app/
├── index.html              # Point d'entrée HTML (inchangé)
├── css/
│   └── style.css           # Styles globaux (inchangé)
├── external/               # Librairies tierces (non modifiées)
│   ├── bootstrap.bundle.min.js
│   ├── Sortable.min.js
│   ├── chart.min.js
│   └── html2pdf.bundle.min.js
└── js/
    ├── core/               # Socle de l'application
    │   ├── constants.js    # Toutes les constantes (clés storage, catégories, couleurs…)
    │   ├── state.js        # État global (appData, currentPeriodId, BSModals…)
    │   ├── storage.js      # Lecture/écriture localStorage (save, load)
    │   └── init.js         # DOMContentLoaded — point d'entrée, listeners globaux
    │
    ├── utils/              # Fonctions utilitaires génériques
    │   ├── helpers.js      # genId, formatAmount, escHtml, sortedPeriods…
    │   └── toast.js        # showToast (notifications Bootstrap)
    │
    ├── features/           # Fonctionnalités métier
    │   ├── transactions.js # addIncome, addExpense, deleteItem, editItem, récurrents
    │   ├── periods.js      # CRUD périodes, navigation, sélection
    │   ├── projects.js     # CRUD projets, dépôt rapide, widget, vue détail
    │   ├── history.js      # Snapshots auto/manuel, rendu, aperçu, téléchargement
    │   ├── report.js       # Génération du rapport HTML par période
    │   └── export.js       # Export/import JSON & CSV, generatePDFReport
    │
    ├── ui/                 # Interface utilisateur
    │   ├── tabs.js         # Navigation par onglets
    │   ├── theme.js        # Modes dark/light/zen
    │   ├── layout.js       # Drag & drop widgets (Sortable), save/restore layout
    │   ├── filters.js      # Filtre catégories, sous-catégories, autocomplete
    │   └── render.js       # Rendu listes (revenus/dépenses), stats KPI, overlay
    │
    └── charts/             # Graphiques Chart.js
        ├── charts.js       # Dashboard (donut/bar) + analytics (trend/stacked/savings)
        └── annual.js       # Grille des périodes (vue annuelle)
```

---

## 🔄 Ordre de chargement

Les scripts sont chargés dans l'ordre suivant dans `index.html` :

1. **core/constants.js** → variables globales disponibles partout
2. **core/state.js** → état mutable + cache BS modals
3. **core/storage.js** → `save()` / `load()`
4. **utils/helpers.js** → fonctions pures (pas de dépendances)
5. **utils/toast.js** → `showToast()`
6. **features/history.js** → `saveHistorySnapshot()` (utilisé par storage)
7. **features/transactions.js** → inclut `propagateRecurringToPeriod()`
8. **features/periods.js** → dépend de transactions + history
9. **features/projects.js** → dépend de render (via updateAllUI)
10. **features/report.js** → dépend de helpers + state
11. **features/export.js** → dépend de report + history
12. **ui/tabs.js** → dépend de toutes les features (appels lazy)
13. **ui/theme.js** → autonome
14. **ui/layout.js** → dépend de Sortable
15. **ui/filters.js** → dépend de render
16. **ui/render.js** → `updateAllUI()` — orchestre tout le rendu
17. **charts/annual.js** → `renderPeriodsGrid()`
18. **charts/charts.js** → `updateExpenseChart()` etc.
19. **core/init.js** → `DOMContentLoaded` — démarre tout

---

## 🛠️ Technologies

- **Bootstrap 5.3** — UI components & grid
- **Font Awesome 6** — icônes
- **Chart.js** — graphiques
- **Sortable.js** — drag & drop widgets
- **html2pdf** — export PDF
- **localStorage** — persistance des données (aucun backend)

---

## 🖥️ Lancement en application de bureau (Electron)

### Prérequis
- [Node.js](https://nodejs.org) v18+ installé

### Démarrage rapide

**Linux / Mac :**
```bash
./start.sh
```

**Windows :**
Double-cliquer sur `start.bat`

**Manuellement :**
```bash
npm install   # une seule fois
npm start
```

### Structure des sauvegardes (mode Electron)

```
~/.config/budge/Budge/backups/     (Linux)
~/Library/Application Support/Budge/backups/  (Mac)
%APPDATA%\budge\Budge\backups\     (Windows)
│
├── 2025/
│   ├── budge_2025_Salaire_Janvier.json
│   ├── budge_2025_Salaire_Fevrier.json
│   └── budge_2025_Salaire_Mars.json
│
└── 2026/
    ├── budge_2026_Janvier_2026.json
    └── budge_2026_Fevrier_2026.json
```

- **Sauvegarde automatique** à chaque fermeture de l'app
- **Sauvegarde manuelle** via l'onglet Historique → "Sauvegarder maintenant"
- **Suppression** : quand tu supprimes une période, le fichier backup est supprimé
- **Dossier année** : créé automatiquement selon la date de DÉBUT de la période

### Mode navigateur (sans Electron)

| Navigateur | Méthode |
|---|---|
| Chrome / Edge | Dossier choisi via "Choisir le dossier", sauvegarde silencieuse |
| Firefox | Téléchargement du fichier JSON à chaque sauvegarde |
