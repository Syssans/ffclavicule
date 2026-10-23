/** Accueil : ce qui compte aujourd'hui pour le personnage principal. */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MenuGrid, MenuIcon, MenuTile } from '@/components/game-ui';
import { SettingsButton, useMainCharacter, Welcome } from '@/components/home';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useCatalog, usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { summarize } from '@/utils/character-summary';
import { usableItems } from '@/utils/collections';
import { formatCountdown, formatEorzeaTime, upcomingResets } from '@/utils/timers';

export default function HomeScreen() {
  const now = useNow(1000);
  const main = useMainCharacter();
  const region = useAppStore((s) => s.region);
  const id = main?.id ?? Number.NaN;
  const { link, query } = usePrivate(id);
  const catalog = useCatalog(id);
  const summary = summarize(query.data, now);
  const usable = usableItems(catalog.data, query.data);

  return (
    <Screen title="Clavicule" tab right={<SettingsButton />}>
      <EorzeaClock now={now} />

      {main ? <MainCharacter name={main.name} world={main.world} avatar={main.avatar} /> : <Welcome />}

      {main && link ? (
        <Section title="Aujourd’hui">
          <MenuGrid>
            <MenuTile
              icon={MenuIcons.objets}
              title="Servants"
              subtitle={
                summary?.venturesDone
                  ? `${summary.venturesDone} mission(s) terminée(s)`
                  : summary?.nextVenture
                    ? `Retour dans ${formatCountdown(summary.nextVenture * 1000 - now)}`
                    : 'Aucune mission en cours'
              }
              badge={summary?.venturesDone ? String(summary.venturesDone) : null}
              onPress={() => router.push({ pathname: '/private/[id]', params: { id: String(id), tab: 'retainers' } })}
            />
            <MenuTile
              icon={MenuIcons.journal}
              title="Courrier"
              subtitle={summary?.unreadLetters ? `${summary.unreadLetters} lettre(s) non lue(s)` : 'Rien de nouveau'}
              badge={summary?.unreadLetters ? String(summary.unreadLetters) : null}
              onPress={() => router.push({ pathname: '/private/[id]', params: { id: String(id), tab: 'mail' } })}
            />
            <MenuTile
              icon={MenuIcons.objetsPrecieux}
              title="À utiliser"
              subtitle={usable.length ? `${usable.length} objet(s) de collection en poche` : 'Rien en attente'}
              badge={usable.length ? String(usable.length) : null}
              onPress={() => router.push({ pathname: '/character/[id]/[section]', params: { id: String(id), section: 'collections' } })}
            />
            <MenuTile
              icon={MenuIcons.devises}
              title="Ventes"
              subtitle={summary?.listings ? `${summary.listings} objet(s) en vente` : 'Aucune vente en cours'}
              onPress={() => router.push({ pathname: '/private/[id]', params: { id: String(id), tab: 'retainers' } })}
            />
          </MenuGrid>
        </Section>
      ) : main ? (
        <Card>
          <ThemedText type="smallBold">Va plus loin avec le plugin</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Servants, courrier, objets à utiliser, collections : connecte le plugin Dalamud Clavicule (dans le jeu : /clavicule).
          </ThemedText>
          <Button label="Saisir le code du plugin" variant="secondary" onPress={() => router.push({ pathname: '/connect', params: { id: String(id), name: main.name } })} />
        </Card>
      ) : null}

      <Section title="Réinitialisations">
        <Card style={styles.list}>
          {upcomingResets(now, region).map((r, i) => (
            <View key={r.key} style={[styles.reset, i > 0 && styles.separated]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{r.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {r.detail}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" themeColor="ornament">
                {formatCountdown(r.at - now)}
              </ThemedText>
            </View>
          ))}
        </Card>
      </Section>

      {main && link ? (
        <Section title="Raccourcis">
          <MenuGrid>
            <MenuTile icon={MenuIcons.ath} title="ATH" subtitle="Disposition de l’interface" onPress={() => router.push({ pathname: '/hud/[id]', params: { id: String(id) } })} />
            <MenuTile icon={MenuIcons.barres} title="Barres d’actions" subtitle="Par job" onPress={() => router.push({ pathname: '/hotbars/[id]', params: { id: String(id) } })} />
          </MenuGrid>
        </Section>
      ) : null}
    </Screen>
  );
}

function EorzeaClock({ now }: { now: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.clock, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      <MenuIcon id={MenuIcons.calendrier} size={36} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          Heure d’Éorzéa
        </ThemedText>
        <ThemedText type="display" style={styles.clockTime}>
          {formatEorzeaTime(now)}
        </ThemedText>
      </View>
      <View style={styles.local}>
        <ThemedText type="small" themeColor="textSecondary">
          Heure locale
        </ThemedText>
        <ThemedText type="smallBold">{new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</ThemedText>
      </View>
    </View>
  );
}

function MainCharacter({ name, world, avatar }: { name: string; world: string | null; avatar: string | null }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, voir la fiche`}
      onPress={() => router.navigate('/personnage')}
      style={({ pressed }) => [styles.main, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      {avatar ? <Image source={avatar} style={[styles.avatar, { borderColor: theme.accent }]} /> : null}
      <View style={styles.flex}>
        <ThemedText type="display" numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {world ?? ''}
        </ThemedText>
      </View>
      <ThemedText themeColor="textSecondary">›</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  clockTime: { fontSize: 26, lineHeight: 32 },
  local: { alignItems: 'flex-end' },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  list: { gap: 0, paddingVertical: Spacing.one },
  reset: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  separated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.25)' },
});
