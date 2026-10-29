/** Pages de l'appli proposées par la recherche, avec les mots qui y mènent. */
import type { Href } from 'expo-router';

import { FishingIcons } from '@/components/fishing';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { huntData, mainMarks, markName, zoneName } from '@/utils/hunt';
import { searchKey } from '@/utils/search';

export interface AppPage {
  key: string;
  title: string;
  subtitle: string;
  icon: number;
  href: Href;
  /** Clé de recherche : titre, sous-titre et synonymes. */
  search: string;
}

function page(key: string, title: string, subtitle: string, icon: number, href: Href, synonyms = ''): AppPage {
  return { key, title, subtitle, icon, href, search: searchKey(`${title} ${subtitle} ${synonyms}`) };
}

export const APP_PAGES: AppPage[] = [
  page('carte', 'Carte interactive', 'Monde, régions, zones et instances', MenuIcons.carte, '/carte', 'map plan'),
  page(
    'atlas',
    'Atlas',
    'Toutes les cartes du jeu, par région et par type d’instance',
    MenuIcons.carte,
    '/carte/atlas',
    'cartes donjons defis raids',
  ),
  page('peche', 'Pêche', 'Poissons, fenêtres, appâts', MenuIcons.peche, '/fishing', 'pecheur poisson'),
  page('ocean', 'Pêche en mer', 'Départs, itinéraires et poissons du bateau', FishingIcons.ocean, '/fishing/ocean', 'bateau ocean'),
  page('meteo', 'Météo d’Éorzéa', 'Prévisions de chaque zone', FishingIcons.weather, '/fishing/weather', 'temps meteo'),
  page('carnet-peche', 'Carnet de pêche', 'Poissons attrapés et manquants', FishingIcons.log, '/fishing/log', 'journal'),
  page('recolte', 'Récolte', 'Points de récolte, objets, guide de niveau', MenuIcons.recolte, '/gathering', 'mineur botaniste'),
  page('horaires', 'Points à horaires', 'Légendaires, immaculés et éphémères', MenuIcons.recolte, '/gathering/timed', 'legendaire immacule ephemere'),
  page('ou-recolter', 'Où récolter', 'L’emplacement de chaque objet récoltable', MenuIcons.recolte, '/gathering/items', 'recolte objets'),
  page('carnet-recolte', 'Carnet de récolte', 'Objets récoltés et manquants', MenuIcons.recolte, '/gathering/log', 'journal'),
  page('chasse', 'Chasse', 'Rangs A et S, contrats, fenêtres de réapparition', MenuIcons.bestiaire, '/hunt', 'hunt marques elite traque'),
  page('rangs', 'Rangs A et S', 'Marques de chaque zone et conditions d’apparition', MenuIcons.bestiaire, '/hunt/marks', 'hunt rang s spawn'),
  page('contrats', 'Contrats de chasse', 'Quotidiens et d’élite : cibles et positions', MenuIcons.journal, '/hunt/bills', 'hunt bill elite'),
  page('artisanat', 'Artisanat', 'Recettes, sous-recettes et guide de niveau', MenuIcons.artisanat, '/crafting', 'craft recette artisan'),
  page('liste', 'Ma liste d’artisanat', 'Ce qu’il reste à fabriquer et à réunir', MenuIcons.artisanat, '/crafting/list', 'courses craft'),
  page('rentabilite', 'Rentabilité', 'Ce qui rapporte le plus à fabriquer', GameIcons.gil, '/crafting/profit', 'profit benefice gil'),
  page('marche', 'Marché', 'Prix, favoris et tendances', GameIcons.marketBoard, '/market', 'tableau des ventes prix'),
  page('notifications', 'Notifications', 'Rappels du jeu et alertes de prix', GameIcons.calendar, '/notifications', 'alertes rappels'),
  page('legende', 'Légende', 'Le lore : personnages, lieux, chroniques, montures, mascottes', MenuIcons.journal, '/lore', 'lore histoire wiki chronologie'),
  page('chronologie', 'Chronologie', 'La trame principale, ère par ère', MenuIcons.journal, '/lore/chronique', 'histoire lore ere'),
  page(
    'aujourdhui',
    'Aujourd’hui',
    'Roulettes, peuples alliés, Khloé, mémoquartz : ce qu’il reste à faire',
    GameIcons.roulettes,
    '/today',
    'quotidien hebdomadaire taches checklist liste roulette tribus commandes speciales cactpot',
  ),
  page('guides', 'Guides', 'Heure d’Éorzéa, réinitialisations et modules', MenuIcons.guides, '/guides', 'heure eorzea reset'),
  page('reglages', 'Réglages', 'Région, personnages suivis, version de l’appli', MenuIcons.configuration, '/settings', 'parametres options'),
  page('ajouter', 'Ajouter un personnage', 'Depuis le Lodestone', MenuIcons.personnage, '/character/search', 'lodestone'),
];

let huntPages: AppPage[] | null = null;

/** Chaque marque de chasse (rangs B, A, S, SS) mène à la fiche de sa zone. */
export function huntMarkPages(): AppPage[] {
  if (huntPages) return huntPages;
  huntPages = huntData().zones.flatMap((zone) =>
    mainMarks(zone).map((m) =>
      page(
        `marque-${zone.t}-${m.r}-${m.n}`,
        markName(m.n),
        `Rang ${m.r} · ${zoneName(zone.t)}`,
        MenuIcons.bestiaire,
        { pathname: '/hunt/zone/[territory]', params: { territory: String(zone.t) } },
        'chasse marque',
      ),
    ),
  );
  return huntPages;
}
