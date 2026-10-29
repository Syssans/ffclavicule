/**
 * Ce que les données du jeu ne disent pas : comment faire apparaître chaque rang S, et après combien de temps
 * une marque peut revenir. Rédigé à partir des guides de la communauté (Console Games Wiki, FFXIVHunt,
 * Icy Veins, srankguide…), qui s'accordent sur ces conditions ; les délais ne sont publiés nulle part par le jeu
 * et restent des estimations.
 */

export interface SpawnNote {
  /** Comment la faire apparaître (texte court, au présent). */
  how: string;
  /** Objets en jeu à citer (fiches objet). */
  items?: number[];
  /** Condition supposée, pas encore confirmée. */
  theory?: boolean;
  /** Délai de réapparition propre à cette marque, en heures : [min, max] puis après maintenance. */
  window?: [number, number];
  afterMaintenance?: [number, number];
}

/** Rang S de chaque zone, par numéro de territoire. */
export const S_RANK_NOTES: Record<number, SpawnNote> = {
  // ——— A Realm Reborn ———
  134: {
    how: 'Extraire du Terreau noscéen III au point de récolte à horaires de la zone (de 19 h à 22 h, heure d’Éorzéa).',
    items: [7760],
  },
  135: { how: 'Passer sur ses points d’apparition (à pied, en monture ou en vol) une nuit de pleine lune, après 17 h (heure d’Éorzéa).' },
  137: { how: 'Apparaît de lui-même quand il n’a ni plu ni bruiné dans la zone pendant 200 minutes réelles d’affilée.' },
  138: { how: 'Récolter du Poireau noscéen au point de récolte à horaires de la zone (de 8 h à 11 h, heure d’Éorzéa).', items: [7593] },
  139: { how: 'Passer sur ses points d’apparition avec une mascotte invoquée.' },
  180: { how: 'Qu’un joueur soit mis K.O. dans la zone.' },
  140: { how: 'Pêcher un Cyprin de platine aux Sources de Nophica.', items: [7714] },
  141: { how: 'Manger un plat sur l’un de ses points d’apparition.' },
  145: { how: 'Lancer un mandat de mercenariat dans la zone.' },
  146: { how: 'Que tous les ALÉA de la zone réussissent pendant une heure réelle, sans un seul échec.' },
  147: { how: 'Vaincre une centaine d’élémentaires de terre dans la zone.' },
  148: { how: 'Apparaît pendant une longue pluie (environ 30 minutes réelles de pluie sans interruption).' },
  152: {
    how: 'Aucune condition confirmée. Les pistes de la communauté évoquent les mandats et les ALÉA de la zone.',
    theory: true,
    window: [66, 78],
    afterMaintenance: [39, 47],
  },
  153: { how: 'Passer sur ses points d’apparition à minuit (heure d’Éorzéa), une nuit de nouvelle lune.' },
  154: {
    how: 'Pêcher une Raie juge au lac de la Calebasse (de 17 h à 21 h, heure d’Éorzéa, avec une Mouche tetrax).',
    items: [7695, 2623],
    window: [57, 63],
    afterMaintenance: [34, 38],
  },
  155: { how: 'Aucune condition confirmée par la communauté.', theory: true },
  156: {
    how: 'Ouvrir le coffre d’une vieille carte au trésor (peau de sanglier, de peiste, de crapaud…) dont le trésor se trouve en Mor Dhona.',
    items: [6691, 6692, 6690],
  },

  // ——— Heavensward ———
  397: { how: 'Passer sur ses points d’apparition avec la mascotte prince bébéhémoth invoquée (400 sceaux du Centurio).' },
  398: { how: 'Terminer l’ALÉA « Bas les hippogriffes » cinq fois d’affilée.' },
  399: { how: 'Ouvrir le coffre d’une Vieille carte en peau de wyverne dont le trésor se trouve dans la zone.', items: [12242] },
  400: {
    how: 'Extraire du Minerai d’aurum regis ou récolter des Fleurs astrales aux points légendaires de la zone (tomes de folklore dravanien requis).',
    items: [12536, 12634],
  },
  401: { how: 'Peut surgir quand le rang B Squonk lance son cri (« Chirp »).', theory: true },
  402: { how: 'Vaincre 50 chimères allagoises, 50 vouivres méracydiennes et 50 hydres mineures.', theory: true },

  // ——— Stormblood ———
  612: { how: 'Vaincre 100 liéchis (près de Castrum Oriens) et 100 diakkas.' },
  613: { how: 'Vaincre 100 yumemis et 100 yumemis nus pendant la pleine lune, à partir de midi (heure d’Éorzéa).' },
  614: {
    how: 'Passer sur ses points d’apparition avec la mascotte Alexander articulé (Alexander - L’Âme du Créateur), de préférence entre 17 h et 8 h (heure d’Éorzéa).',
  },
  620: { how: 'Traverser la zone en chocobo de transport, d’Ala Ghiri à Ala Gannha : il peut surgir au passage de la moitié nord à la moitié sud.' },
  621: { how: 'Jeter un objet de son inventaire 50 fois dans la zone.' },
  622: { how: 'Terminer l’ALÉA « Défi : Gergei a la bougeotte », puis passer sur ses points d’apparition.' },

  // ——— Shadowbringers ———
  813: { how: 'Jeter un Filet de râle, n’importe où dans la zone.', items: [27850] },
  814: { how: 'Récolter 50 fois des Fleurs de coton nain (les récoltes des autres joueurs comptent aussi).', items: [27759] },
  815: { how: 'Lancer le sort de mage bleu Auto-destruction sur l’un de ses points d’apparition.' },
  816: { how: 'Passer sur ses points d’apparition avec la mascotte paonne vermillon.' },
  817: { how: 'Vaincre 100 poupées ronka fissurées, 100 épines ronka fissurées et 100 réceptacles ronka fissurés.' },
  818: {
    how: 'Attirer trois sangsues des profondeurs jusqu’à une clionide : touchées par son attaque, elles grossissent. Attention, cette attaque peut tuer un joueur d’un coup.',
  },

  // ——— Endwalker ———
  956: {
    how: 'Passer sur ses points d’apparition avec la mascotte petit troll (le Prisme de l’Aitia), de 9 h à 17 h (heure d’Éorzéa), par temps clair ou beau temps.',
  },
  957: { how: 'Vaincre 100 asvatthas, 100 pishachas et 100 vajralangulas.' },
  958: {
    how: 'Mourir sur l’un de ses points d’apparition en portant le Heaume impérial réparé et la Demi-robe impériale réparée.',
    items: [6223, 6224],
  },
  959: { how: 'Vaincre 100 penseurs, 100 vagabonds et 100 lamenteurs.' },
  960: { how: 'Dix joueurs, mascotte mini-Éa invoquée, passent ensemble sur ses points d’apparition.' },
  961: { how: 'Jeter d’un coup une pile d’au moins 5 Œufs d’oiseau d’Elpis.', items: [36256] },

  // ——— Dawntrail ———
  1187: {
    how: 'Voler au-dessus de ses points d’apparition une nuit de nouvelle lune, par temps de brouillard, entre minuit et 6 h (heure d’Éorzéa).',
  },
  1188: { how: 'Voler bas au-dessus de ses points d’apparition avec la mascotte morpho (les Vestiges de la cité d’Amdapor (brutal)).' },
  1189: { how: 'Jeter d’un coup une pile de 50 Farines de poisson (21 gils chez les marchands de matériaux).', items: [7767] },
  1190: { how: 'Terminer l’ALÉA « Une haleine de feu » trois fois d’affilée.' },
  1191: { how: 'Fabriquer un Steak de rroneek de haute qualité sur l’un de ses points d’apparition.', items: [44091] },
  1192: {
    how: 'Lancer le sort de mage bleu Aquilons (appris des yétis des hautes terres du Coerthas occidental) sur l’un de ses points d’apparition.',
  },
};

