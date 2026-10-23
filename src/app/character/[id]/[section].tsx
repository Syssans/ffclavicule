/** Une partie de la fiche d'un personnage : profil, jobs, équipement ou collections. */
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from 'react-native';

import type { CharacterSection } from '@/components/character/character-view';
import { CollectionsOverview, CollectionsUnlinked, GearSection, JobsSection, ProfileSection } from '@/components/character/parts';
import { ErrorBox, Loading, Screen } from '@/components/ui';
import { useLodestoneCollection } from '@/hooks/use-lodestone-collection';
import { usePrivate } from '@/hooks/use-private';
import { getCharacter, getClassJobs, getGear } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';

const TITLES: Record<CharacterSection, string> = {
  profil: 'Profil',
  jobs: 'Jobs',
  equipement: 'Équipement',
  collections: 'Collections',
};

export default function CharacterSectionScreen() {
  const params = useLocalSearchParams<{ id: string; section: CharacterSection }>();
  const id = Number(params.id);
  const section = params.section;
  const region = useAppStore((s) => s.region);

  const profile = useQuery({
    queryKey: ['lodestone', 'character', region, id],
    queryFn: () => getCharacter(region, id),
    enabled: Number.isFinite(id),
  });
  const jobs = useQuery({
    queryKey: ['lodestone', 'classjob', region, id],
    queryFn: () => getClassJobs(region, id),
    enabled: Number.isFinite(id) && section === 'jobs',
  });
  const gear = useQuery({
    queryKey: ['lodestone', 'gear', region, id, profile.dataUpdatedAt],
    queryFn: () => getGear(region, profile.data!),
    enabled: profile.data !== undefined && section === 'equipement',
  });
  const { link, query: collections } = usePrivate(id, section === 'collections');
  // Sans le plugin, les collections viennent du Lodestone (mêmes requêtes que l'écran).
  const fromLodestone = section === 'collections' && !link;
  const mounts = useLodestoneCollection(id, 'mount', fromLodestone);
  const minions = useLodestoneCollection(id, 'minion', fromLodestone);

  const current = section === 'jobs' ? jobs : section === 'equipement' ? gear : section === 'collections' ? collections : profile;
  const refreshing = fromLodestone ? mounts.isRefetching || minions.isRefetching : current.isRefetching;
  const refresh = () => {
    if (fromLodestone) {
      mounts.refetch();
      minions.refetch();
    } else current.refetch();
  };
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack.Screen options={{ title: TITLES[section] ?? '' }} />
      {profile.error ? <ErrorBox error={profile.error} onRetry={() => profile.refetch()} /> : null}
      {section === 'profil' ? profile.data ? <ProfileSection profile={profile.data} /> : <Loading label="Lecture du Lodestone…" /> : null}
      {section === 'jobs' ? (
        jobs.isPending ? <Loading /> : jobs.error ? <ErrorBox error={jobs.error} onRetry={() => jobs.refetch()} /> : <JobsSection jobs={jobs.data ?? []} />
      ) : null}
      {section === 'equipement' ? (
        gear.isPending ? (
          <Loading label="Lecture de l’équipement…" />
        ) : gear.error ? (
          <ErrorBox error={gear.error} onRetry={() => gear.refetch()} />
        ) : (
          <GearSection gear={gear.data ?? []} />
        )
      ) : null}
      {section === 'collections' ? (
        !link ? (
          <CollectionsUnlinked id={id} name={profile.data?.name ?? ''} />
        ) : collections.isPending ? (
          <Loading label="Lecture de tes collections…" />
        ) : collections.error ? (
          <ErrorBox error={collections.error} onRetry={() => collections.refetch()} />
        ) : (
          <CollectionsOverview id={id} data={collections.data ?? null} />
        )
      ) : null}
    </Screen>
  );
}
