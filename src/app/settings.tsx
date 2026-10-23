import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorBox, Loading, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { RUNNING_IN_BROWSER, runDiagnostics, type ProbeResult } from '@/api/diagnostics';
import { isSyncAvailable } from '@/api/sync';
import { getDataCenters, getWorlds, regionLabel, type DataCenter } from '@/api/universalis';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const SOURCES = [
  { name: 'Lodestone', url: 'https://eu.finalfantasyxiv.com/lodestone/', what: 'fiches des personnages' },
  { name: 'Universalis', url: 'https://universalis.app', what: 'prix du marché' },
  { name: 'XIVAPI', url: 'https://v2.xivapi.com', what: 'objets et icônes' },
  { name: 'FFXIV Collect', url: 'https://ffxivcollect.com', what: 'provenances et rareté des collections (instantané intégré)' },
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
    <Screen>
      <Section title="Notifications">
        <Button label="Alertes du marché et rappels du jeu" variant="secondary" onPress={() => router.push('/notifications')} />
      </Section>

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

      <ModelsSection />

      <Diagnostics />

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

/** Explique d'où viennent les modèles 3D : il n'y a rien à régler. */
function ModelsSection() {
  return (
    <Section title="Modèles 3D">
      <ThemedText type="small" themeColor="textSecondary">
        {isSyncAvailable()
          ? 'Installe le plugin Dalamud Clavicule sur ton PC : il envoie l’apparence de ton personnage à chaque connexion et changement de tenue. Le bouton 3D apparaît alors sur sa fiche, pour toi comme pour tout le monde.'
          : 'La vue 3D n’est pas encore disponible dans cette version de l’appli.'}
      </ThemedText>
    </Section>
  );
}

function Diagnostics() {
  const region = useAppStore((s) => s.region);
  const test = useMutation({ mutationFn: () => runDiagnostics(region) });
  return (
    <Section title="Diagnostic">
      <ThemedText type="small" themeColor="textSecondary">
        Vérifie que l’appli arrive à joindre chaque site, et affiche l’erreur exacte sinon.
      </ThemedText>
      {RUNNING_IN_BROWSER ? (
        <ThemedText type="small" themeColor="textSecondary">
          Tu utilises la version navigateur : le Lodestone y est toujours bloqué par le navigateur. Teste sur ton téléphone avec Expo Go.
        </ThemedText>
      ) : null}
      <Button label={test.isPending ? 'Test en cours…' : 'Tester l’accès aux sources'} onPress={() => test.mutate()} disabled={test.isPending} />
      {test.data ? (
        <Card>
          {test.data.map((r) => (
            <ProbeRow key={r.source} result={r} />
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

function ProbeRow({ result }: { result: ProbeResult }) {
  const theme = useTheme();
  return (
    <View style={styles.probe} accessible accessibilityLabel={`${result.source} : ${result.ok ? 'OK' : 'échec'}. ${result.summary}`}>
      <ThemedText type="smallBold" style={{ color: result.ok ? theme.success : theme.danger }}>
        {result.ok ? '✓' : '✗'} {result.source} · {result.ms} ms
      </ThemedText>
      <ThemedText type="small">{result.summary}</ThemedText>
      {result.detail ? (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {result.detail}
        </ThemedText>
      ) : null}
    </View>
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
  probe: { paddingVertical: Spacing.one, gap: Spacing.half },
});
