import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  InfoRow,
  Loading,
  ProgressBar,
  Screen,
  Section,
  Segmented,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getCollections, profileUrl } from '@/api/ffxivcollect';
import { ROLE_LABELS, ROLE_ORDER } from '@/data/jobs';
import { useTheme } from '@/hooks/use-theme';
import {
  getCharacter,
  getClassJobs,
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

  const refreshing = profile.isRefetching || jobs.isRefetching || collections.isRefetching;
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
          <Header profile={profile.data} />
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
          {tab === 'gear' ? <GearTab gear={profile.data.gear} /> : null}
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

function Header({ profile }: { profile: CharacterProfile }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Image
        source={profile.portrait ?? profile.avatar ?? undefined}
        style={[styles.portrait, { backgroundColor: theme.backgroundElement }]}
        contentFit="cover"
        contentPosition="top"
        accessibilityLabel={`Portrait de ${profile.name}`}
      />
      <View style={styles.headerText}>
        {profile.title ? (
          <ThemedText type="small" themeColor="textSecondary">
            {profile.title}
          </ThemedText>
        ) : null}
        <ThemedText type="subtitle">{profile.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[profile.world, profile.dataCenter].filter(Boolean).join(' · ')}
        </ThemedText>
        {profile.freeCompany ? <ThemedText type="small">« {profile.freeCompany.name} »</ThemedText> : null}
      </View>
    </View>
  );
}

function ProfileTab({ profile }: { profile: CharacterProfile }) {
  const rows: [string, string | null][] = [
    ['Race', [profile.race, profile.tribe].filter(Boolean).join(' · ') || null],
    ['Sexe', profile.gender],
    ['Anniversaire', profile.nameday],
    ['Divinité', profile.guardian],
    ['Cité de départ', profile.cityState],
    ['Grande Compagnie', profile.grandCompany ? [profile.grandCompany.name, profile.grandCompany.rank].filter(Boolean).join(' · ') : null],
    ['Compagnie libre', profile.freeCompany?.name ?? null],
    ['Niveau du job actif', profile.activeJobLevel ? String(profile.activeJobLevel) : null],
  ];
  return (
    <>
      <Card>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <InfoRow key={label} label={label} value={value!} />
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
  const theme = useTheme();
  const unlocked = jobs.filter((j) => j.level !== null);
  if (jobs.length === 0) return <Empty>Aucun job trouvé.</Empty>;
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {unlocked.length} jobs débloqués sur {jobs.length}
      </ThemedText>
      {ROLE_ORDER.map((role) => {
        const list = jobs.filter((j) => j.job.role === role);
        if (list.length === 0) return null;
        return (
          <Section key={role} title={ROLE_LABELS[role]}>
            <Card>
              {list.map(({ job, level, exp, maxExp }) => (
                <View key={job.key} style={styles.jobRow} accessible accessibilityLabel={`${job.name}, ${level ? `niveau ${level}` : 'non débloqué'}`}>
                  <View style={styles.jobLine}>
                    <ThemedText type="small" style={{ opacity: level ? 1 : 0.5 }}>
                      {job.name}
                    </ThemedText>
                    <ThemedText type="smallBold" style={{ color: level ? theme.text : theme.textSecondary }}>
                      {level ?? '—'}
                    </ThemedText>
                  </View>
                  {level && exp !== null && maxExp ? <ProgressBar value={exp / maxExp} /> : null}
                </View>
              ))}
            </Card>
          </Section>
        );
      })}
    </>
  );
}

function GearTab({ gear }: { gear: GearPiece[] }) {
  if (gear.length === 0) return <Empty>Équipement introuvable sur le Lodestone.</Empty>;
  const levels = gear.filter((g) => g.slot !== 'SOULCRYSTAL' && g.itemLevel).map((g) => g.itemLevel!);
  const average = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : null;
  return (
    <>
      {average ? (
        <ThemedText type="small" themeColor="textSecondary">
          Niveau d’objet moyen (approximatif) : {average}
        </ThemedText>
      ) : null}
      {gear.map((piece) => (
        <Card key={piece.slot}>
          <View style={styles.jobLine}>
            <ThemedText type="small" themeColor="textSecondary">
              {piece.slotLabel}
            </ThemedText>
            {piece.itemLevel ? <ThemedText type="smallBold">niv. obj. {piece.itemLevel}</ThemedText> : null}
          </View>
          <ThemedText>{piece.name}</ThemedText>
          {piece.glamour ? <InfoRow label="Apparence" value={piece.glamour} /> : null}
          {piece.dye ? <InfoRow label="Teinture" value={piece.dye} /> : null}
          {piece.materia.length ? <InfoRow label="Matérias" value={piece.materia.join(', ')} /> : null}
          {piece.creator ? <InfoRow label="Fabriqué par" value={piece.creator} /> : null}
        </Card>
      ))}
    </>
  );
}

function CollectionsTab({ id, data }: { id: number; data: Awaited<ReturnType<typeof getCollections>> }) {
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
      <Card>
        {data.collections.map((c) => (
          <View key={c.key} style={styles.jobRow}>
            <View style={styles.jobLine}>
              <ThemedText type="small">{c.label}</ThemedText>
              <ThemedText type="smallBold">
                {!c.isPublic
                  ? 'Privé'
                  : c.count === 0
                    ? 'Non renseigné'
                    : `${formatNumber(c.count)} / ${formatNumber(c.total)} (${percent(c.count, c.total)} %)`}
              </ThemedText>
            </View>
            {c.isPublic && c.count > 0 ? <ProgressBar value={c.total ? c.count / c.total : 0} /> : null}
          </View>
        ))}
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
  header: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  portrait: { width: 96, height: 128, borderRadius: 12 },
  headerText: { flex: 1, gap: Spacing.half },
  jobRow: { gap: Spacing.one, paddingVertical: Spacing.one },
  jobLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
