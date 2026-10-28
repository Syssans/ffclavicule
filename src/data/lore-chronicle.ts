/**
 * Chronologie d'Hydaelyn : la trame principale, ère par ère. Résumés écrits pour Clavicule (les fiches, elles,
 * viennent des textes du jeu). `v` : extension du chapitre (-1 pour ce qui précède le jeu), pour voiler les spoilers.
 */
export interface ChronicleChapter {
  v: number;
  title: string;
  era: string;
  /** Image d'ambiance (icône du jeu). */
  image: number;
  paragraphs: string[];
}

export const CHRONICLE: ChronicleChapter[] = [
  {
    v: -1,
    title: 'Les Ères',
    era: 'Avant le jeu',
    image: 112005,
    paragraphs: [
      'L’histoire d’Hydaelyn avance par grandes ères. Aux ères astrales, temps de paix et de prospérité, succèdent les ères ombrales, ouvertes chacune par un cataclysme : un Fléau qui bouleverse le monde et ses peuples.',
      'Sept ères ombrales ont déjà marqué l’Éorzéa. La dernière s’est ouverte avec la chute de Dalamud, la petite lune, d’où surgit Bahamut, le primordial dragon. La bataille de Carteneau se termina dans la lumière, et les héros qui y combattirent furent comme effacés des mémoires.',
    ],
  },
  {
    v: 0,
    title: 'A Realm Reborn',
    era: 'Le royaume restauré',
    image: 112004,
    paragraphs: [
      'Cinq ans après le Fléau, l’Éorzéa panse ses plaies. Les cités de Limsa Lominsa, Gridania et Ul’dah se relèvent, tandis que les tribus des hommes-bêtes invoquent leurs dieux, les primordiaux, qui puisent leur force dans les cristaux du monde.',
      'Une aventurière ou un aventurier béni par la Lumière, le Guerrier de la Lumière, rejoint les Héritiers de l’Aube. Ifrit, Titan et Garuda tombent l’un après l’autre, et l’Empire garlemaldais, mené ici par Gaius van Baelsar, voit son Ultima Weapon détruite au Praetorium.',
      'Mais dans l’ombre, les Ascians tirent les ficelles. Et à Ul’dah, un complot frappe les Héritiers en plein cœur : accusés à tort, ils doivent fuir vers une cité restée longtemps fermée, Ishgard.',
    ],
  },
  {
    v: 1,
    title: 'Heavensward',
    era: 'La guerre du Chant des dragons',
    image: 112090,
    paragraphs: [
      'Depuis mille ans, la sainte cité d’Ishgard combat les dragons de Dravania. Sa foi raconte un roi et ses douze chevaliers terrassant le grand dragon Nidhogg ; les dragons, eux, se souviennent d’une trahison.',
      'Aux côtés d’Alphinaud, d’Ysayle, d’Estinien et d’Aymeric, le Guerrier de la Lumière découvre la vérité que l’Église a enfouie, affronte l’archevêque Thordan et ses chevaliers azurés, puis la colère de Nidhogg. La paix entre hommes et dragons devient possible, au prix de lourds sacrifices.',
    ],
  },
  {
    v: 2,
    title: 'Stormblood',
    era: 'La libération',
    image: 112233,
    paragraphs: [
      'Ala Mhigo, en Gyr Abania, et Doma, de l’autre côté de la mer, vivent depuis des années sous le joug de l’Empire. Les Éorzéens prennent les armes pour les libérer.',
      'Face au prince Zenos yae Galvus, ennemi aussi fascinant qu’implacable, la Résistance d’Ala Mhigo et le peuple de Doma retrouvent leur liberté. Mais la chute du prince ouvre la voie à de nouveaux desseins ascians.',
    ],
  },
  {
    v: 3,
    title: 'Shadowbringers',
    era: 'Le Premier Reflet',
    image: 112347,
    paragraphs: [
      'Appelé au-delà du monde connu, le Guerrier de la Lumière s’éveille sur le Premier Reflet, un des mondes nés de la sundération. Là, la Lumière a tout englouti : le ciel ne connaît plus la nuit.',
      'Guidé par l’Exarque de Cristal et devenu Guerrier des Ténèbres, il rend la nuit à Norvrandt en abattant les Gardiens de Lumière. Sur sa route, l’Ascien Emet-Selch lui révèle Amaurote et le passé oublié des anciens.',
    ],
  },
  {
    v: 4,
    title: 'Endwalker',
    era: 'Les Derniers Jours',
    image: 112436,
    paragraphs: [
      'Des tours surgissent sur l’Étoile et le monde bascule vers les Derniers Jours, une fin que les anciens avaient déjà connue. De Garlemald à Vieille Sharlayan, jusqu’aux Terres d’Elpis, le passé d’Hydaelyn et de Zodiark se dévoile.',
      'Le voyage mène au bout de l’univers, à la rencontre de Meteion et du désespoir des étoiles. Ainsi se referme l’histoire commencée avec Hydaelyn : la saga de la Lumière et des Ténèbres.',
    ],
  },
  {
    v: 5,
    title: 'Dawntrail',
    era: 'L’aube du Nouveau Monde',
    image: 112555,
    paragraphs: [
      'Une nouvelle aventure s’ouvre sur le continent de Tural. À Tuliyollal, Wuk Lamat dispute à d’autres héritiers le trône de son père, au fil d’un rite de succession qui traverse tout le continent, sur la piste d’une cité d’or.',
      'Au-delà des montagnes, la Ville d’Or et Solution Neuf mènent vers Alexandria, et vers des souvenirs vivants qui interrogent ce qu’est la mort.',
    ],
  },
];
