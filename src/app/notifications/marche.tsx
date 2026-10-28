/** Ancienne adresse des alertes de prix : elles sont désormais dans le centre de notifications. */
import { Redirect } from 'expo-router';

export default function MarketAlertsRedirect() {
  return <Redirect href={{ pathname: '/notifications', params: { tab: 'marche' } }} />;
}
