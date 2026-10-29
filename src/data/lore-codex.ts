/**
 * Codex de la Légende : les grandes figures, cités et notions de l'histoire, rédigés pour l'appli (textes
 * originaux, en français). Chaque fiche regroupe les cartes de Triple Triade du personnage (Zenos en a deux) et
 * relie lieux, chroniques et autres fiches.
 *
 * Chaque paragraphe porte l'extension à partir de laquelle il dévoile quelque chose (0 A Realm Reborn …
 * 5 Dawntrail) : au-delà de la progression du joueur, il reste voilé. `v` est l'extension où la fiche apparaît.
 */
import type { LoreType } from '@/utils/lore';

export type CodexParagraph = [number, string];

export interface CodexEntry {
  k: string;
  t: Extract<LoreType, 'perso' | 'lieu' | 'notion'>;
  n: string;
  /** Rôle, titre ou nature, en une ligne. */
  s: string;
  v: number;
  /** Autres noms (cherchables), dont les noms secrets. */
  aka?: string[];
  /** Cartes de Triple Triade regroupées dans cette fiche (portraits et citations). */
  cards?: string[];
  /** Fiche dont l'image illustre celle-ci (sinon la première carte, ou la carte du lieu). */
  img?: string;
  /** Carte du jeu du lieu. */
  map?: number;
  /** Autres cartes du même lieu (quartiers, sous-parties) : leurs mentions mènent à cette fiche. */
  also?: number[];
  b: CodexParagraph[];
  /** Fiches à lire ensuite. */
  see?: string[];
}