/** Rang SS de chaque extension (à partir de Shadowbringers). */
export const SS_RANK_NOTES: Record<number, string> = {
  3: 'Quand un rang S de Norvrandt meurt, quatre médisances pardonnées peuvent apparaître (environ une fois sur dix). Les vaincre toutes fait surgir la rébellion pardonnée.',
  4: 'Quand un rang S d’Endwalker meurt, quatre serviteurs de Kèr peuvent apparaître. Les vaincre tous (ils repartent au bout de 5 minutes si personne ne les attaque) fait surgir Kèr.',
  5: 'Quand un rang S de Dawntrail meurt, quatre cristallisateurs peuvent apparaître. Les vaincre tous fait surgir le seigneur des cristallisateurs.',
};

/** Délais de réapparition estimés par la communauté, en heures. */
export const RESPAWN: Record<'A' | 'S', { window: [number, number]; afterMaintenance?: [number, number]; arr?: [number, number] }> = {
  // A Realm Reborn : un rang A par zone, plus rapide (3 h 30 à 4 h 30).
  A: { window: [4, 6], afterMaintenance: [2.4, 3.6], arr: [3.5, 4.5] },
  // A Realm Reborn : chaque rang S a son propre délai (voir S_RANK_NOTES).
  S: { window: [84, 132], afterMaintenance: [50, 80] },
};
