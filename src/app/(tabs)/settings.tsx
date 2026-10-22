import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, ErrorBox, Loading, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getDataCenters, getWorlds, regionLabel, type DataCenter } from '@/api/universalis';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const SOURCES = [
  { name: 'Lodestone', url: 'https://eu.finalfantasyxiv.com/lodestone/', what: 'fiches des personnages' },
  { name: 'Universalis', url: 'https://universalis.app', what: 'prix du marché' },
  { name: 'XIVAPI', url: 'https://v2.xivapi.com', what: 'objets et icônes' },
  { name: 'FFXIV Collect', url: 'https://ffxivcollect.com', what: 'collections' },
  { name: 'lodestone-css-selectors', url: 'https://github.com/xivapi/lodestone-css-selectors', what: 'lecture du Lodestone' },
];

export default function SettingsScreen() {
  const region = useAppStore((s) => s.region);
  const setRegion = useAppStore((s) => s.setRegion);
  const scope = useAppStore((s) => s.marketScope);
  const setScope = useAppStore((s) => s.setMarketScope);

  const dataCenters = useQuery({ queryKey: ['universalis', 'data-centers'], queryFn: getDataCenters, staleTime: Infinity });
  const worlds = useQuery({ queryKey: ['universalis', 'worlds'], queryFn: getWorlds, staleTime: Infinity });

  const worldName = new Map(worlds.data?.map((w) => [w.id, w.name]));
  // Le choix peut être un centre de données ou un monde : on retrouve le centre de données concerné.
  const currentDc =
    dataCenters.data?.find((dc) => dc.name === scope) ??
    dataCenters.data?.find((dc) => dc.worlds.some((id) => worldName.get(id) === scope));
  const byRegion = groupByRegion(dataCenters.data ?? []);

  return (
    <Screen title="Réglages" tab>
      <Section title="Lodestone">
        <Segmented
          options={[
            { value: 'eu', label: 'Europe' },
            { value: 'na', label: 'Amérique du Nord' },
          ]}
          value={region}
          onChange={setRegion}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Version du Lodestone utilisée pour lire les personnages. Les deux trouvent tous les personnages.
        </ThemedText>
      </Section>

      <Section title="Serveur pour les prix">
        {dataCenters.isPending ? <Loading /> : null}
        {dataCenters.error ? <ErrorBox error={dataCenters.error} onRetry={() => dataCenters.refetch()} /> : null}
        {Object.entries(byRegion).map(([regionName, dcs]) => (
          <View key={regionName} style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              {regionLabel(regionName)}
            </ThemedText>
            <View style={styles.chips}>
              {dcs.map((dc) => (
                <Chip key={dc.name} label={dc.name} selected={dc.name === currentDc?.name} onPress={() => setScope(dc.name)} />
              ))}
            </View>
          </View>
        ))}
        {currentDc && worlds.data ? (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              Monde (facultatif)
            </ThemedText>
            <View style={styles.chips}>
              <Chip label={`Tout ${currentDc.name}`} selected={scope === currentDc.name} onPress={() => setScope(currentDc.name)} />
              {currentDc.worlds
                .map((id) => worldName.get(id))
                .filter((name): name is string => Boolean(name))
                .sort()
                .map((name) => (
                  <Chip key={name} label={name} selected={scope === name} onPress={() => setScope(name)} />
                ))}
            </View>
          </View>
        ) : null}
      </Section>

      <Section title="Sources">
        <Card>
          {SOURCES.map((s) => (
            <Pressable key={s.name} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(s.url)} style={styles.source}>
              <ThemedText type="smallBold">{s.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {s.what}
              </ThemedText>
            </Pressable>
          ))}
        </Card>
        <ThemedText type="small" themeColor="textSecondary">
          Appli non officielle, sans lien avec Square Enix.{'\n'}
          FINAL FANTASY XIV © SQUARE ENIX CO., LTD. Tous droits réservés.
        </ThemedText>
      </Section>
    </Screen>
  );
}

function groupByRegion(dcs: DataCenter[]): Record<string, DataCenter[]> {
  const out: Record<string, DataCenter[]> = {};
  for (const dc of dcs) {
    // On ignore les centres de données sans monde.
    if (dc.worlds.length === 0) continue;
    (out[dc.region] ??= []).push(dc);
  }
  return out;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
      <ThemedText type="small" style={{ color: selected ? theme.accentText : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 36, paddingHorizontal: Spacing.three, borderRadius: 18, justifyContent: 'center' },
  source: { paddingVertical: Spacing.one },
});
