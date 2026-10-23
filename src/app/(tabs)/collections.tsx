/** Onglet Collections : progression du personnage principal, relevée en jeu par le plugin. */
import { CollectionsOverview, CollectionsUnlinked } from '@/components/character/parts';
import { useMainCharacter, Welcome } from '@/components/home';
import { ErrorBox, Loading, Screen } from '@/components/ui';
import { usePrivate } from '@/hooks/use-private';

export default function CollectionsScreen() {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  return (
    <Screen title="Collections" tab>
      {!main ? (
        <Welcome />
      ) : !link ? (
        <CollectionsUnlinked id={main.id} name={main.name} />
      ) : query.isPending ? (
        <Loading label="Lecture de tes collections…" />
      ) : query.error ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <CollectionsOverview id={main.id} data={query.data ?? null} />
      )}
    </Screen>
  );
}
