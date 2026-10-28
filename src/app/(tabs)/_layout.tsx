import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';

/** Icônes du menu principal du jeu (silhouettes), teintées par la barre d'onglets. */
const ICONS = {
  personnage: require('../../../assets/images/tabs/personnage.png'),
  carte: require('../../../assets/images/tabs/carte.png'),
  recherche: require('../../../assets/images/tabs/recherche.png'),
  guides: require('../../../assets/images/tabs/guides.png'),
  marche: require('../../../assets/images/tabs/marche.png'),
};

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <NativeTabs
      backgroundColor={theme.background}
      indicatorColor={theme.backgroundSelected}
      iconColor={{ default: theme.textSecondary, selected: theme.accent }}
      labelStyle={{ default: { color: theme.textSecondary }, selected: { color: theme.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Personnages</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.personnage} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="carte">
        <NativeTabs.Trigger.Label>Carte</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.carte} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recherche">
        <NativeTabs.Trigger.Label>Recherche</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.recherche} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="guides">
        <NativeTabs.Trigger.Label>Guides</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.guides} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="market">
        <NativeTabs.Trigger.Label>Marché</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={ICONS.marche} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
