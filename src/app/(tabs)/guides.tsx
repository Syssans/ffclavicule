/** Onglet Guides : l'heure d'Éorzéa, les modules du jeu et les prochaines réinitialisations. */
import { router, type Href } from 'expo-router';

import { Clocks, ResetBoard } from '@/components/clocks';
import { ModuleTile, TileRow } from '@/components/game-ui';
import { SettingsButton } from '@/components/home';
import { Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { useNow } from '@/hooks/use-now';

const MODULES: { title: string; icon: number; href: Href }[] = [
  { title: 'Artisanat', icon: MenuIcons.artisanat, href: '/crafting' },
  { title: 'Pêche', icon: MenuIcons.peche, href: '/fishing' },
  { title: 'Récolte', icon: MenuIcons.recolte, href: '/gathering' },
];

export default function GuidesScreen() {
  const now = useNow(1000);
  return (
    <Screen title="Guides" tab right={<SettingsButton />}>
      <Clocks now={now} />
      <TileRow>
        {MODULES.map((m) => (
          <ModuleTile key={m.title} icon={m.icon} title={m.title} onPress={() => router.push(m.href)} />
        ))}
      </TileRow>
      <ResetBoard now={now} />
    </Screen>
  );
}
