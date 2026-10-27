/** Ancienne fiche d'un poisson : tout est maintenant sur la fiche centrale de l'objet. */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function FishRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/item/[id]', params: { id } }} />;
}