export const CODEX: CodexEntry[] = [
  // ——— Personnages ———
  {
    k: 'x-guerrier',
    t: 'perso',
    n: 'Guerrier de la Lumière',
    s: 'Aventurier, héros d’Éorzéa',
    v: 0,
    cards: ['p68', 'p304'],
    b: [
      [
        0,
        'Un aventurier venu de nulle part, porteur de l’Écho, ce don qui laisse entrevoir le passé des êtres et protège de l’emprise des primordiaux. Hydaelyn, la Mère Cristal, le guide depuis ses premiers pas à Gridania, Limsa Lominsa ou Ul’dah.',
      ],
      [
        0,
        'Il terrasse Ifrit, Titan et Garuda, rejoint les Héritiers de la Septième Aube et met fin aux ambitions de Gaius van Baelsar et de l’Ultima Arma. Une trahison au palais d’Ul’dah le pousse à l’exil vers Ishgard.',
      ],
      [
        1,
        'À Ishgard, il découvre la vérité sur la guerre du Chant des dragons et aide à la terminer. Il libère ensuite Ala Mhigo et Doma de l’Empire de Garlemald.',
      ],
      [
        3,
        'Appelé au Premier reflet par l’Exarque de Cristal, il y devient le Guerrier des Ténèbres : en ramenant la nuit sur Norvrandt, il sauve ce monde du Déluge de Lumière, puis affronte Emet-Selch.',
      ],
      [
        4,
        'Il parcourt ensuite le passé d’Elpis et jusqu’aux confins de l’univers pour répondre au chant de désespoir de Méteion et sauver l’étoile entière.',
      ],
    ],
    see: ['x-hydaelyn', 'x-heritiers', 'x-echo'],
  },
  {
    k: 'x-minfilia',
    t: 'perso',
    n: 'Minfilia Warde',
    s: 'Dirigeante des Héritiers',
    v: 0,
    cards: ['p56'],
    b: [
      [
        0,
        'Élevée à Ul’dah, elle dirige les Héritiers de la Septième Aube depuis leur repaire du Thanalan. Elle aussi porte l’Écho, et c’est elle qui accueille le Guerrier de la Lumière parmi les Héritiers.',
      ],
      [1, 'Elle finit par répondre à l’appel d’Hydaelyn et devient sa voix, renonçant à sa vie de mortelle.'],
      [
        3,
        'Au Premier reflet, son âme renaît encore et encore dans des jeunes filles appelées « Minfilia », l’oracle de la Lumière. Ryne est la dernière d’entre elles.',
      ],
    ],
    see: ['x-ryne', 'x-heritiers'],
  },
  {
    k: 'x-thancred',
    t: 'perso',
    n: 'Thancred Waters',
    s: 'Héritier, éclaireur',
    v: 0,
    cards: ['p46', 'p165', 'p301'],
    b: [
      [
        0,
        'Orphelin de Limsa Lominsa recueilli par Louisoix, il est l’œil et l’oreille des Héritiers : charmeur, discret, redoutable avec ses dagues.',
      ],
      [
        1,
        'Un temps possédé par l’Ascien Lahabrea, il en garde la blessure d’avoir perdu l’Écho et une part de lui-même. Il protège désormais Minfilia, puis sa mémoire.',
      ],
      [
        3,
        'Au Premier reflet, il devient pistosabreur et le gardien silencieux de Ryne, qu’il élève en ne voyant d’abord en elle que l’ombre de Minfilia.',
      ],
    ],
    see: ['x-ryne', 'x-heritiers', 'x-lahabrea'],
  },
  {
    k: 'x-yshtola',
    t: 'perso',
    n: 'Y’shtola Rhul',
    s: 'Héritière, mage',
    v: 0,
    cards: ['p49', 'p166', 'p268'],
    b: [
      [
        0,
        'Érudite de Sharlayan et disciple de Matoya, elle maîtrise la magie de l’éther comme peu d’autres. Son ton sec cache une loyauté sans faille envers ses compagnons.',
      ],
      [
        1,
        'Perdue dans le flux de l’éther après l’attaque du repaire des Héritiers, elle en revient sans la vue : elle perçoit désormais le monde par l’éther seul.',
      ],
      [3, 'Au Premier reflet, elle vit cachée dans la grande forêt de Rak’tika, parmi un peuple qui vénère la nuit.'],
    ],
    see: ['x-heritiers', 'x-sharlayan'],
  },
  {
    k: 'x-urianger',
    t: 'perso',
    n: 'Urianger Augurelt',
    s: 'Héritier, astromancien',
    v: 0,
    cards: ['p50', 'p269'],
    b: [
      [
        0,
        'Ancien élève de Louisoix, il parle comme un livre ancien et voit plus loin que les autres. Il étudie les étoiles et les secrets des Asciens à Mor Dhona.',
      ],
      [
        1,
        'Ses silences et ses secrets le font longtemps passer pour un traître ; il agit en réalité pour un dessein plus grand, au risque de tout perdre.',
      ],
      [3, 'Il gagne le Premier reflet avant tous les autres, où il prépare en secret le plan de l’Exarque de Cristal.'],
    ],
    see: ['x-heritiers', 'x-graha'],
  },
  {
    k: 'x-leveilleur',
    t: 'perso',
    n: 'Alphinaud et Alisaie Leveilleur',
    s: 'Jumeaux sharlayanais, Héritiers',
    v: 0,
    aka: ['Alphinaud', 'Alisaie'],
    cards: ['p59', 'p251', 'p341'],
    b: [
      [
        0,
        'Petits-enfants de Louisoix, venus de Sharlayan pour comprendre la Calamité qui a emporté leur grand-père. Alphinaud, brillant et sûr de lui, veut sauver Éorzéa par la politique ; Alisaie, impétueuse, préfère l’épée.',
      ],
      [
        0,
        'Alphinaud crée une milice au service de toutes les nations, mais elle est détournée par l’argent du Syndicat d’Ul’dah : une leçon d’humilité qui le transforme.',
      ],
      [1, 'Les jumeaux mûrissent au fil de la libération d’Ala Mhigo et de Doma : lui devient stratège, elle mage rouge.'],
      [4, 'Ils tiennent tête à leur père Fourchenault et au Forum de Sharlayan, qui préférait fuir la fin du monde plutôt que de l’affronter.'],
    ],
    see: ['x-louisoix', 'x-sharlayan', 'x-heritiers'],
  },
  {
    k: 'x-tataru',
    t: 'perso',
    n: 'Tataru Taru',
    s: 'Réceptionniste des Héritiers',
    v: 0,
    cards: ['p19', 'p241'],
    b: [
      [
        0,
        'Petite Lalafell à la grande âme, elle tient les comptes, coud les tenues et trouve des fonds quand plus rien ne va. Sans elle, les Héritiers n’auraient ni toit ni repas.',
      ],
      [2, 'Elle devient une redoutable femme d’affaires et se révèle aussi courageuse que les héros qu’elle soutient.'],
    ],
    see: ['x-heritiers'],
  },
  {
    k: 'x-krile',
    t: 'perso',
    n: 'Krile Mayer Baldesion',
    s: 'Héritière, érudite',
    v: 0,
    cards: ['p199', 'p454'],
    b: [
      [
        0,
        'Fille adoptive de Galuf Baldesion et porteuse de l’Écho, elle sillonne le monde à la recherche du savoir. Elle rejoint les Héritiers après la chute de l’Aube Révérente.',
      ],
      [
        5,
        'En Tural, elle se rapproche de ses origines : ses véritables parents, liés à cette terre lointaine, ont laissé derrière eux un passé qu’elle découvre peu à peu.',
      ],
    ],
    see: ['x-heritiers', 'x-tural'],
  },
  {
    k: 'x-estinien',
    t: 'perso',
    n: 'Estinien Varlineau',
    s: 'Dragon azur d’Ishgard',
    v: 1,
    cards: ['p88'],
    b: [
      [
        1,
        'Le plus redoutable des chevaliers dragons d’Ishgard, consumé par la haine des dragons qui ont tué sa famille. Il porte l’œil de Nidhogg, relique du dragon qu’il pourchasse.',
      ],
      [
        1,
        'L’œil finit par le posséder : Estinien devient l’incarnation de Nidhogg, et c’est le Guerrier de la Lumière qui l’en délivre au terme de la guerre du Chant des dragons.',
      ],
      [4, 'Libre de sa vengeance, il voyage en solitaire et rejoint les Héritiers face à la Fin des temps.'],
    ],
    see: ['x-ishgard', 'x-chant-des-dragons', 'x-nidhogg'],
  },
  {
    k: 'x-graha',
    t: 'perso',
    n: 'G’raha Tia',
    s: 'Érudit, Exarque de Cristal',
    v: 0,
    aka: ['Exarque de Cristal', 'l’Exarque'],
    img: 'c306',
    b: [
      [
        0,
        'Jeune érudit Miqo’te de Sharlayan, il porte l’œil rouge des rois d’Allag. Il s’endort dans la Tour de Cristal pour la garder jusqu’au jour où le monde en aura besoin.',
      ],
      [
        3,
        'Réveillé dans un avenir dévasté, il remonte le temps et les reflets : au Premier reflet, il devient l’Exarque de Cristal, fondateur du Cristarium, prêt à donner sa vie pour sauver le Guerrier de la Lumière.',
      ],
      [
        4,
        'Revenu dans son propre corps, il rejoint les Héritiers et garde de sa vie d’Exarque une sagesse et un attachement profonds pour ses compagnons.',
      ],
    ],
    see: ['x-cristarium', 'x-allag'],
  },
  {
    k: 'x-louisoix',
    t: 'perso',
    n: 'Louisoix Leveilleur',
    s: 'Archonte de Sharlayan',
    v: 0,
    cards: ['p60'],
    b: [
      [
        0,
        'Érudit de Sharlayan resté en Éorzéa après le départ des siens, il fonde le Cercle du Savoir, ancêtre des Héritiers. Lors de la Calamité, il invoque les Douze pour contenir Bahamut et disparaît dans la lumière.',
      ],
      [0, 'Les Asciens se servent ensuite de sa mémoire : au cœur de Bahamut, il réapparaît sous la forme d’un primordial.'],
    ],
    see: ['x-calamite', 'x-leveilleur', 'x-heritiers'],
  },
  {
    k: 'x-cid',
    t: 'perso',
    n: 'Cid Garlond',
    s: 'Ingénieur, Garlond Ironworks',
    v: 0,
    cards: ['p58'],
    b: [
      [
        0,
        'Génie de la mécanique né garlemaldais, il a quitté l’Empire pour fonder sa propre compagnie en Éorzéa. Ses aéronefs, dont l’Enterprise, emmènent les héros partout où il faut aller.',
      ],
      [0, 'Il a perdu un temps la mémoire après la Calamité, avant que le Guerrier de la Lumière ne l’aide à la retrouver.'],
    ],
    see: ['x-garlemald'],
  },
  {
    k: 'x-gaius',
    t: 'perso',
    n: 'Gaius van Baelsar',
    s: 'Légat de la XIVe légion',
    v: 0,
    cards: ['p64'],
    b: [
      [
        0,
        'Légat de l’Empire de Garlemald chargé de la conquête d’Éorzéa, il veut libérer le pays des primordiaux par la force. Son arme, l’Ultima Arma, tombe sous les coups du Guerrier de la Lumière au Praetorium.',
      ],
      [1, 'Défait mais vivant, il cherche ensuite à réparer ses erreurs et à protéger les orphelins qu’il a élevés.'],
    ],
    see: ['x-garlemald', 'x-nael'],
  },
  {
    k: 'x-nael',
    t: 'perso',
    n: 'Nael van Darnus',
    s: 'Légat de la VIIe légion',
    v: 0,
    cards: ['p167'],
    b: [
      [
        0,
        'Légat fanatique qui fit tomber Dalamud, la lune rouge, sur Éorzéa pour en finir avec les « barbares ». La chute de la lune libéra Bahamut et ouvrit la Calamité.',
      ],
    ],
    see: ['x-calamite', 'x-garlemald'],
  },
  {
    k: 'x-lahabrea',
    t: 'perso',
    n: 'Lahabrea',
    s: 'Ascien',
    v: 0,
    cards: ['p57', 'p366'],
    b: [
      [
        0,
        'Ascien au masque rouge, il manipule les nations et les primordiaux pour servir son dieu des Ténèbres. Il se vêt du corps de Thancred pour arriver à ses fins.',
      ],
      [4, 'Dans le passé d’Elpis, on découvre l’homme qu’il était avant la Scission : un savant d’Amaurote attaché à sa compagne Athéna.'],
    ],
    see: ['x-asciens', 'x-amaurote'],
  },
  {
    k: 'x-elidibus',
    t: 'perso',
    n: 'Elidibus',
    s: 'Ascien, l’Émissaire',
    v: 0,
    cards: ['p300'],
    b: [
      [0, 'Ascien au masque blanc, d’ordinaire discret, qui tire les fils dans l’ombre et préfère les mots à la guerre.'],
      [
        3,
        'Il se révèle être l’âme de Zordiarche lui-même, fidèle à sa mission au point d’en avoir oublié pourquoi il la sert. Il emprunte le visage du premier Guerrier de la Lumière du Premier reflet.',
      ],
    ],
    see: ['x-asciens', 'x-zodiark'],
  },
  {
    k: 'x-emet-selch',
    t: 'perso',
    n: 'Emet-Selch',
    s: 'Ascien, fondateur de Garlemald',
    v: 2,
    aka: ['Hadès', 'Solus zos Galvus'],
    cards: ['p271'],
    b: [
      [
        2,
        'Ascien à l’allure lasse et à l’ironie mordante, il se présente au Guerrier de la Lumière à Doma. Sous le nom de Solus zos Galvus, il a fondé l’Empire de Garlemald, dont il fut le premier empereur.',
      ],
      [
        3,
        'Au Premier reflet, il suit les héros pour juger s’ils méritent la vérité. Il ressuscite pour eux l’Amaurote de sa mémoire, la ville des Anciens d’avant la Scission, et révèle son vrai nom : Hadès.',
      ],
      [
        3,
        'Il ne veut qu’une chose : ramener son peuple perdu, quitte à sacrifier tous ceux qui vivent aujourd’hui. Vaincu, il demande à être rappelé : « Souvenez-vous de nous. »',
      ],
    ],
    see: ['x-amaurote', 'x-asciens', 'x-hythlodaeus', 'x-garlemald'],
  },
  {
    k: 'x-hythlodaeus',
    t: 'perso',
    n: 'Hythlodaeus',
    s: 'Ancien d’Amaurote',
    v: 3,
    cards: ['p342'],
    b: [
      [
        3,
        'Ombre souriante dans l’Amaurote recréée par Emet-Selch, il était son plus vieil ami. Il voit les âmes comme personne et reconnaît en celle du Guerrier quelqu’un qu’il a connu.',
      ],
      [4, 'À Elpis, dans le vrai passé, il partage avec Emet-Selch et Hermès les derniers jours d’un monde qui ignore encore sa fin.'],
    ],
    see: ['x-emet-selch', 'x-amaurote', 'x-elpis'],
  },
  {
    k: 'x-fandaniel',
    t: 'perso',
    n: 'Fandaniel',
    s: 'Ascien',
    v: 4,
    aka: ['Hermès'],
    img: 'd785',
    b: [
      [4, 'Dernier Ascien, qui a pris le corps d’Asahi sas Brutus. Rieur et nihiliste, il n’a qu’un désir : voir le monde finir, et lui avec.'],
      [
        4,
        'Il est l’âme d’Hermès, l’Ancien qui créa Méteion à Elpis et douta le premier du sens de la vie. C’est lui qui déclenche la Fin des temps depuis la tour de Babil.',
      ],
    ],
    see: ['x-meteion', 'x-elpis', 'x-asciens'],
  },
  {
    k: 'x-zenos',
    t: 'perso',
    n: 'Zenos yae Galvus',
    s: 'Prince héritier de Garlemald',
    v: 2,
    cards: ['p201', 'p346'],
    b: [
      [
        2,
        'Fils de l’empereur Varis, vice-roi d’Ala Mhigo, guerrier sans égal qui ne vit que pour le combat. Après sa première défaite face au Guerrier de la Lumière, il voit en lui son seul ami, c’est-à-dire sa seule proie.',
      ],
      [3, 'Mort de sa propre main, il revient dans un corps d’emprunt avant de reprendre le sien, plus obsédé que jamais par le duel qu’il attend.'],
      [4, 'Il aide Fandaniel à provoquer la Fin des temps, puis suit le Guerrier jusqu’à Ultima Thulé pour leur combat final, enfin libre.'],
    ],
    see: ['x-garlemald', 'x-varis', 'x-ala-mhigo'],
  },
  {
    k: 'x-varis',
    t: 'perso',
    n: 'Varis yae Galvus',
    s: 'Empereur de Garlemald',
    v: 2,
    cards: ['p293'],
    b: [
      [2, 'Petit-fils de Solus zos Galvus, il gouverne l’Empire d’une main de fer et méprise les Asciens qu’il soupçonne de manipuler sa lignée.'],
      [
        3,
        'Il lance la guerre contre l’Alliance d’Éorzéa et tente d’en finir avec les primordiaux par des armes terribles, au prix de son propre peuple.',
      ],
    ],
    see: ['x-garlemald', 'x-zenos'],
  },
  {
    k: 'x-ysayle',
    t: 'perso',
    n: 'Ysayle Dangoulain',
    s: 'Sainte d’Ishgard, Shiva',
    v: 1,
    aka: ['Shiva', 'la Sainte'],
    cards: ['p90'],
    b: [
      [
        1,
        'Ishgardaise qui entend la voix des dragons, elle s’offre à Shiva pour devenir la primordiale de la paix entre les deux peuples. Ses Hérétiques luttent contre le Saint-Siège.',
      ],
      [1, 'Aux côtés du Guerrier, elle découvre que la légende de Shiva cache une vérité plus amère, et donne sa vie pour arrêter Nidhogg.'],
    ],
    see: ['x-ishgard', 'x-chant-des-dragons', 'x-hraesvelgr'],
  },
  {
    k: 'x-aymeric',
    t: 'perso',
    n: 'Aymeric de Borel',
    s: 'Lord commandant des Chevaliers du Temple',
    v: 1,
    cards: ['p96'],
    b: [
      [
        1,
        'Chef des chevaliers d’Ishgard, fils caché de l’archevêque Thordan VII. Homme de paix au cœur d’une ville en guerre, il accueille le Guerrier quand Éorzéa l’a rejeté.',
      ],
      [1, 'Après la chute du Saint-Siège, il fonde la république d’Ishgard et tend la main aux dragons.'],
    ],
    see: ['x-ishgard', 'x-thordan', 'x-haurchefant'],
  },
  {
    k: 'x-haurchefant',
    t: 'perso',
    n: 'Haurchefant Greystone',
    s: 'Chevalier de Fortemps',
    v: 1,
    cards: ['p95'],
    b: [
      [
        1,
        'Bâtard de la maison Fortemps, commandant d’un avant-poste du Coerthas, il est le premier à offrir son amitié et son toit au Guerrier exilé.',
      ],
      [1, 'Il meurt en le protégeant face au chevalier Zephirin, avec un sourire et un dernier mot sur la chaleur de sa compagnie.'],
    ],
    see: ['x-ishgard', 'x-aymeric'],
  },
  {
    k: 'x-thordan',
    t: 'perso',
    n: 'Thordan VII',
    s: 'Archevêque d’Ishgard',
    v: 1,
    cards: ['p120'],
    b: [
      [
        1,
        'Chef du Saint-Siège, gardien du mensonge fondateur d’Ishgard : le roi Thordan Ier n’a pas été trahi par les dragons, c’est lui qui a trahi Ratatoskr pour lui voler ses yeux.',
      ],
      [1, 'Avec ses chevaliers, il se change en primordial à Azys Lla pour devenir dieu, et tombe face au Guerrier.'],
    ],
    see: ['x-ishgard', 'x-chant-des-dragons', 'x-aymeric'],
  },
  {
    k: 'x-nidhogg',
    t: 'perso',
    n: 'Nidhogg',
    s: 'Grand wyrm, frère de Hraesvelgr',
    v: 1,
    cards: ['p99'],
    b: [
      [
        1,
        'Premier-né de Midgardsormr, il mène les dragons contre Ishgard depuis mille ans pour venger sa sœur Ratatoskr, tuée par les hommes. Sa colère ne s’éteint qu’avec lui.',
      ],
      [1, 'Même privé d’un œil, il revient à travers Estinien pour un dernier assaut sur la ville.'],
    ],
    see: ['x-chant-des-dragons', 'x-estinien', 'x-hraesvelgr'],
  },
  {
    k: 'x-hraesvelgr',
    t: 'perso',
    n: 'Hraesvelgr',
    s: 'Grand wyrm, ami de Shiva',
    v: 1,
    cards: ['p153'],
    b: [
      [
        1,
        'Il aima Shiva, une femme d’Ishgard qui lui donna son âme, et se retira dans les montagnes de Coerthas en refusant la guerre de son frère Nidhogg. Il ne fait plus confiance aux hommes, mais n’a jamais cessé d’espérer.',
      ],
    ],
    see: ['x-nidhogg', 'x-ysayle', 'x-chant-des-dragons'],
  },
  {
    k: 'x-midgardsormr',
    t: 'perso',
    n: 'Midgardsormr',
    s: 'Père des dragons',
    v: 1,
    cards: ['p100'],
    b: [
      [
        1,
        'Grand dragon venu d’un autre monde, ancêtre des dragons d’Hydaelyn. Il éprouve le Guerrier, puis le suit sous la forme d’un minuscule familier.',
      ],
      [4, 'Il révèle qu’il fut envoyé jadis pour avertir Hydaelyn du désespoir qui ravage les étoiles.'],
    ],
    see: ['x-chant-des-dragons', 'x-meteion'],
  },
  {
    k: 'x-lyse',
    t: 'perso',
    n: 'Lyse Hext',
    s: 'Résistante ala-mhigane',
    v: 0,
    aka: ['Yda'],
    cards: ['p200'],
    b: [
      [0, 'Elle se fait d’abord appeler Yda, Héritière masquée et bagarreuse, partenaire de Papalymo.'],
      [2, 'Elle reprend le nom et la cause de sa sœur morte, Yda, et prend la tête de la résistance qui libère Ala Mhigo de Garlemald.'],
    ],
    see: ['x-ala-mhigo', 'x-raubahn'],
  },
  {
    k: 'x-hien',
    t: 'perso',
    n: 'Hien Rijin',
    s: 'Prince de Doma',
    v: 2,
    cards: ['p202'],
    b: [
      [
        2,
        'Héritier de la maison Rijin, il mène la résistance de Doma contre l’Empire et gagne l’appui des tribus de la steppe d’Azim lors du Naadam. Rieur et généreux, il rend son pays à son peuple.',
      ],
    ],
    see: ['x-doma', 'x-gosetsu', 'x-yotsuyu'],
  },
  {
    k: 'x-gosetsu',
    t: 'perso',
    n: 'Gosetsu Everfall',
    s: 'Samouraï de Doma',
    v: 2,
    cards: ['p230'],
    b: [
      [
        2,
        'Fidèle serviteur de la maison Rijin, il a protégé la princesse Yugiri jusqu’en Éorzéa. Bon vivant, il prend sous son aile Yotsuyu devenue sans mémoire.',
      ],
    ],
    see: ['x-doma', 'x-hien', 'x-yotsuyu'],
  },
  {
    k: 'x-yotsuyu',
    t: 'perso',
    n: 'Yotsuyu goe Brutus',
    s: 'Vice-reine de Doma',
    v: 2,
    cards: ['p198'],
    b: [
      [2, 'Domienne vendue enfant par sa famille adoptive, elle se venge du monde en gouvernant Doma pour Garlemald avec une cruauté glacée.'],
      [
        2,
        'Amnésique après sa défaite, elle redevient la jeune fille qu’elle n’a jamais pu être, avant que la mémoire et la tragédie ne la rattrapent.',
      ],
    ],
    see: ['x-doma', 'x-gosetsu'],
  },
  {
    k: 'x-raubahn',
    t: 'perso',
    n: 'Raubahn Aldynn',
    s: 'Flamme générale d’Ul’dah',
    v: 0,
    cards: ['p67', 'p210'],
    b: [
      [
        0,
        'Ancien gladiateur ala-mhigan, champion des arènes devenu chef des Immortels de Flammes. Il sert la sultane Nanamo Ul Namo avec une loyauté absolue.',
      ],
      [0, 'Lors du banquet d’Ul’dah, il perd un bras en voulant la venger, et sa vie bascule avec celle des Héritiers.'],
      [2, 'Il retrouve sa terre natale aux côtés de Lyse et de son fils adoptif Pipin, pour la libération d’Ala Mhigo.'],
    ],
    see: ['x-uldah', 'x-nanamo', 'x-ala-mhigo'],
  },
  {
    k: 'x-nanamo',
    t: 'perso',
    n: 'Nanamo Ul Namo',
    s: 'Sultane d’Ul’dah',
    v: 0,
    cards: ['p63'],
    b: [
      [
        0,
        'Jeune sultane d’Ul’dah, sous l’influence du Syndicat des marchands qui gouverne en réalité la ville. Elle rêve de rendre le pouvoir au peuple et joue parfois les servantes pour l’approcher.',
      ],
      [2, 'Empoisonnée lors du banquet, elle survit et décide de rendre un jour le pouvoir au peuple d’Ul’dah.'],
    ],
    see: ['x-uldah', 'x-raubahn'],
  },
  {
    k: 'x-merlwyb',
    t: 'perso',
    n: 'Merlwyb Bloefhiswyn',
    s: 'Amirale de Limsa Lominsa',
    v: 0,
    cards: ['p65'],
    b: [
      [
        0,
        'Ancienne pirate devenue amirale, elle tient Limsa Lominsa d’une main ferme et commande le Maelstrom. Pragmatique, elle mène sans fard les pirates et les marchands de la cité.',
      ],
    ],
    see: ['x-limsa', 'x-grandes-compagnies'],
  },
  {
    k: 'x-kanesenna',
    t: 'perso',
    n: 'Kan-E-Senna',
    s: 'Élue de la Forêt de Sombrelinceul',
    v: 0,
    cards: ['p66'],
    b: [
      [
        0,
        'Grande Prêtresse de Gridania, elle entend la voix des élémentaires de la forêt et guide l’Ordre des Deux Vipères. Douce et inflexible, elle porte la parole de la forêt auprès des hommes.',
      ],
    ],
    see: ['x-gridania', 'x-grandes-compagnies'],
  },
  {
    k: 'x-ardbert',
    t: 'perso',
    n: 'Ardbert',
    s: 'Guerrier de la Lumière du Premier reflet',
    v: 3,
    cards: ['p272'],
    b: [
      [
        3,
        'Héros du Premier reflet qui, avec ses compagnons, arrêta jadis la Calamité de son monde… et provoqua sans le vouloir le Déluge de Lumière. Son ombre erre depuis, invisible de tous sauf du Guerrier, dont il partage l’âme.',
      ],
    ],
    see: ['x-deluge', 'x-guerrier'],
  },
  {
    k: 'x-ryne',
    t: 'perso',
    n: 'Ryne',
    s: 'Oracle de la Lumière',
    v: 3,
    aka: ['Minfilia'],
    cards: ['p313'],
    b: [
      [
        3,
        'Dernière des jeunes filles nées avec l’âme de Minfilia, élevée par Thancred. Elle apprend à vivre sous son propre nom et devient capable de retenir la Lumière qui ronge son monde.',
      ],
    ],
    see: ['x-minfilia', 'x-thancred', 'x-gaia'],
  },
  {
    k: 'x-gaia',
    t: 'perso',
    n: 'Gaïa',
    s: 'Jeune fille au destin ascien',
    v: 3,
    cards: ['p314'],
    b: [
      [
        3,
        'Jeune femme farouche de Norvrandt, liée par un anneau à un Ascien qui voulait lui voler son corps. Elle se lie d’amitié avec Ryne, sa sœur d’âme.',
      ],
    ],
    see: ['x-ryne'],
  },
  {
    k: 'x-lyna',
    t: 'perso',
    n: 'Lyna',
    s: 'Capitaine de la garde du Cristarium',
    v: 3,
    cards: ['p265'],
    b: [
      [
        3,
        'Viera élevée par l’Exarque de Cristal, qu’elle appelle « grand-père ». Elle commande la garde du Cristarium et protège la ville quand l’Exarque n’est plus là.',
      ],
    ],
    see: ['x-cristarium', 'x-graha'],
  },
  {
    k: 'x-vauthry',
    t: 'perso',
    n: 'Vauthry',
    s: 'Seigneur d’Eulmore',
    v: 3,
    img: 'l2162899',
    b: [
      [
        3,
        'Maître d’Eulmore, né d’une mère humaine et d’un mangepéché, il règne sur une ville de plaisirs où les riches oublient la fin du monde et où les pauvres vendent leur travail pour un aliment fade, la meol.',
      ],
      [
        3,
        'Il se croit roi et dieu ; il est surtout le jouet d’un Ascien. Il fusionne avec la plus puissante des créatures de lumière et devient Innocence.',
      ],
    ],
    see: ['x-eulmore', 'x-deluge'],
  },
  {
    k: 'x-hydaelyn',
    t: 'perso',
    n: 'Hydaelyn',
    s: 'La Mère Cristal',
    v: 0,
    cards: ['p345'],
    b: [
      [
        0,
        'Voix de cristal qui parle au Guerrier depuis le premier jour : « Écoute… ressens… pense… » Elle donne l’Écho à ceux qu’elle choisit et lutte contre les Ténèbres.',
      ],
      [
        3,
        'Les Asciens la tiennent pour la responsable de la Scission : son invocation aurait brisé le monde en une Source et treize reflets pour emprisonner Zordiarche.',
      ],
      [4, 'Elle fut d’abord Venat, une Ancienne d’Amaurote, qui choisit de devenir primordiale pour sauver l’étoile de la Fin des temps.'],
    ],
    see: ['x-venat', 'x-zodiark', 'x-reflets'],
  },
  {
    k: 'x-venat',
    t: 'perso',
    n: 'Venat',
    s: 'Ancienne d’Amaurote',
    v: 4,
    cards: ['p377'],
    b: [
      [
        4,
        'Membre des Quatorze qui renonça à son siège pour parcourir le monde. À Elpis, elle accueille un voyageur venu de l’avenir et comprend avant les autres ce qui attend l’étoile.',
      ],
      [4, 'Pour que la vie continue, elle devient Hydaelyn et attend des millénaires que des héros prennent la relève.'],
    ],
    see: ['x-hydaelyn', 'x-elpis', 'x-amaurote'],
  },
  {
    k: 'x-zodiark',
    t: 'perso',
    n: 'Zordiarche',
    s: 'Dieu des Asciens',
    v: 3,
    aka: ['Zodiark'],
    cards: ['p344'],
    b: [
      [
        3,
        'Primordial invoqué par les Anciens pour arrêter la Fin des temps, au prix d’une part de leur peuple. Les Asciens veulent le libérer en réunissant les reflets à la Source.',
      ],
      [4, 'Le Guerrier le rencontre enfin, enchaîné au cœur de la Lune.'],
    ],
    see: ['x-asciens', 'x-hydaelyn', 'x-elidibus'],
  },
  {
    k: 'x-meteion',
    t: 'perso',
    n: 'Méteion',
    s: 'Messagère d’Hermès',
    v: 4,
    cards: ['p337'],
    b: [
      [
        4,
        'Créée par Hermès à Elpis pour visiter les étoiles et leur demander le sens de la vie. Partout, elle ne rencontre que des peuples éteints ou désespérés, et rapporte leur chant de mort.',
      ],
      [4, 'Devenue la Fin des temps elle-même, elle attend au bout de l’univers, à Ultima Thulé, le dernier visiteur qui oserait encore espérer.'],
    ],
    see: ['x-fandaniel', 'x-elpis', 'x-ultima-thule'],
  },
  {
    k: 'x-wuk-lamat',
    t: 'perso',
    n: 'Wuk Lamat',
    s: 'Prétendante au trône de Tural',
    v: 5,
    cards: ['p424'],
    b: [
      [
        5,
        'Fille adoptive du souverain Gulool Ja Ja, elle se présente au rite de succession de Tural en voulant comprendre tous les peuples de son pays. Débordante d’énergie, elle doute pourtant de mériter le trône.',
      ],
      [5, 'Elle mène le voyage du Guerrier à travers Tural et apprend à devenir la reine dont son peuple a besoin.'],
    ],
    see: ['x-tural', 'x-tuliyollal', 'x-gulool'],
  },
  {
    k: 'x-gulool',
    t: 'perso',
    n: 'Gulool Ja Ja',
    s: 'Souverain de Tural',
    v: 5,
    cards: ['p413'],
    b: [
      [
        5,
        'Roi de Tural, Mamool Ja à deux têtes qui unifia le pays. Vieillissant, il organise le rite de succession entre ses enfants adoptifs, Wuk Lamat et Koana, et ses rivaux.',
      ],
    ],
    see: ['x-tural', 'x-wuk-lamat', 'x-zoraal-ja'],
  },
  {
    k: 'x-zoraal-ja',
    t: 'perso',
    n: 'Zoraal Ja',
    s: 'Fils de Gulool Ja Ja',
    v: 5,
    cards: ['p419'],
    b: [
      [
        5,
        'Guerrier redoutable et prétendant au trône, convaincu que seule la force fait un roi. Sa quête de puissance le mène vers Alexandrie et l’arme d’un autre monde.',
      ],
    ],
    see: ['x-tural', 'x-wuk-lamat', 'x-alexandrie'],
  },
  {
    k: 'x-sphene',
    t: 'perso',
    n: 'Sphene',
    s: 'Reine d’Alexandrie',
    v: 5,
    aka: ['Reine Éternité'],
    cards: ['p425', 'p420'],
    b: [
      [
        5,
        'Souveraine bienveillante d’Alexandrie, ville venue d’un autre reflet. Elle veut à tout prix préserver la vie de son peuple, quitte à puiser dans l’âme d’autres mondes pour y parvenir.',
      ],
    ],
    see: ['x-alexandrie', 'x-solution-neuf', 'x-memoire-vivante'],
  },
  // ——— Lieux ———
  {
    k: 'x-limsa',
    t: 'lieu',
    n: 'Limsa Lominsa',
    s: 'Cité-État de la Noscea',
    v: 0,
    map: 11,
    also: [12, 74],
    b: [
      [
        0,
        'Cité portuaire bâtie sur des falaises et des ponts, au milieu de la mer. Les pirates y sont devenus marins et marchands sous l’autorité de l’amirale Merlwyb ; son port mène partout, jusqu’à la pêche en mer.',
      ],
    ],
    see: ['x-merlwyb', 'x-grandes-compagnies'],
  },
  {
    k: 'x-gridania',
    t: 'lieu',
    n: 'Gridania',
    s: 'Cité-État de la Forêt de Sombrelinceul',
    v: 0,
    map: 2,
    also: [3],
    b: [
      [
        0,
        'Ville sylvestre vivant en harmonie avec les élémentaires de la forêt, qui tolèrent la présence des hommes sous conditions. Elle se partage entre la Nouvelle et la Vieille Gridania, sous la garde de Kan-E-Senna.',
      ],
    ],
    see: ['x-kanesenna', 'x-grandes-compagnies'],
  },
  {
    k: 'x-uldah',
    t: 'lieu',
    n: 'Ul’dah',
    s: 'Cité-État du Thanalan',
    v: 0,
    map: 13,
    also: [14, 70, 73],
    b: [
      [
        0,
        'Cité du désert bâtie sur l’or, le commerce et les arènes. Le Syndicat des marchands y tient le vrai pouvoir face à la sultane Nanamo ; c’est là que se joue le banquet qui fait des Héritiers des fugitifs.',
      ],
    ],
    see: ['x-nanamo', 'x-raubahn'],
  },
  {
    k: 'x-mor-dhona',
    t: 'lieu',
    n: 'Mor Dhona',
    s: 'Terre de cristal',
    v: 0,
    map: 25,
    b: [
      [
        0,
        'Terre ravagée par la chute de Dalamud, hérissée de cristaux, au pied de la Tour de Cristal d’Allag. Les aventuriers et les Héritiers s’y retrouvent, au milieu des vestiges de la Calamité.',
      ],
    ],
    see: ['x-calamite', 'x-allag', 'x-heritiers'],
  },
  {
    k: 'x-ishgard',
    t: 'lieu',
    n: 'Ishgard',
    s: 'Cité sainte du Coerthas',
    img: 'd34',
    v: 1,
    map: 218,
    also: [219],
    b: [
      [
        1,
        'Forteresse religieuse perchée au-dessus des nuages, en guerre contre les dragons depuis mille ans. La noblesse et l’Église y règnent sur une ville gelée, divisée entre l’Assise et les Contreforts.',
      ],
      [1, 'Après la vérité sur Thordan, elle devient une république et reconstruit ses quartiers et sa paix avec Hraesvelgr.'],
    ],
    see: ['x-chant-des-dragons', 'x-aymeric', 'x-thordan'],
  },
  {
    k: 'x-ala-mhigo',
    t: 'lieu',
    n: 'Ala Mhigo',
    s: 'Royaume de Gyr Abania',
    v: 2,
    img: 'd247',
    map: 369,
    b: [
      [
        2,
        'Ancien royaume tombé sous le roi fou Theodoric, puis sous vingt ans de joug garlemaldais. Libéré par la résistance de Lyse et Raubahn, il doit réapprendre à se gouverner.',
      ],
    ],
    see: ['x-lyse', 'x-zenos', 'x-raubahn'],
  },
  {
    k: 'x-doma',
    t: 'lieu',
    n: 'Doma',
    s: 'Royaume d’Othard',
    img: 'd241',
    v: 2,
    map: 463,
    b: [
      [
        2,
        'Royaume d’Orient occupé par Garlemald, dont le peuple est parqué dans un quartier enclavé. Hien le libère avec l’aide des tribus d’Azim et des Héritiers.',
      ],
    ],
    see: ['x-hien', 'x-yotsuyu', 'x-kugane'],
  },
  {
    k: 'x-kugane',
    t: 'lieu',
    n: 'Kugane',
    s: 'Port marchand d’Hingashi',
    v: 2,
    map: 370,
    b: [
      [
        2,
        'Seule ville d’Hingashi ouverte aux étrangers, port de commerce flamboyant où se croisent marchands, ambassades et samouraïs. Hingashi y garde une neutralité prudente face à l’Empire.',
      ],
    ],
    see: ['x-doma'],
  },
  {
    k: 'x-cristarium',
    t: 'lieu',
    n: 'Cristarium',
    s: 'Cité du Grand-Lac',
    v: 3,
    map: 497,
    b: [
      [
        3,
        'Ville bâtie au pied de la Tour de Cristal arrivée au Premier reflet, dernier refuge où l’on accueille tous ceux qui fuient le Déluge de Lumière. L’Exarque de Cristal en est le fondateur.',
      ],
    ],
    see: ['x-graha', 'x-lyna', 'x-deluge'],
  },
  {
    k: 'x-eulmore',
    t: 'lieu',
    n: 'Eulmore',
    s: 'Cité des plaisirs de Kholusia',
    v: 3,
    map: 498,
    b: [
      [
        3,
        'Ville-tour dressée sur la côte de Kholusia, où l’élite de Norvrandt festoie en attendant la fin du monde. Au pied de ses murs, dans la Fange, les pauvres travaillent pour quelques rations de meol.',
      ],
      [3, 'Sous Vauthry, Eulmore protège les riches en traquant ceux qui résistent aux mangepéchés. Libérée, elle doit apprendre à partager.'],
    ],
    see: ['x-vauthry', 'x-deluge'],
  },
  {
    k: 'x-amaurote',
    t: 'lieu',
    n: 'Amaurote',
    s: 'Cité des Anciens',
    v: 3,
    img: 'd652',
    map: 496,
    b: [
      [
        3,
        'Capitale des Anciens d’avant la Scission, où vivaient des êtres immenses capables de créer par la pensée. Le Guerrier n’en voit d’abord que le reflet ressuscité par Emet-Selch, au fond de la Tempête.',
      ],
      [3, 'Une ville de paix et de savoir, dont la chute face à la Fin des temps a hanté les Asciens pendant des millénaires.'],
    ],
    see: ['x-emet-selch', 'x-hythlodaeus', 'x-asciens'],
  },
  {
    k: 'x-sharlayan',
    t: 'lieu',
    n: 'Vieille Sharlayan',
    s: 'Cité du savoir',
    v: 4,
    map: 693,
    b: [
      [0, 'Les érudits de Sharlayan ont quitté Éorzéa avant la Calamité, laissant derrière eux leur ancienne colonie et un goût de trahison.'],
      [4, 'Dans leur cité du nord, le Forum observe le monde sans s’en mêler, et prépare en secret son propre plan face à la fin des temps.'],
    ],
    see: ['x-leveilleur', 'x-yshtola'],
  },
  {
    k: 'x-radz-at-han',
    t: 'lieu',
    n: 'Radz-at-Han',
    s: 'Cité de Thavnair',
    v: 4,
    map: 694,
    b: [
      [
        4,
        'Ville marchande et alchimiste de Thavnair, gouvernée par son satrape. Ses habitants accueillent le Guerrier avec chaleur au moment où la tour de Babil s’éveille.',
      ],
    ],
    see: ['x-fandaniel'],
  },
  {
    k: 'x-garlemald-lieu',
    t: 'lieu',
    n: 'Garlemald',
    s: 'Capitale de l’Empire',
    v: 4,
    map: 697,
    b: [
      [
        4,
        'Capitale gelée de l’Empire, ravagée par la guerre civile et par les tempérés de la tour de Babil. Ses survivants doivent choisir entre la haine d’Éorzéa et l’aide qu’on leur tend.',
      ],
    ],
    see: ['x-garlemald', 'x-fandaniel'],
  },
  {
    k: 'x-elpis',
    t: 'lieu',
    n: 'Elpis',
    s: 'Le passé d’avant la Scission',
    v: 4,
    map: 700,
    b: [
      [
        4,
        'Terre d’expériences des Anciens, où ils créent et étudient de nouvelles formes de vie. Le Guerrier y voyage dans le passé et y rencontre Venat, Hermès et Méteion à l’aube de la catastrophe.',
      ],
    ],
    see: ['x-venat', 'x-meteion', 'x-fandaniel'],
  },
  {
    k: 'x-ultima-thule',
    t: 'lieu',
    n: 'Ultima Thulé',
    s: 'Le bout de l’univers',
    v: 4,
    map: 699,
    b: [
      [
        4,
        'Dernière étoile, aux confins de tout, où se sont réfugiés les échos des peuples disparus. C’est là que Méteion attend le Guerrier et ses compagnons.',
      ],
    ],
    see: ['x-meteion'],
  },
  {
    k: 'x-tuliyollal',
    t: 'lieu',
    n: 'Tuliyollal',
    s: 'Capitale de Tural',
    v: 5,
    map: 855,
    b: [
      [
        5,
        'Cité portuaire colorée, au cœur du nouveau continent, où vivent ensemble les peuples de Tural sous l’autorité de son souverain. Tout commence ici, avec le rite de succession.',
      ],
    ],
    see: ['x-tural', 'x-wuk-lamat'],
  },
  {
    k: 'x-solution-neuf',
    t: 'lieu',
    n: 'Solution Neuf',
    s: 'Cité d’Alexandrie',
    v: 5,
    map: 856,
    b: [
      [
        5,
        'Ville électrique et futuriste d’Alexandrie, arrivée d’un autre reflet. Ses habitants y vivent sans peur de la mort, grâce à une technologie qui garde leur mémoire.',
      ],
    ],
    see: ['x-alexandrie', 'x-sphene'],
  },
  {
    k: 'x-memoire-vivante',
    t: 'lieu',
    n: 'La Mémoire vivante',
    s: 'Royaume des souvenirs',
    v: 5,
    map: 862,
    b: [[5, 'Monde paisible où résident les souvenirs des morts d’Alexandrie. Sa beauté a un prix que la reine Sphene connaît mieux que quiconque.']],
    see: ['x-sphene', 'x-alexandrie'],
  },
  // ——— Notions ———
  {
    k: 'x-heritiers',
    t: 'notion',
    n: 'Héritiers de la Septième Aube',
    s: 'Compagnie d’érudits et d’aventuriers',
    v: 0,
    aka: ['Héritiers', 'Septième Aube'],
    img: 'd17',
    b: [
      [
        0,
        'Fondés sur les ruines du Cercle du Savoir de Louisoix, les Héritiers veulent protéger l’étoile des primordiaux et des Asciens, sans servir aucune nation. Ils recrutent ceux qui portent l’Écho.',
      ],
      [
        0,
        'Minfilia, Thancred, Y’shtola, Urianger, Yda et Papalymo, puis Alphinaud, Alisaie, Tataru et Krile : chacun suit son chemin, mais tous reviennent quand le monde vacille.',
      ],
    ],
    see: ['x-minfilia', 'x-louisoix', 'x-guerrier'],
  },
  {
    k: 'x-asciens',
    t: 'notion',
    n: 'Asciens',
    s: 'Serviteurs des Ténèbres',
    v: 0,
    img: 'd687',
    b: [
      [
        0,
        'Êtres masqués et immortels qui poussent les peuples à invoquer des primordiaux et à se faire la guerre. Leur but : provoquer des Calamités pour réunir les reflets à la Source.',
      ],
      [
        3,
        'Les plus puissants d’entre eux sont des survivants des Anciens d’avant la Scission : Emet-Selch, Lahabrea, Elidibus… Ils servent Zordiarche pour rendre la vie à leur peuple perdu.',
      ],
    ],
    see: ['x-emet-selch', 'x-lahabrea', 'x-elidibus', 'x-zodiark'],
  },
  {
    k: 'x-primordiaux',
    t: 'notion',
    n: 'Primordiaux',
    s: 'Dieux nés de la foi',
    v: 0,
    img: 'd111',
    b: [
      [
        0,
        'Quand un peuple prie avec assez de ferveur en offrant des cristaux, il fait naître son dieu : Ifrit pour les Amalj’aa, Titan pour les Kobolds, Garuda pour les Ixals… Ces dieux dévorent l’éther de la terre et « tempèrent » les fidèles, qui deviennent leurs serviteurs à jamais.',
      ],
      [0, 'Seuls ceux qui portent la bénédiction d’Hydaelyn résistent au tempérage, d’où l’importance du Guerrier de la Lumière.'],
    ],
    see: ['x-echo', 'x-asciens'],
  },
  {
    k: 'x-echo',
    t: 'notion',
    n: 'Écho',
    s: 'Don d’Hydaelyn',
    img: 'p345',
    v: 0,
    b: [
      [
        0,
        'Don rare qui permet de voir le passé des êtres, de comprendre toutes les langues et de résister au tempérage des primordiaux. Il apparaît sans prévenir et se perd parfois.',
      ],
    ],
    see: ['x-hydaelyn', 'x-primordiaux'],
  },
  {
    k: 'x-calamite',
    t: 'notion',
    n: 'La Calamité',
    s: 'La fin de la Sixième Ère astrale',
    v: 0,
    aka: ['Septième Ère ombrale', 'Dalamud'],
    img: 'd93',
    b: [
      [
        0,
        'Il y a cinq ans, la lune rouge Dalamud tombe sur Éorzéa, attirée par Nael van Darnus. Elle libère Bahamut, le primordial des dragons qui y était enfermé, qui ravage le pays lors de la bataille de Carteneau.',
      ],
      [0, 'Louisoix sacrifie ses forces pour sauver les combattants, qui disparaissent dans la lumière. Ainsi commence la Septième Ère ombrale.'],
      [3, 'Chaque Calamité naît en réalité de la fusion d’un reflet avec la Source, provoquée par les Asciens.'],
    ],
    see: ['x-nael', 'x-louisoix', 'x-reflets'],
  },
  {
    k: 'x-grandes-compagnies',
    t: 'notion',
    n: 'Grandes Compagnies',
    s: 'Les armées d’Éorzéa',
    img: 'd15',
    v: 0,
    b: [
      [
        0,
        'Le Maelstrom de Limsa Lominsa, l’Ordre des Deux Vipères de Gridania et les Immortels de Flammes d’Ul’dah, rétablis après la Calamité pour faire face à Garlemald. Unies dans l’Alliance d’Éorzéa, elles combattent ensemble à Ala Mhigo comme à la guerre de Garlemald.',
      ],
    ],
    see: ['x-limsa', 'x-gridania', 'x-uldah'],
  },
  {
    k: 'x-garlemald',
    t: 'notion',
    n: 'Empire de Garlemald',
    s: 'Empire conquérant',
    v: 0,
    img: 'd16',
    b: [
      [
        0,
        'Empire du nord, maître de la magitek, qui conquiert Ala Mhigo, Doma et tant d’autres pays. Ses habitants ne peuvent guère manier la magie, et voient dans les primordiaux une menace à éradiquer.',
      ],
      [2, 'Il fut fondé par Solus zos Galvus, en réalité l’Ascien Emet-Selch, pour attiser les guerres qui servent les Asciens.'],
      [4, 'La guerre civile et la Fin des temps le laissent en ruines.'],
    ],
    see: ['x-emet-selch', 'x-varis', 'x-zenos', 'x-gaius'],
  },
  {
    k: 'x-chant-des-dragons',
    t: 'notion',
    n: 'Guerre du Chant des dragons',
    s: 'Mille ans de guerre',
    img: 'd170',
    v: 1,
    b: [
      [
        1,
        'Depuis mille ans, Ishgard et les dragons de Nidhogg se font la guerre. L’Église enseigne que les dragons ont trahi les hommes ; la vérité est inverse : le roi Thordan et ses chevaliers ont tué Ratatoskr pour voler son pouvoir.',
      ],
      [
        1,
        'Le Guerrier de la Lumière y met fin avec Estinien, Ysayle et Aymeric, et ouvre la voie d’une paix fragile entre les hommes et Hraesvelgr.',
      ],
    ],
    see: ['x-ishgard', 'x-nidhogg', 'x-thordan', 'x-hraesvelgr'],
  },
  {
    k: 'x-allag',
    t: 'notion',
    n: 'Empire allagois',
    s: 'Empire disparu',
    img: 'd102',
    v: 0,
    b: [
      [
        0,
        'Puissant empire d’il y a cinq mille ans, qui domptait les primordiaux et élevait des tours jusqu’au ciel. Sa chute, provoquée par sa propre démesure, marqua la fin de la Troisième Ère astrale. Ses vestiges, comme la Tour de Cristal ou Azys Lla, dorment encore.',
      ],
    ],
    see: ['x-graha', 'x-mor-dhona'],
  },
  {
    k: 'x-reflets',
    t: 'notion',
    n: 'La Source et les reflets',
    s: 'L’étoile brisée',
    v: 3,
    aka: ['Scission', 'Premier reflet'],
    b: [
      [
        3,
        'Le monde d’Hydaelyn n’est qu’un fragment : la Source. Autour d’elle existent treize reflets, nés quand le monde des Anciens fut brisé. Le Premier reflet, Norvrandt, en est un.',
      ],
      [
        3,
        'Quand un reflet se réunit à la Source, une Calamité frappe et ses habitants y sont fondus. Les Asciens provoquent ces fusions pour ressusciter Zordiarche.',
      ],
    ],
    see: ['x-deluge', 'x-zodiark', 'x-hydaelyn'],
  },
  {
    k: 'x-deluge',
    t: 'notion',
    n: 'Déluge de Lumière',
    s: 'Le malheur du Premier reflet',
    v: 3,
    img: 'd747',
    b: [
      [
        3,
        'Il y a cent ans, Ardbert et ses compagnons empêchent une fusion du Premier reflet… et rompent l’équilibre de son éther. La lumière submerge alors presque tout Norvrandt : la nuit disparaît, et les mangepéchés, créatures blanches, changent ceux qu’ils touchent en leurs semblables.',
      ],
      [3, 'Le Guerrier des Ténèbres rend la nuit à Norvrandt en abattant leurs plus puissants maîtres.'],
    ],
    see: ['x-ardbert', 'x-cristarium', 'x-eulmore'],
  },
  {
    k: 'x-fin-des-temps',
    t: 'notion',
    n: 'La Fin des temps',
    s: 'Le désespoir des étoiles',
    v: 4,
    img: 'd787',
    b: [
      [
        4,
        'Une catastrophe qui change le désespoir des êtres en monstres. Elle a déjà frappé les Anciens, qui invoquèrent Zordiarche pour l’arrêter. Elle revient à notre époque, déclenchée par Fandaniel depuis la tour de Babil.',
      ],
      [4, 'Son origine est le chant de Méteion, née du doute d’Hermès.'],
    ],
    see: ['x-meteion', 'x-fandaniel', 'x-venat'],
  },
  {
    k: 'x-tural',
    t: 'notion',
    n: 'Tural',
    s: 'Le nouveau continent',
    img: 'd834',
    v: 5,
    b: [
      [
        5,
        'Continent lointain réunifié par Gulool Ja Ja, où vivent des peuples très divers : Mamool Ja, Hrothgars, Pelupelu, Yok Huy et bien d’autres. Le choix de son prochain souverain passe par un rite de succession à travers tout le pays.',
      ],
    ],
    see: ['x-wuk-lamat', 'x-gulool', 'x-tuliyollal'],
  },
  {
    k: 'x-alexandrie',
    t: 'notion',
    n: 'Alexandrie',
    s: 'Royaume venu d’un autre reflet',
    img: 'd827',
    v: 5,
    b: [
      [
        5,
        'Royaume technologique d’un autre reflet, uni de force à Tural. Sa reine Sphene y gouverne un peuple qui ne craint plus la mort, au prix d’une énergie volée aux âmes.',
      ],
    ],
    see: ['x-sphene', 'x-solution-neuf', 'x-memoire-vivante'],
  },
];
