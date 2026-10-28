/** Ancienne adresse des rappels du jeu : ils sont désormais dans le centre de notifications. */
import { Redirect } from 'expo-router';

export default function GameRemindersRedirect() {
  return <Redirect href={{ pathname: '/notifications', params: { tab: 'jeu' } }} />;
}
