/** Fiche d'un point de la carte, selon son genre (lieu, éthérite, passage, aléa, pêche, récolte, trésor, quête). */
import { router } from 'expo-router';
import { View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { itemIcon, itemName } from '@/components/fishing';
import { nodeStatusLabel } from '@/components/gathering';
import { CardButton, CardRow, CardText, PointCard } from '@/components/map/map-overlays';
import { fishingData } from '@/utils/fishing';
import { KIND_LABEL, kindOf, nodeItems, nodeKey, nodeStatus, scheduleText, GATHERER_NAME, jobOf } from '@/utils/gathering';
import { dutyName, formatCoords, getMap, mapData, toGameCoords, type MapInfo, type MapPoint } from '@/utils/map';

export function PointDetails({
  map,
  point,
  now,
  onOpenMap,
  onClose,
}: {
  map: MapInfo;
  point: MapPoint;
  now: number;
  /** Ouvre une carte, éventuellement centrée sur un point (pixels de cette carte). */
  onOpenMap: (id: number, focus?: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  // Point d'une zone vu sur sa région : coordonnées de la zone, comme en jeu.
  const sourceMap = point.source ? getMap(point.source.mapId) : undefined;
  const where =
    sourceMap && point.source
      ? `${sourceMap.n} · ${formatCoords(toGameCoords(sourceMap, point.source.x, point.source.y))}`
      : formatCoords(toGameCoords(map, point.x, point.y));
  const data = point.data;
  // Sur une région assemblée : ouvrir la zone, centrée sur ce point.
  const source = point.source;
  const zoneButton =
    source && sourceMap ? (
      <CardButton label={`Voir dans ${sourceMap.n}`} onPress={() => onOpenMap(source.mapId, { x: source.x, y: source.y })} />
    ) : null;

  switch (data.type) {
    case 'marker': {
      if (data.kind === 2) {
        const target = getMap(data.link);
        const name = target ? (target.k === 'instance' ? dutyName(target) : target.n) : point.label;
        return (
          <PointCard icon={point.icon || 60441} title={point.label || name} subtitle={`Passage vers ${name} · ${where}`} onClose={onClose}>
            <CardButton label={`Ouvrir la carte : ${name}`} onPress={() => onOpenMap(data.link)} />
            {zoneButton}
          </PointCard>
        );
      }
      const kind = data.kind === 3 ? 'Éthérite' : data.kind === 4 ? 'Éthernet (téléportation en ville)' : data.kind === 1 ? 'Zone' : 'Lieu';
      return (
        <PointCard icon={point.icon || undefined} title={point.label || kind} subtitle={`${kind} · ${where}`} onClose={onClose}>
          {zoneButton}
        </PointCard>
      );
    }
    case 'fate':
      return (
        <PointCard icon={point.icon} title={point.label} subtitle={`Aléa niveau ${data.level} · ${where}`} onClose={onClose}>
          {zoneButton}
        </PointCard>
      );
    case 'fishing': {
      const fish = fishingData().fish.filter((f) => f.s === data.spotId);
      return (
        <PointCard icon={point.icon} title={point.label} subtitle={`Coin de pêche niveau ${data.level} · ${where}`} onClose={onClose}>
          {fish.length === 0 ? <CardText muted>Pas de poisson suivi à ce coin.</CardText> : null}
          {fish.slice(0, 5).map((f) => (
            <CardRow
              key={f.id}
              image={itemIcon(f.id)}
              title={itemName(f.id)}
              onPress={() =>
                router.push({
                  pathname: '/item/[id]',
                  params: { id: String(f.id) },
                })
              }
            />
          ))}
          {fish.length > 5 ? <CardText muted>Et {fish.length - 5} autres poissons.</CardText> : null}
          {zoneButton}
        </PointCard>
      );
    }
    case 'gathering': {
      const node = data.node;
      const status = nodeStatus(node, now);
      const label = status.kind === 'always' ? null : nodeStatusLabel(status, now).text;
      const items = nodeItems(node);
      const schedule = scheduleText(node);
      return (
        <PointCard
          icon={point.icon}
          title={node.p || GATHERER_NAME[jobOf(node)]}
          subtitle={[
            `${GATHERER_NAME[jobOf(node)]} niv. ${node.l}`,
            kindOf(node) !== 'regular' ? KIND_LABEL[kindOf(node)] : null,
            schedule ? `${schedule} (ET)` : null,
            where,
          ]
            .filter(Boolean)
            .join(' · ')}
          onClose={onClose}>
          {label ? <CardText>{label}</CardText> : null}
          {items.slice(0, 5).map((it) => (
            <CardRow
              key={it.itemId}
              image={gameIconUrl(it.icon)}
              title={it.name}
              detail={`niv. ${it.level}`}
              onPress={() =>
                router.push({
                  pathname: '/item/[id]',
                  params: { id: String(it.itemId) },
                })
              }
            />
          ))}
          <CardButton
            label="Fiche du point"
            onPress={() =>
              router.push({
                pathname: '/gathering/node/[key]',
                params: { key: nodeKey(node) },
              })
            }
          />
          {zoneButton}
        </PointCard>
      );
    }
    case 'treasure': {
      const item = mapData().treasureItems[String(data.itemId)];
      return (
        <PointCard
          image={item ? gameIconUrl(item.i) : null}
          title={item?.n ?? 'Carte au trésor'}
          subtitle={`Trésor ${data.party > 1 ? `pour ${data.party} joueurs` : 'en solo'} · ${where}`}
          onClose={onClose}>
          <CardButton
            label="Fiche de la carte au trésor"
            onPress={() =>
              router.push({
                pathname: '/item/[id]',
                params: { id: String(data.itemId) },
              })
            }
          />
          {zoneButton}
        </PointCard>
      );
    }
    case 'quest':
      return (
        <PointCard
          icon={point.icon}
          title={point.label}
          subtitle={[`Quête niv. ${data.level}`, data.genre, where].filter(Boolean).join(' · ')}
          onClose={onClose}>
          <CardText muted>Donneur de quête à cet endroit.</CardText>
          {zoneButton}
        </PointCard>
      );
    default:
      return <View />;
  }
}
