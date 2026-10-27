/** Ancienne fiche d'un objet récoltable : tout est maintenant sur la fiche centrale de l'objet. */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function GatherableItemRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/item/[id]', params: { id } }} />;
}
