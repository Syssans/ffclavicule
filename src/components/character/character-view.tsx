/** Fiche d'un personnage : portrait, puis un menu à tuiles vers chaque partie (comme le menu Personnage du jeu). */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { FollowActions, Hero } from '@/components/character/parts';
import { MenuGrid, MenuTile } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorBox, Loading, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useLodestoneCollection } from '@/hooks/use-lodestone-collection';
import { usePrivate } from '@/hooks/use-private';
import { PrivateIcons } from '@/components/private/shared';
import { disconnect } from '@/api/private';
import { getCharacter } from '@/lodestone/client';
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
  const pluginHint = linked ? null : 'Avec le plugin';

  return (
    <>
      <Hero profile={p} />

      <Section title="Personnage">
        <MenuGrid>
          <MenuTile icon={MenuIcons.personnage} title="Profil" subtitle={[p.race, p.cityState].filter(Boolean).join(' · ') || 'Race, divinité, compagnie'} onPress={() => openSection(id, 'profil')} />
          <MenuTile
            icon={MenuIcons.actions}
            title="Jobs"
            subtitle={p.activeJobLevel ? `Job actuel niveau ${p.activeJobLevel}` : 'Niveaux de chaque job'}
            onPress={() => openSection(id, 'jobs')}
          />
          <MenuTile icon={MenuIcons.arsenal} title="Équipement" subtitle="Ce qu’il porte, matérias, teintures" onPress={() => openSection(id, 'equipement')} />
          <MenuTile
            icon={MenuIcons.hautsFaits}
            title="Collections"
            subtitle={
              summary?.collectionsTotal
                ? `${formatNumber(summary.collectionsOwned)} éléments obtenus`
                : !linked && mounts.data && minions.data && !mounts.data.hidden
                  ? `${mounts.data.owned} montures · ${minions.data.owned} mascottes`
                  : 'Montures, mascottes, hauts faits…'
            }
            onPress={() => openSection(id, 'collections')}
          />
        </MenuGrid>
      </Section>

      <Section title="Possessions">
        <MenuGrid>
          <MenuTile
            icon={MenuIcons.inventaire}
            title="Inventaire"
            subtitle={query.data ? formatGil(query.data.gil) : 'Sacs, arsenal, sacoches'}
            badge={pluginHint}
            disabled={!linked}
            onPress={() => openPrivate(id, 'inventory')}
          />
          <MenuTile
            icon={PrivateIcons.retainers}
            title="Servants"
            subtitle={
              summary
                ? summary.venturesDone > 0
                  ? `${summary.venturesDone} mission(s) terminée(s)`
                  : `${summary.retainers} servant(s) · ${summary.listings} en vente`
                : 'Inventaire, ventes, missions'
            }
            badge={summary?.venturesDone ? String(summary.venturesDone) : pluginHint}
            disabled={!linked}
            onPress={() => openPrivate(id, 'retainers')}
          />
          <MenuTile
            icon={PrivateIcons.mailbox}
            title="Courrier"
            subtitle={summary ? (summary.unreadLetters ? `${summary.unreadLetters} non lu(s)` : 'Rien de nouveau') : 'Lettres et pièces jointes'}
            badge={summary?.unreadLetters ? String(summary.unreadLetters) : pluginHint}
            disabled={!linked}
            onPress={() => openPrivate(id, 'mail')}
          />
        </MenuGrid>
      </Section>

      <Section title="Interface du jeu">
        <MenuGrid>
          <MenuTile
            icon={MenuIcons.ath}
            title="ATH"
            subtitle="Déplacer, redimensionner, masquer"
            badge={pluginHint}
            disabled={!linked}
            onPress={() => router.push({ pathname: '/hud/[id]', params: { id: String(id) } })}
          />
          <MenuTile
            icon={MenuIcons.barres}
            title="Barres d’actions"
            subtitle="Réorganiser par job"
            badge={pluginHint}
            disabled={!linked}
            onPress={() => router.push({ pathname: '/hotbars/[id]', params: { id: String(id) } })}
          />
        </MenuGrid>
      </Section>

      {!linked ? (
        <Card>
          <ThemedText type="smallBold">Connecter le plugin</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Avec le plugin Dalamud Clavicule sur ton PC, ce téléphone voit ton inventaire, tes servants, ton courrier et tes collections, et
            peut modifier ton ATH. Dans le jeu : /clavicule, « Connecter un téléphone ».
          </ThemedText>
          <Button label="Saisir le code du plugin" onPress={() => router.push({ pathname: '/connect', params: { id: String(id), name: p.name } })} />
        </Card>
      ) : null}

      <View style={{ gap: Spacing.two }}>
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
