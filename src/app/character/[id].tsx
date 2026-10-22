import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { getCollections, isBrowsable, profileUrl } from '@/api/ffxivcollect';
import { getModelInfo, isSyncAvailable } from '@/api/sync';
import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  GameIcon,
  Loading,
  ProgressBar,
  Screen,
  Section,
  Segmented,
  StatTile,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { jobIconId, ROLE_LABELS, ROLE_ORDER } from '@/data/jobs';
import { useTheme } from '@/hooks/use-theme';
import {
  getCharacter,
  getClassJobs,
  getGear,
  lodestoneProfileUrl,
  type CharacterProfile,
  type GearPiece,
  type JobLevel,
} from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { formatNumber, percent } from '@/utils/format';

type Tab = 'profile' | 'jobs' | 'gear' | 'collections';

const TABS: { value: Tab; label: string }[] = [
  { value: 'profile', label: 'Profil' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'gear', label: 'Équip.' },
  { value: 'collections', label: 'Collec.' },
];

export default function CharacterScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const region = useAppStore((s) => s.region);
  const [tab, setTab] = useState<Tab>('profile');

  const profile = useQuery({
    queryKey: ['lodestone', 'character', region, id],
    queryFn: () => getCharacter(region, id),
    enabled: Number.isFinite(id),
  });
  const jobs = useQuery({
    queryKey: ['lodestone', 'classjob', region, id],
    queryFn: () => getClassJobs(region, id),
    enabled: Number.isFinite(id) && tab === 'jobs',
  });
  const collections = useQuery({
    queryKey: ['ffxivcollect', id],
    queryFn: () => getCollections(id),
    enabled: Number.isFinite(id) && tab === 'collections',
  });
  const gear = useQuery({
    queryKey: ['lodestone', 'gear', region, id, profile.dataUpdatedAt],
    queryFn: () => getGear(region, profile.data!),
    enabled: profile.data !== undefined && tab === 'gear',
  });

  const refreshing = profile.isRefetching || jobs.isRefetching || collections.isRefetching || gear.isRefetching;
  const refresh = () => {
    profile.refetch();
    if (tab === 'jobs') jobs.refetch();
    if (tab === 'collections') collections.refetch();
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack.Screen options={{ title: profile.data?.name ?? '' }} />
      {profile.isPending ? <Loading label="Lecture du Lodestone…" /> : null}
      {profile.error ? <ErrorBox error={profile.error} onRetry={() => profile.refetch()} /> : null}
      {profile.data ? (
        <>
          <Hero profile={profile.data} />
          <Segmented options={TABS} value={tab} onChange={setTab} />
          {tab === 'profile' ? <ProfileTab profile={profile.data} /> : null}
          {tab === 'jobs' ? (
            jobs.isPending ? (
              <Loading />
            ) : jobs.error ? (
              <ErrorBox error={jobs.error} onRetry={() => jobs.refetch()} />
            ) : (
              <JobsTab jobs={jobs.data ?? []} />
            )
          ) : null}
          {tab === 'gear' ? (
            gear.isPending ? (
              <Loading label="Lecture de l’équipement…" />
            ) : gear.error ? (
              <ErrorBox error={gear.error} onRetry={() => gear.refetch()} />
            ) : (
              <GearTab gear={gear.data ?? []} />
            )
          ) : null}
          {tab === 'collections' ? (
            collections.isPending ? (
              <Loading label="Lecture de FFXIV Collect…" />
            ) : collections.error ? (
              <ErrorBox error={collections.error} onRetry={() => collections.refetch()} />
            ) : (
              <CollectionsTab id={id} data={collections.data ?? null} />
            )
          ) : null}
          <FollowActions profile={profile.data} />
        </>
      ) : null}
    </Screen>
  );
}

