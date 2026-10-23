/** Petits éléments partagés par les écrans de notifications. */
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import type { PriceAlert } from '@/store/notification-store';
import { formatGil } from '@/utils/format';

export function describeAlert(a: PriceAlert): string {
  return `${a.condition === 'below' ? '≤' : '≥'} ${formatGil(a.price)} · ${a.scope}${a.hq ? ' · HQ' : ''}`;
}

export function WebNotice() {
  return (
    <Card>
      <ThemedText type="small">Les notifications ne marchent que dans l’appli sur le téléphone, pas dans le navigateur.</ThemedText>
    </Card>
  );
}

export function leadLabel(lead: number): string {
  return lead === 0 ? 'Au moment' : lead >= 60 ? `${lead / 60} h avant` : `${lead} min avant`;
}
