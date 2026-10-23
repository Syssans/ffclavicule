/** Briques de la fiche d'un personnage : portrait, profil, jobs, équipement, collections, suivi. */
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PrivateSnapshot } from '@/api/private';
import { getModelInfo, isSyncAvailable } from '@/api/sync';
import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { MenuIcon, ProgressRing } from '@/components/game-ui';
import { Badge, Button, Card, Empty, GameIcon, ProgressBar, Section, StatTile } from '@/components/ui';
import { CollectionIcons, MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { jobIconId, ROLE_LABELS, ROLE_ORDER } from '@/data/jobs';
import { useCatalog } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { lodestoneProfileUrl, type CharacterProfile, type GearPiece, type JobLevel } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { usableItems } from '@/utils/collections';
import { formatAgo, formatNumber } from '@/utils/format';

/** Grand portrait du Lodestone, avec le nom et le job actif par-dessus ; bouton 3D si un modèle existe. */
export function Hero({ profile }: { profile: CharacterProfile }) {
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

export function ProfileSection({ profile }: { profile: CharacterProfile }) {
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

export function JobsSection({ jobs }: { jobs: JobLevel[] }) {
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

export function GearSection({ gear }: { gear: GearPiece[] }) {
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

/** Les collections viennent du plugin : il faut que ce téléphone soit connecté au personnage. */
export function CollectionsUnlinked({ id, name }: { id: number; name: string }) {
  return (
    <Card>
      <ThemedText type="small">
        Les collections (montures, mascottes, hauts faits…) sont relevées en jeu par le plugin Clavicule : elles sont toujours à jour, mais
        seulement pour tes personnages.
      </ThemedText>
      <Button label="Connecter ce personnage" variant="secondary" onPress={() => router.push({ pathname: '/connect', params: { id: String(id), name } })} />
    </Card>
  );
}

export function CollectionsOverview({ id, data }: { id: number; data: PrivateSnapshot | null }) {
  const theme = useTheme();
  const catalog = useCatalog(id);
  if (!data?.collections) {
    return (
      <Card>
        <ThemedText type="small">Le plugin n’a pas encore envoyé tes collections.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Mets à jour le plugin et connecte-toi en jeu : l’envoi se fait dans la minute.
        </ThemedText>
      </Card>
    );
  }
  const achievements = data.achievements;
  const usable = usableItems(catalog.data, data);
  const rows = [
    ...(achievements
      ? [{ key: 'achievements', label: 'Hauts faits', count: achievements.count, total: achievements.total, browsable: false }]
      : []),
    ...data.collections.map((c) => ({ key: c.key, label: c.label, count: c.owned.length, total: c.total, browsable: c.owned.length > 0 })),
  ];
  return (
    <>
      {usable.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">
            {usable.length === 1 ? '1 objet de collection à utiliser' : `${usable.length} objets de collection à utiliser`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Tu les as déjà, mais ils ne sont pas encore dans ta collection.
          </ThemedText>
          {usable.slice(0, 5).map((u) => (
            <Pressable
              key={`${u.key}-${u.entry.id}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/collection/[characterId]/[key]', params: { characterId: String(id), key: u.key, label: u.label, filter: 'inventory' } })
              }
              style={({ pressed }) => [styles.usableRow, pressed && { opacity: 0.7 }]}>
              <GameIcon uri={u.entry.icon ? gameIconUrl(u.entry.icon) : null} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="small" numberOfLines={1}>
                  {u.entry.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {u.label} · {u.places.join(', ')}
                </ThemedText>
              </View>
            </Pressable>
          ))}
          {usable.length > 5 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Et {usable.length - 5} autre(s).
            </ThemedText>
          ) : null}
        </Card>
      ) : null}
      {achievements ? (
        <View style={styles.stats}>
          <StatTile
            label="Points de hauts faits"
            value={formatNumber(achievements.points)}
            detail={
              <ThemedText type="small" themeColor="textSecondary">
                sur {formatNumber(achievements.pointsTotal)}
              </ThemedText>
            }
          />
        </View>
      ) : null}
      <View style={styles.collectionGrid}>
        {rows.map((c) => (
          <Pressable
            key={c.key}
            disabled={!c.browsable}
            accessibilityRole={c.browsable ? 'button' : undefined}
            accessibilityLabel={`${c.label} : ${c.count} sur ${c.total}`}
            onPress={() => router.push({ pathname: '/collection/[characterId]/[key]', params: { characterId: String(id), key: c.key, label: c.label } })}
            style={({ pressed }) => [
              styles.collectionTile,
              { backgroundColor: theme.backgroundElement, borderColor: theme.frame },
              pressed && { opacity: 0.75 },
            ]}>
            <ProgressRing value={c.total ? c.count / c.total : 0} size={64} stroke={4}>
              <MenuIcon id={CollectionIcons[c.key] ?? MenuIcons.hautsFaits} size={40} />
            </ProgressRing>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.collectionLabel}>
              {c.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.collectionCount}>
              {formatNumber(c.count)} / {formatNumber(c.total)}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <Empty>
        Relevé en jeu par le plugin Clavicule, {formatAgo(Date.parse(data.updatedAt))}.
        {achievements
          ? ` Hauts faits relevés ${formatAgo(Date.parse(achievements.updatedAt))}.`
          : ' Hauts faits : ils arrivent après ta prochaine connexion en jeu (ou ouvre la fenêtre des hauts faits).'}
        {data.collections.some((c) => c.key === 'armoire') ? '' : ' Armoire : ouvre-la une fois à l’auberge pour qu’elle apparaisse.'}
      </Empty>
    </>
  );
}

export function FollowActions({ profile }: { profile: CharacterProfile }) {
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
  privateEntry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 16 },
  heroText: { padding: Spacing.three, gap: Spacing.half },
  heroTitle: { color: '#E8C987' },
  heroName: { color: '#FFFFFF' },
  heroMuted: { color: 'rgba(255,255,255,0.78)' },
  heroJob: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  heroJobIcon: { width: 24, height: 24 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  stats: { flexDirection: 'row', gap: Spacing.two },
  usableRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  jobTile: { flexBasis: '31%', flexGrow: 1, maxWidth: '32.5%', borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  gearRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  collectionTile: {
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '32.5%',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  collectionLabel: { textAlign: 'center', fontSize: 13 },
  collectionCount: { textAlign: 'center', fontSize: 12, lineHeight: 16 },
});
