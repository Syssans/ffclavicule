/** Éléments de l'accueil : horloges, fiche du personnage principal et tableau des réinitialisations. */
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { openSection } from '@/components/character/character-view';
import { Hero } from '@/components/character/parts';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ErrorBox, GameIcon, Loading, ProgressBar } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { jobIconId } from '@/data/jobs';
import { useTheme } from '@/hooks/use-theme';
import { getCharacter, getClassJobs } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { cycleProgress, formatCountdown, formatEorzeaTime, upcomingResets } from '@/utils/timers';

const clock = (at: number, utc = false) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(utc ? { timeZone: 'UTC' } : {}) });

/** Heure d'Éorzéa en grand, heures locale et du serveur (les réinitialisations suivent l'heure UTC). */
export function Clocks({ now }: { now: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.clock, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      <MenuIcon id={MenuIcons.calendrier} size={44} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          Heure d’Éorzéa
        </ThemedText>
        <ThemedText type="display" style={[styles.clockTime, { color: theme.ornament }]}>
          {formatEorzeaTime(now)}
        </ThemedText>
      </View>
      <View style={styles.side}>
        <ThemedText type="small" themeColor="textSecondary">
          Locale <ThemedText type="smallBold">{clock(now)}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Serveur <ThemedText type="smallBold">{clock(now, true)}</ThemedText>
        </ThemedText>
      </View>
    </View>
  );
}

/** Fiche du personnage principal : portrait du Lodestone, infos clés et jobs les plus avancés. */
export function MainCharacterSheet({ id }: { id: number }) {
  const theme = useTheme();
  const region = useAppStore((s) => s.region);
  const profile = useQuery({ queryKey: ['lodestone', 'character', region, id], queryFn: () => getCharacter(region, id) });
  const jobs = useQuery({ queryKey: ['lodestone', 'classjob', region, id], queryFn: () => getClassJobs(region, id) });

  if (profile.isPending) return <Loading label="Lecture du Lodestone…" />;
  if (profile.error) return <ErrorBox error={profile.error} onRetry={() => profile.refetch()} />;
  const p = profile.data;
  const unlocked = (jobs.data ?? []).filter((j) => j.level !== null).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  const maxed = unlocked.filter((j) => j.level === 100).length;
  const facts = [
    { icon: p.cityStateIcon, label: 'Cité', value: p.cityState },
    { icon: p.guardianIcon, label: 'Divinité', value: p.guardian },
    { icon: gameIconUrl(GameIcons.grandCompany), label: 'Grande Compagnie', value: p.grandCompany ? [p.grandCompany.name, p.grandCompany.rank].filter(Boolean).join(' · ') : null },
    { icon: gameIconUrl(8), label: 'Compagnie libre', value: p.freeCompany?.name ?? null },
  ].filter((f) => f.value);

  return (
    <>
      <Hero profile={p} height={320} />
      {facts.length > 0 ? (
        <GameWindow
          icon={MenuIcons.personnage}
          title="Fiche"
          subtitle={[p.race, p.tribe].filter(Boolean).join(' · ') || null}
          right={<Chip label="Complète" onPress={() => router.navigate('/personnage')} />}>
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <GameIcon uri={f.icon} size={28} />
                <View style={styles.flex}>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {f.label}
                  </ThemedText>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {f.value}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </GameWindow>
      ) : null}
      {unlocked.length > 0 ? (
        <GameWindow
          icon={MenuIcons.actions}
          title="Jobs"
          subtitle={`${unlocked.length} débloqués${maxed ? ` · ${maxed} au niveau 100` : ''}`}
          right={<Chip label="Tous" onPress={() => openSection(id, 'jobs')} />}>
          <View style={styles.jobs}>
            {unlocked.slice(0, 10).map((j) => (
              <View key={j.job.key} style={styles.job} accessible accessibilityLabel={`${j.job.name}, niveau ${j.level}`}>
                <Image source={gameIconUrl(jobIconId(j.job))} style={styles.jobIcon} contentFit="contain" />
                <ThemedText type="smallBold" style={{ color: j.level === 100 ? theme.ornament : theme.text }}>
                  {j.level}
                </ThemedText>
              </View>
            ))}
          </View>
        </GameWindow>
      ) : null}
    </>
  );
}

/** Réinitialisations et rendez-vous du jeu : icône, compte à rebours et avancée du cycle. */
export function ResetBoard({ now }: { now: number }) {
  const theme = useTheme();
  const region = useAppStore((s) => s.region);
  return (
    <GameWindow icon={GameIcons.calendar} title="Réinitialisations" subtitle="À l’heure du serveur">
      {upcomingResets(now, region).map((r, i) => (
        <View
          key={r.key}
          style={[styles.reset, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          accessible
          accessibilityLabel={`${r.label} : ${r.live ? `${r.live}, encore ${formatCountdown(r.at - now)}` : `dans ${formatCountdown(r.at - now)}`}`}>
          <MenuIcon id={r.icon} size={40} />
          <View style={styles.flex}>
            <View style={styles.resetHead}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                {r.label}
              </ThemedText>
              <ThemedText type="smallBold" style={[styles.countdown, { color: r.live ? theme.accent : theme.ornament }]}>
                {formatCountdown(r.at - now)}
              </ThemedText>
            </View>
            <ThemedText type="small" numberOfLines={1} style={[styles.resetDetail, { color: r.live ? theme.accent : theme.textSecondary }]}>
              {r.live ?? r.detail}
            </ThemedText>
            <ProgressBar value={cycleProgress(r, now)} />
          </View>
        </View>
      ))}
      <Button label="Me prévenir" variant="secondary" onPress={() => router.push('/notifications/jeu')} />
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: 1 },
  clockTime: { fontSize: 30, lineHeight: 36 },
  side: { alignItems: 'flex-end', gap: Spacing.half },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexBasis: '50%', paddingRight: Spacing.two },
  jobs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  job: { alignItems: 'center', width: 52, gap: 2 },
  jobIcon: { width: 36, height: 36 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  resetHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  resetDetail: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  countdown: { fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
});
