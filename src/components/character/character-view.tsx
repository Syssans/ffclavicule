/**
 * Fiche d'un personnage : le portrait, sa fiche d'identité, ses jobs les plus avancés, puis des tuiles vers chaque
 * partie (équipement, collections, possessions et interface lues par le plugin).
 */
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { disconnect } from '@/api/private';
import { gameIconUrl } from '@/api/xivapi';
import { FollowActions, Hero } from '@/components/character/parts';
import { ModuleTile, TileRow } from '@/components/game-ui';
import { ConnectedPill, PhoneIcon } from '@/components/home';
import { PrivateIcons } from '@/components/private/shared';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorBox, GameIcon, Loading, Section } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { jobIconId } from '@/data/jobs';
import { useLodestoneCollection } from '@/hooks/use-lodestone-collection';
import { usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { getCharacter, getClassJobs, lodestoneProfileUrl, type CharacterProfile } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { summarize } from '@/utils/character-summary';
import { formatGil, formatNumber } from '@/utils/format';

export type CharacterSection = 'profil' | 'jobs' | 'equipement' | 'collections';

export function openSection(id: number, section: CharacterSection) {
  router.push({ pathname: '/character/[id]/[section]', params: { id: String(id), section } });
}

function openPrivate(id: number, screen: 'inventory' | 'retainers' | 'mail') {
  const pathname = screen === 'inventory' ? '/inventory/[id]' : screen === 'retainers' ? '/retainers/[id]' : '/mail/[id]';
  router.push({ pathname, params: { id: String(id) } });
}

const MAX_LEVEL = 100;

export function CharacterView({ id }: { id: number }) {
  const region = useAppStore((s) => s.region);
  const profile = useQuery({
    queryKey: ['lodestone', 'character', region, id],
    queryFn: () => getCharacter(region, id),
    enabled: Number.isFinite(id),
  });
  const { link, query } = usePrivate(id);
  const summary = summarize(query.data);
  // Sans le plugin, les montures et mascottes viennent du Lodestone.
  const mounts = useLodestoneCollection(id, 'mount', !link);
  const minions = useLodestoneCollection(id, 'minion', !link);
  const saved = useAppStore((s) => s.characters.find((c) => c.id === id));
  const saveCharacter = useAppStore((s) => s.saveCharacter);
  const setPrivateLink = useAppStore((s) => s.setPrivateLink);

  // Un personnage ajouté depuis le plugin n'a parfois ni nom ni avatar : le Lodestone les complète.
  const fresh = profile.data;
  useEffect(() => {
    if (!saved || !fresh) return;
    if (saved.name !== fresh.name || saved.avatar !== fresh.avatar || saved.world !== fresh.world) {
      saveCharacter({ id, name: fresh.name, world: fresh.world, dataCenter: fresh.dataCenter, avatar: fresh.avatar });
    }
  }, [saved, fresh, id, saveCharacter]);

  if (profile.isPending) return <Loading label="Lecture du Lodestone…" />;
  if (profile.error) return <ErrorBox error={profile.error} onRetry={() => profile.refetch()} />;
  const p = profile.data;
  const linked = Boolean(link);
  const collections = summary?.collectionsTotal
    ? `${formatNumber(summary.collectionsOwned)} obtenus`
    : !linked && mounts.data && minions.data && !mounts.data.hidden
      ? `${mounts.data.owned} montures`
      : null;

  return (
    <>
      <Hero profile={p} badge={<ConnectedPill characterId={id} />} />

      <IdentityCard profile={p} onPress={() => openSection(id, 'profil')} />

      <JobsStrip id={id} />

      <TileRow>
        <ModuleTile icon={MenuIcons.arsenal} title="Équipement" onPress={() => openSection(id, 'equipement')} />
        <ModuleTile icon={MenuIcons.hautsFaits} title="Collections" detail={collections} onPress={() => openSection(id, 'collections')} />
        <ModuleTile
          icon={MenuIcons.carteDePersonnage}
          title="Lodestone"
          onPress={() => WebBrowser.openBrowserAsync(lodestoneProfileUrl(region, p.id))}
        />
      </TileRow>

      {linked ? (
        <>
          <Section title="Possessions">
            <TileRow>
              <ModuleTile
                icon={MenuIcons.inventaire}
                title="Inventaire"
                detail={query.data ? formatGil(query.data.gil) : null}
                onPress={() => openPrivate(id, 'inventory')}
              />
              <ModuleTile
                icon={PrivateIcons.retainers}
                title="Servants"
                detail={summary ? (summary.venturesDone ? `${summary.venturesDone} terminée${summary.venturesDone > 1 ? 's' : ''}` : `${summary.listings} en vente`) : null}
                badge={summary?.venturesDone ? String(summary.venturesDone) : null}
                onPress={() => openPrivate(id, 'retainers')}
              />
              <ModuleTile
                icon={PrivateIcons.mailbox}
                title="Courrier"
                detail={summary?.unreadLetters ? `${summary.unreadLetters} non lue${summary.unreadLetters > 1 ? 's' : ''}` : null}
                badge={summary?.unreadLetters ? String(summary.unreadLetters) : null}
                onPress={() => openPrivate(id, 'mail')}
              />
            </TileRow>
          </Section>
          <Section title="Interface du jeu">
            <TileRow>
              <ModuleTile icon={MenuIcons.ath} title="ATH" onPress={() => router.push({ pathname: '/hud/[id]', params: { id: String(id) } })} />
              <ModuleTile
                icon={MenuIcons.barres}
                title="Barres d’actions"
                onPress={() => router.push({ pathname: '/hotbars/[id]', params: { id: String(id) } })}
              />
            </TileRow>
          </Section>
        </>
      ) : saved ? (
        <PluginCard onPress={() => router.push({ pathname: '/connect', params: { id: String(id), name: p.name } })} />
      ) : null}

      <View style={styles.footer}>
        <FollowActions profile={p} />
        {link ? (
          <Button
            label="Déconnecter ce téléphone du plugin"
            variant="danger"
            onPress={async () => {
              // Même si le service ne répond pas, ce téléphone oublie le lien.
              await disconnect(id, link.token).catch(() => undefined);
              setPrivateLink(id, null);
            }}
          />
        ) : null}
      </View>
    </>
  );
}

/** Fiche d'identité : cité, divinité, Grande Compagnie, compagnie libre ; toucher ouvre le profil complet. */
function IdentityCard({ profile: p, onPress }: { profile: CharacterProfile; onPress: () => void }) {
  const theme = useTheme();
  const facts = [
    { key: 'city', icon: p.cityStateIcon, label: 'Cité', value: p.cityState },
    { key: 'guardian', icon: p.guardianIcon, label: 'Divinité', value: p.guardian },
    { key: 'gc', icon: gameIconUrl(GameIcons.grandCompany), label: 'Grande Compagnie', value: p.grandCompany?.name ?? null, extra: p.grandCompany?.rank },
    { key: 'fc', icon: gameIconUrl(8), label: 'Compagnie libre', value: p.freeCompany?.name ?? null },
  ].filter((f) => f.value);
  if (!facts.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Profil : ${facts.map((f) => `${f.label} ${f.value}`).join(', ')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.identity, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <View style={styles.identityHead}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
          {[p.race, p.tribe].filter(Boolean).join(' · ') || 'Profil'}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.ornament }}>
          Profil ›
        </ThemedText>
      </View>
      <View style={styles.facts}>
        {facts.map((f) => (
          <View key={f.key} style={styles.fact}>
            <GameIcon uri={f.icon} size={30} />
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.factLabel}>
                {f.label}
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={2}>
                {f.value}
              </ThemedText>
              {f.extra ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.factLabel}>
                  {f.extra}
                </ThemedText>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** Les jobs les plus avancés, en bandeau ; les jobs au niveau maximum en or. */
function JobsStrip({ id }: { id: number }) {
  const theme = useTheme();
  const region = useAppStore((s) => s.region);
  const jobs = useQuery({ queryKey: ['lodestone', 'classjob', region, id], queryFn: () => getClassJobs(region, id) });
  const unlocked = (jobs.data ?? []).filter((j) => j.level !== null).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  if (!unlocked.length) return null;
  const maxed = unlocked.filter((j) => j.level === MAX_LEVEL).length;
  return (
    <Section
      title="Jobs"
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="Tous les jobs" hitSlop={8} onPress={() => openSection(id, 'jobs')}>
          <ThemedText type="smallBold" style={{ color: theme.ornament }}>
            {maxed ? `${maxed} au max ›` : 'Tous ›'}
          </ThemedText>
        </Pressable>
      }>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jobs}>
        {unlocked.map((j) => {
          const max = j.level === MAX_LEVEL;
          return (
            <Pressable
              key={j.job.key}
              accessibilityRole="button"
              accessibilityLabel={`${j.job.name}, niveau ${j.level}`}
              onPress={() => openSection(id, 'jobs')}
              style={[styles.job, { borderColor: max ? theme.ornament : theme.frame, backgroundColor: theme.backgroundElement }]}>
              <Image source={gameIconUrl(jobIconId(j.job))} style={styles.jobIcon} contentFit="contain" />
              <ThemedText type="smallBold" style={[styles.jobLevel, { color: max ? theme.ornament : theme.text }]}>
                {j.level}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </Section>
  );
}

/** Sans le plugin : une seule invitation, à la place des possessions et de l'interface. */
function PluginCard({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.plugin, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.pluginHead}>
        <View style={[styles.pluginIcon, { backgroundColor: theme.backgroundSelected }]}>
          <PhoneIcon size={20} />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Connecter le plugin</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Inventaire, servants, courrier et ATH, lus dans le jeu.
          </ThemedText>
        </View>
      </View>
      <Button label="Saisir le code du plugin" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  identity: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  identityHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, width: '50%', paddingRight: Spacing.two },
  factLabel: { fontSize: 12, lineHeight: 16 },
  jobs: { gap: Spacing.two, paddingVertical: 2 },
  job: { width: 58, alignItems: 'center', gap: 2, paddingVertical: Spacing.two, borderRadius: 12, borderWidth: 1 },
  jobIcon: { width: 32, height: 32 },
  jobLevel: { fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  plugin: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: Spacing.three },
  pluginHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pluginIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: Spacing.two, marginTop: Spacing.two },
});