/** Grand portrait du Lodestone, avec le nom et le job actif par-dessus ; bouton 3D si un modèle existe. */
function Hero({ profile }: { profile: CharacterProfile }) {
  const image = profile.portrait ?? profile.avatar;
  const info = useQuery({
    queryKey: ['sync', 'info', profile.id],
    queryFn: () => getModelInfo(profile.id),
    enabled: isSyncAvailable(),
    retry: false,
  });

  return (
    <View style={styles.hero}>
      {image ? (
        <Image
          source={image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={200}
          accessibilityLabel={`Portrait de ${profile.name}`}
        />
      ) : null}
      <LinearGradient colors={['transparent', 'rgba(5,8,15,0.92)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.heroText} pointerEvents="none">
        {profile.title ? (
          <ThemedText type="smallBold" style={styles.heroTitle}>
            « {profile.title} »
          </ThemedText>
        ) : null}
        <ThemedText type="title" style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit>
          {profile.name}
        </ThemedText>
        <ThemedText type="small" style={styles.heroMuted}>
          {[profile.world, profile.dataCenter].filter(Boolean).join(' · ')}
          {profile.freeCompany ? `  ·  ${profile.freeCompany.name}` : ''}
        </ThemedText>
        {profile.activeJobLevel ? (
          <View style={styles.heroJob}>
            {profile.activeJobIcon ? <Image source={profile.activeJobIcon} style={styles.heroJobIcon} contentFit="contain" /> : null}
            <ThemedText type="smallBold" style={styles.heroName}>
              Niveau {profile.activeJobLevel}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {info.data ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voir le modèle 3D"
          onPress={() => router.push({ pathname: '/model/[id]', params: { id: String(profile.id), name: profile.name } })}
          style={({ pressed }) => [styles.hero3dToggle, pressed && { opacity: 0.8 }]}>
          <ThemedText type="smallBold" style={styles.hero3dToggleText}>
            Voir en 3D
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function IconRow({ icon, label, value }: { icon?: string | null; label: string; value: string }) {
  return (
    <View style={styles.iconRow}>
      {icon !== undefined ? <GameIcon uri={icon} size={28} /> : null}
      <View style={{ flex: 1 }}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="small">{value}</ThemedText>
      </View>
    </View>
  );
}

function ProfileTab({ profile }: { profile: CharacterProfile }) {
  const rows: { label: string; value: string | null; icon?: string | null }[] = [
    { label: 'Race', value: [profile.race, profile.tribe].filter(Boolean).join(' · ') || null },
    { label: 'Sexe', value: profile.gender },
    { label: 'Anniversaire', value: profile.nameday },
    { label: 'Divinité', value: profile.guardian, icon: profile.guardianIcon },
    { label: 'Cité de départ', value: profile.cityState, icon: profile.cityStateIcon },
    {
      label: 'Grande Compagnie',
      value: profile.grandCompany ? [profile.grandCompany.name, profile.grandCompany.rank].filter(Boolean).join(' · ') : null,
    },
    { label: 'Compagnie libre', value: profile.freeCompany?.name ?? null },
  ];
  return (
    <>
      <Card>
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <IconRow key={r.label} label={r.label} value={r.value!} icon={r.icon} />
          ))}
      </Card>
      {profile.bio ? (
        <Section title="Présentation">
          <Card>
            <ThemedText type="small">{profile.bio}</ThemedText>
          </Card>
        </Section>
      ) : null}
      <Empty>Les infos de la fiche sont en anglais : c’est la langue des pages du Lodestone que l’appli lit.</Empty>
    </>
  );
}

function JobsTab({ jobs }: { jobs: JobLevel[] }) {
  if (jobs.length === 0) return <Empty>Aucun job trouvé.</Empty>;
  const unlocked = jobs.filter((j) => j.level !== null);
  const maxed = unlocked.filter((j) => j.level === 100).length;
  return (
    <>
      <View style={styles.stats}>
        <StatTile label="Jobs débloqués" value={`${unlocked.length} / ${jobs.length}`} />
        <StatTile label="Niveau 100" value={String(maxed)} />
      </View>
      {ROLE_ORDER.map((role) => {
        const list = jobs.filter((j) => j.job.role === role);
        if (list.length === 0) return null;
        return (
          <Section key={role} title={ROLE_LABELS[role]}>
            <View style={styles.grid}>
              {list.map((j) => (
                <JobTile key={j.job.key} job={j} />
              ))}
            </View>
          </Section>
        );
      })}
    </>
  );
}

function JobTile({ job: { job, level, exp, maxExp } }: { job: JobLevel }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.jobTile, { backgroundColor: theme.backgroundElement }]}
      accessible
      accessibilityLabel={`${job.name}, ${level ? `niveau ${level}` : 'non débloqué'}`}>
      <View style={styles.jobTop}>
        <GameIcon uri={gameIconUrl(jobIconId(job))} size={36} dimmed={!level} />
        <ThemedText type="subtitle" style={{ color: level ? theme.text : theme.textSecondary }}>
          {level ?? '—'}
        </ThemedText>
      </View>
      <ThemedText type="small" numberOfLines={1} style={{ opacity: level ? 1 : 0.55 }}>
        {job.name}
      </ThemedText>
      <ProgressBar value={level === 100 ? 1 : level && exp !== null && maxExp ? exp / maxExp : 0} />
    </View>
  );
}

function GearTab({ gear }: { gear: GearPiece[] }) {
  const theme = useTheme();
  if (gear.length === 0) return <Empty>Équipement introuvable sur le Lodestone.</Empty>;
  const levels = gear.filter((g) => g.slot !== 'SOULCRYSTAL' && g.itemLevel).map((g) => g.itemLevel!);
  const average = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null;
  return (
    <>
      <View style={styles.stats}>
        <StatTile label="Niveau d’objet" value={average ? String(average) : '—'} />
        <StatTile label="Pièces HQ" value={`${gear.filter((g) => g.hq).length} / ${gear.length}`} />
      </View>
      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {gear.map((piece, i) => (
          <View
            key={piece.slot}
            style={[styles.gearRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
            <GameIcon uri={piece.icon} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="small" themeColor="textSecondary">
                {piece.slotLabel}
              </ThemedText>
              <ThemedText numberOfLines={2}>{piece.name}</ThemedText>
              {piece.glamour ? <ThemedText type="small" themeColor="textSecondary">Apparence : {piece.glamour}</ThemedText> : null}
              {piece.dye ? <ThemedText type="small" themeColor="textSecondary">Teinture : {piece.dye}</ThemedText> : null}
              {piece.materia.length ? (
                <ThemedText type="small" themeColor="textSecondary">Matérias : {piece.materia.join(', ')}</ThemedText>
              ) : null}
              {piece.creator ? <ThemedText type="small" themeColor="textSecondary">Fabriqué par {piece.creator}</ThemedText> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {piece.itemLevel ? <Badge label={String(piece.itemLevel)} tone="accent" /> : null}
              {piece.hq ? <Badge label="HQ" /> : null}
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

function CollectionsTab({ id, data }: { id: number; data: Awaited<ReturnType<typeof getCollections>> }) {
  const theme = useTheme();
  if (!data) {
    return (
      <Card>
        <ThemedText type="small">
          Ce personnage n’est pas encore connu de FFXIV Collect. Ouvre sa page une fois pour l’importer, puis reviens ici.
        </ThemedText>
        <Button label="Ouvrir FFXIV Collect" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(profileUrl(id))} />
      </Card>
    );
  }
  return (
    <>
      <Card style={{ gap: 0, paddingVertical: Spacing.one }}>
        {data.collections.map((c, i) => {
          const tracked = c.isPublic && c.count > 0;
          const browsable = tracked && isBrowsable(c.key);
          return (
            <Pressable
              key={c.key}
              disabled={!browsable}
              accessibilityRole={browsable ? 'button' : undefined}
              onPress={() => router.push({ pathname: '/collection/[characterId]/[key]', params: { characterId: String(id), key: c.key, label: c.label } })}
              style={({ pressed }) => [
                styles.collectionRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}>
              <View style={styles.jobTop}>
                <ThemedText type="small">{c.label}</ThemedText>
                <ThemedText type="smallBold" themeColor={tracked ? 'text' : 'textSecondary'}>
                  {!c.isPublic
                    ? 'Privé'
                    : c.count === 0
                      ? 'Non renseigné'
                      : `${formatNumber(c.count)} / ${formatNumber(c.total)} · ${percent(c.count, c.total)} %${browsable ? '  ›' : ''}`}
                </ThemedText>
              </View>
              {tracked ? <ProgressBar value={c.total ? c.count / c.total : 0} /> : null}
            </Pressable>
          );
        })}
      </Card>
      <Empty>
        « Non renseigné » : collection que le Lodestone ne publie pas, à cocher soi-même sur FFXIV Collect.{'\n'}
        Source : FFXIV Collect{data.lastParsed ? `, mis à jour le ${new Date(data.lastParsed).toLocaleDateString('fr-FR')}` : ''}.
      </Empty>
    </>
  );
}

function FollowActions({ profile }: { profile: CharacterProfile }) {
  const region = useAppStore((s) => s.region);
  const saved = useAppStore((s) => s.characters.some((c) => c.id === profile.id));
  const isMain = useAppStore((s) => s.mainCharacterId === profile.id);
  const saveCharacter = useAppStore((s) => s.saveCharacter);
  const removeCharacter = useAppStore((s) => s.removeCharacter);
  const setMainCharacter = useAppStore((s) => s.setMainCharacter);

  return (
    <View style={{ gap: Spacing.two }}>
      {saved ? (
        <>
          {!isMain ? <Button label="Définir comme personnage principal" variant="secondary" onPress={() => setMainCharacter(profile.id)} /> : null}
          <Button
            label="Ne plus suivre"
            variant="danger"
            onPress={() => {
              removeCharacter(profile.id);
              if (router.canGoBack()) router.back();
            }}
          />
        </>
      ) : (
        <Button
          label="Suivre ce personnage"
          onPress={() =>
            saveCharacter({
              id: profile.id,
              name: profile.name,
              world: profile.world,
              dataCenter: profile.dataCenter,
              avatar: profile.avatar,
            })
          }
        />
      )}
      <Button
        label="Voir sur le Lodestone"
        variant="secondary"
        onPress={() => WebBrowser.openBrowserAsync(lodestoneProfileUrl(region, profile.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fond sombre fixe : le texte est blanc sur le portrait, quel que soit le thème.
  hero: { height: 380, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#151B2B' },
  hero3dToggle: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    minHeight: 36,
    minWidth: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8C987',
  },
  hero3dToggleText: { color: '#151B2B' },
  heroText: { padding: Spacing.three, gap: Spacing.half },
  heroTitle: { color: '#E8C987' },
  heroName: { color: '#FFFFFF' },
  heroMuted: { color: 'rgba(255,255,255,0.78)' },
  heroJob: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  heroJobIcon: { width: 24, height: 24 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  stats: { flexDirection: 'row', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  jobTile: { flexBasis: '31%', flexGrow: 1, maxWidth: '32.5%', borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  gearRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  collectionRow: { gap: Spacing.one, paddingVertical: Spacing.two },
});
