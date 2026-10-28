/** Carte ouverte depuis une fiche (poisson, point de récolte…) : elle s'empile, et « retour » ramène à la fiche. */
import { MapScreen } from '@/components/map/map-screen';

export default function MapRoute() {
  return <MapScreen atlas="/map/browse" />;
}
