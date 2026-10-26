/** Carnet de pêche (plugin) : poissons attrapés et manquants, avec ceux qu'on peut aller pêcher maintenant. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FishingIcons, FishRow, statusRank, useCaughtFish, useFishStatuses } from '@/components/fishing';
import { GameWindow, ProgressRing, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Empty, Loading, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { fishingData } from '@/utils/fishing';
import { formatNumber } from '@/utils/format';

type Filter = 'open' | 'missing' | 'big' | 'caught';

export default function FishingLogScreen() {
  const now = useNow(1000);
  const statuses = useFishStatuses(now);
  const { caught, linked, loading, name } = useCaughtFish();
  const [filter, setFilter] = useState<Filter>('open');
  const [shown, setShown] = useState(60);

  const list = useMemo(() => {
    if (!caught) return [];
    return fishingData()
      .fish.filter((f) => {
        const has = caught.ids.has(f.id);
        if (filter === 'caught') return has;
        if (has) return false;
        if (filter === 'open') return statuses.get(f.id)?.kind === 'open' || statuses.get(f.id)?.kind === 'always';
        if (filter === 'big') return Boolean(f.big);
        return true;
      })
      .sort((a, b) => statusRank(statuses.get(a.id)) - statusRank(statuses.get(b.id)));
  }, [caught, filter, statuses]);

  if (!linked) {
    return (
      <Screen>
        <GameWindow icon={MenuIcons.peche} title="Carnet de pêche" subtitle="Avec le plugin Clavicule">
          <ThemedText type="small">
            Le plugin lit ton carnet de pêche dans le jeu (pêche à la ligne et au harpon) : l’appli te montre ce qu’il te manque et ce que tu
            peux aller pêcher tout de suite.
          </ThemedText>
          <Button label="Connecter mon personnage" variant="secondary" onPress={() => router.push('/connect')} />
        </GameWindow>
      </Screen>
    );
  }
  if (loading) return <Loading label="Lecture de ton carnet…" />;
  if (!caught) {
    return (
      <Screen>
        <Empty>Le plugin n’a pas encore envoyé ton carnet de pêche : mets-le à jour et connecte-toi en jeu, l’envoi se fait dans la minute.</Empty>
      </Screen>
    );
  }

  const known = fishingData().fish.length;
  return (
    <Screen>
      <GameWindow icon={MenuIcons.peche} title="Carnet de pêche" subtitle={name}>
        <View style={styles.summary}>
          <ProgressRing value={caught.total ? caught.ids.size / caught.total : 0} size={72} stroke={5}>
            <MenuIcon id={FishingIcons.fisher} size={40} />
          </ProgressRing>
          <View style={styles.flex}>
            <ThemedText type="subtitle">
              {formatNumber(caught.ids.size)} / {formatNumber(caught.total)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              poissons au carnet (ligne et harpon) · {formatNumber(known)} avec leurs conditions dans l’appli
            </ThemedText>
          </View>
        </View>
      </GameWindow>
      <View style={styles.chips}>
        <Chip label="Manquants pêchables maintenant" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Tous les manquants" selected={filter === 'missing'} onPress={() => setFilter('missing')} />
        <Chip label="Gros poissons manquants" selected={filter === 'big'} onPress={() => setFilter('big')} />
        <Chip label="Attrapés" selected={filter === 'caught'} onPress={() => setFilter('caught')} />
      </View>
      {list.length === 0 ? (
        <Empty>{filter === 'open' ? 'Rien qui te manque n’est pêchable en ce moment.' : 'Aucun poisson.'}</Empty>
      ) : (
        <GameWindow icon={FishingIcons.fisher} title="Poissons" subtitle={`${list.length}`}>
          {list.slice(0, shown).map((f, i) => (
            <FishRow key={f.id} fish={f} status={statuses.get(f.id)} now={now} caught={caught.ids.has(f.id)} first={i === 0} />
          ))}
          {list.length > shown ? <Chip label={`Afficher plus (${list.length - shown})`} onPress={() => setShown(shown + 60)} /> : null}
        </GameWindow>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
