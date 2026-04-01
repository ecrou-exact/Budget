'use strict';
/* ============================================================
   BUDGE v4.2 — constants.js
   Toutes les constantes globales de l'application
   ============================================================ */

const STORAGE_KEY = 'budge_v3';
const LAYOUT_KEY  = 'budge_v3_layout';
const HISTORY_KEY = 'budge_v4_history';
const MODE_KEY    = 'budge_v4_mode';
const HISTORY_MAX = 200;

const CATEGORIES = ['Alimentation','Transport','Loisirs','Santé','Abonnements','Utilities','Autres'];
const CAT_FA     = { Alimentation:'fa-apple-whole', Transport:'fa-car', Loisirs:'fa-gamepad', Santé:'fa-heart-pulse', Abonnements:'fa-mobile-screen', Utilities:'fa-bolt', Autres:'fa-box' };
const CAT_EMOJI  = { Alimentation:'🍎', Transport:'🚗', Loisirs:'🎮', Santé:'🏥', Abonnements:'📱', Utilities:'💡', Autres:'📦' };
const SUBCATEGORIES = {
  Alimentation: ['Courses','Restaurant','Snacks','Livraison','Repas au travail'],
  Transport:    ['Essence','Transports en commun','Parking','Réparations','Trains','Péage'],
  Loisirs:      ['Cinéma','Jeux','Sorties','Sport','Vacances','Voyages'],
  Santé:        ['Pharmacie','Médecin','Dentiste','Optique','Psychologue','Autres soins','Coiffure','Visites medicales'],
  Abonnements:  ['Streaming','Salle de sport','Internet','Téléphone','Logiciels','Magazines','Abonnement TV','Locations'],
  Utilities:    ['Électricité','Eau','Gaz','Chauffage'],
  Autres:       ['Vêtements','Maison','Divers','Impôts','Cadeaux','Dons','Autres']
};
const INCOME_TYPES = ['Salaire','Prime','Bonus','Freelance','Remboursement','Allocation','Loyer perçu','Dividende','Vente','Autre revenu'];
const CHART_COLORS = ['rgba(99,102,241,.85)','rgba(236,72,153,.85)','rgba(245,158,11,.85)','rgba(16,185,129,.85)','rgba(139,92,246,.85)','rgba(59,130,246,.85)','rgba(239,68,68,.85)'];
const PROJ_COLORS  = ['#4f46e5','#10b981','#ef4444','#f59e0b','#06b6d4','#ec4899','#8b5cf6','#f97316','#14b8a6','#6366f1'];
const PROJ_ICONS   = ['fa-folder','fa-plane','fa-house','fa-car','fa-heart','fa-graduation-cap','fa-gamepad','fa-pizza-slice','fa-baby','fa-paw','fa-ring','fa-umbrella-beach','fa-wrench','fa-laptop','fa-dumbbell','fa-seedling','fa-piggy-bank','fa-gift','fa-music','fa-book'];
