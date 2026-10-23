/** Inventaire d'un personnage connecté : gil, monnaies, sacs, arsenal, sacoches, avec une recherche sur tout. */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PrivateSnapshot } from '@/api/private';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ItemList, ItemRow, PrivateIcons, PrivateScreen, type Names } from '@/components/private/shared';
import { ThemedText } from '@/components/themed-text';
import { Empty, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatGil, formatNumber } from '@/utils/format';
import { findItems } from '@/utils/inventory';

const CURRENCIES: Record<string, { label: string; icon: number }> = {
  mgp: { label: 'PGS', icon: 65025 },
  companySeals: { label: 'Sceaux de compagnie', icon: 65004 },
  wolfMarks: { label: 'Marques de loup', icon: 65014 },
  alliedSeals: { label: 'Insignes alliés', icon: 65024 },
};

/** Icône de chaque groupe du jeu (sacs, arsenal, sacoche de chocobo…). */
function groupIcon(key: string): number {
  if (key.startsWith('sacoche')) return 74;
  if (key.startsWith('arsenal') || key.startsWith('armoury')) return 32;
  if (key.startsWith('cristaux') || key.startsWith('crystal')) return 2;
  return PrivateIcons.inventory;
}

export default function InventoryScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return (
    <PrivateScreen id={id} title="Inventaire">
      {(snapshot, names) => <Inventory snapshot={snapshot} names={names} />}
    </PrivateScreen>
  );
}

function Inventory({ snapshot, names }: { snapshot: PrivateSnapshot; names?: Names }) {
  const [query, setQuery] = useState('');
  const found = useMemo(() => (names && query.trim() ? findItems(snapshot, names, query) : null), [snapshot, names, query]);
  const currencies = Object.entries(snapshot.currencies).filter(([key, value]) => CURRENCIES[key] && value > 0);

  return (
    <>
      <GameWindow icon={PrivateIcons.gil} title="Monnaies">
        <View style={styles.currencies}>
          <Currency icon={PrivateIcons.gil} label="Gil" value={formatGil(snapshot.gil)} />
          {currencies.map(([key, value]) => (
            <Currency key={key} icon={CURRENCIES[key].icon} label={CURRENCIES[key].label} value={formatNumber(value)} />
          ))}
        </View>
      </GameWindow>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Chercher un objet (sacs, sacoches, servants…)"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher un objet"
      />
      {found ? (
        found.length === 0 ? (
          <Empty>Aucun objet ne correspond.</Empty>
        ) : (
          <GameWindow icon={PrivateIcons.inventory} title="Résultats" subtitle={`${found.length} trouvé${found.length > 1 ? 's' : ''}`}>
            {found.map((f, i) => (
              <ItemRow key={`${f.place}-${f.id}-${f.hq}-${i}`} stack={f} names={names} detail={f.place} first={i === 0} />
            ))}
          </GameWindow>
        )
      ) : (
        snapshot.inventories.map((group) => (
          <GameWindow key={group.key} icon={groupIcon(group.key)} title={group.label} subtitle={`${group.items.length} objet${group.items.length > 1 ? 's' : ''}`}>
            {group.items.length === 0 ? <Empty>Vide.</Empty> : <ItemList items={group.items} names={names} />}
          </GameWindow>
        ))
      )}
      {!snapshot.inventories.some((g) => g.key.startsWith('sacoche')) ? (
        <ThemedText type="small" themeColor="textSecondary">
          Sacoches de chocobo : ouvre-les une fois en jeu pour qu’elles apparaissent ici.
        </ThemedText>
      ) : null}
    </>
  );
}

function Currency({ icon, label, value }: { icon: number; label: string; value: string }) {
  return (
    <View style={styles.currency}>
      <MenuIcon id={icon} size={32} />
      <View style={styles.grow}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  currencies: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  currency: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexBasis: '50%' },
  grow: { flex: 1, minWidth: 0 },
});
