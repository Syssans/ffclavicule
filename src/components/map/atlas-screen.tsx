/** Atlas : chercher un lieu, ou parcourir les cartes (régions et zones, puis donjons, défis, raids…). */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameWindow, MenuRow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Chip, Empty, Input, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { childrenOf, dutyName, getMap, instancesByType, mapData, searchMap, WORLD_MAP, type MapInfo } from '@/utils/map';

const EXPANSIONS = ['A Realm Reborn', 'Heavensward', 'Stormblood', 'Shadowbringers', 'Endwalker', 'Dawntrail'];

/** Carte à laquelle l'atlas renvoie : celle de l'onglet Carte, ou celle ouverte depuis une fiche. */
export type MapRoute = '/map' | '/carte';

function openOnMap(target: MapRoute, mapId: number, x?: number, y?: number) {
  router.navigate({
    pathname: target,
    params: {
      map: String(mapId),
      t: String(Date.now()),
      ...(x !== undefined && y !== undefined ? { x: String(Math.round(x)), y: String(Math.round(y)) } : {}),
    },
  });
}

const KIND_ICON: Partial<Record<MapInfo['k'], number>> = {
  zone: 60442,
  city: 60448,
  housing: 60436,
  region: 60441,
};

export function AtlasScreen({ target }: { target: MapRoute }) {
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'world' | 'instances'>('world');
  const groups = useMemo(() => instancesByType(), []);
  const [type, setType] = useState<number>(groups[0]?.type ?? 2);
  const [shown, setShown] = useState(40);
  const results = useMemo(() => searchMap(text), [text]);

  const regions = useMemo(() => {
    const d = mapData();
    // Régions dans l'ordre du jeu, rattachées à n'importe quelle carte du monde.
    return d.order.filter((id) => d.maps[String(id)].k === 'region');
  }, []);

  const group = groups.find((g) => g.type === type);

  return (
    <Screen>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Chercher un lieu, une zone, un donjon, un aléa…"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher sur la carte"
      />
      {text.trim() ? (
        results.length === 0 ? (
          <Empty>Aucun lieu trouvé.</Empty>
        ) : (
          <GameWindow icon={60442} title="Résultats">
            {results.map((r) => (
              <MenuRow key={r.key} icon={r.icon} title={r.title} subtitle={r.subtitle} onPress={() => openOnMap(target, r.mapId, r.x, r.y)} />
            ))}
          </GameWindow>
        )
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'world', label: 'Régions et zones' },
              { value: 'instances', label: 'Instances' },
            ]}
          />
          {tab === 'world' ? (
            <>
              <MenuRow icon={60441} title="Hydaelyn" onPress={() => openOnMap(target, WORLD_MAP)} />
              {regions.map((id) => {
                const region = getMap(id)!;
                const children = childrenOf(id);
                return (
                  <GameWindow key={id} icon={60441} title={region.n} subtitle={region.x !== undefined ? EXPANSIONS[region.x] : EXPANSIONS[0]}>
                    <MenuRow icon={60441} title={`Carte de la région`} onPress={() => openOnMap(target, id)} />
                    {children.map((child) => {
                      const m = getMap(child)!;
                      return (
                        <MenuRow
                          key={child}
                          icon={KIND_ICON[m.k] ?? 60442}
                          title={m.s && m.s !== m.n ? `${m.n} – ${m.s}` : m.n}
                          subtitle={m.k === 'city' ? 'Ville' : m.k === 'housing' ? 'Quartier résidentiel' : null}
                          onPress={() => openOnMap(target, child)}
                        />
                      );
                    })}
                  </GameWindow>
                );
              })}
            </>
          ) : (
            <>
              <View style={styles.chips}>
                {groups.map((g) => (
                  <Chip
                    key={g.type}
                    label={`${g.name} (${g.maps.length})`}
                    selected={g.type === type}
                    onPress={() => {
                      setType(g.type);
                      setShown(40);
                    }}
                  />
                ))}
              </View>
              {group ? (
                <GameWindow icon={group.icon || 60414} title={group.name}>
                  {group.maps.slice(0, shown).map((id) => {
                    const m = getMap(id)!;
                    return (
                      <MenuRow
                        key={id}
                        icon={group.icon || 60414}
                        title={dutyName(m)}
                        subtitle={[m.l ? `Niv. ${m.l}` : null, m.il ? `iNiv. ${m.il}` : null, m.h ? 'Difficile' : null, m.r]
                          .filter(Boolean)
                          .join(' · ')}
                        onPress={() => openOnMap(target, id)}
                      />
                    );
                  })}
                  {group.maps.length > shown ? (
                    <Chip label={`Afficher plus (${group.maps.length - shown})`} onPress={() => setShown(shown + 40)} />
                  ) : null}
                </GameWindow>
              ) : null}
            </>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Cartes et repères tirés des données du jeu ; positions des aléas et des trésors : Teamcraft. Mise à jour : {mapData().updatedAt}.
          </ThemedText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
