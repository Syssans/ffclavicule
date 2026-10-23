/** Courrier d'un personnage connecté : lettres, aperçu, gil et pièces jointes. */
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { Letter, PrivateSnapshot } from '@/api/private';
import { GameWindow } from '@/components/game-ui';
import { ItemRow, PrivateIcons, PrivateScreen, type Names } from '@/components/private/shared';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAgo, formatGil } from '@/utils/format';

export default function MailScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return (
    <PrivateScreen id={id} title="Courrier">
      {(snapshot, names) => <Mail mail={snapshot.mail} names={names} />}
    </PrivateScreen>
  );
}

function Mail({ mail, names }: { mail: PrivateSnapshot['mail']; names?: Names }) {
  if (!mail) return <Empty>Ouvre ta boîte aux lettres en jeu pour que ton courrier apparaisse ici.</Empty>;
  const unread = mail.letters.filter((l) => !l.read).length;
  const attachments = mail.letters.filter((l) => l.attachments.length > 0 || l.gil > 0).length;
  return (
    <>
      <GameWindow
        icon={PrivateIcons.mailbox}
        title="Boîte aux lettres mog"
        subtitle={`${mail.letters.length} lettre${mail.letters.length > 1 ? 's' : ''}${unread ? ` · ${unread} non lue${unread > 1 ? 's' : ''}` : ''}${attachments ? ` · ${attachments} avec pièces jointes` : ''} · relevé ${formatAgo(Date.parse(mail.updatedAt))}`}
      />
      {mail.letters.length === 0 ? <Empty>Boîte aux lettres vide.</Empty> : null}
      {mail.letters.map((l, i) => (
        <LetterWindow key={`${l.timestamp}-${i}`} letter={l} names={names} />
      ))}
    </>
  );
}

function LetterWindow({ letter, names }: { letter: Letter; names?: Names }) {
  const theme = useTheme();
  const date = new Date(letter.timestamp * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <GameWindow
      icon={letter.attachments.length > 0 ? PrivateIcons.parcel : PrivateIcons.letter}
      title={letter.sender || 'Expéditeur inconnu'}
      subtitle={date}
      right={
        <View style={styles.badges}>
          {!letter.read ? <Badge label="Non lue" tone="accent" /> : null}
          {letter.gil > 0 ? <Badge label={formatGil(letter.gil)} tone="accent" /> : null}
        </View>
      }>
      {letter.preview ? (
        <ThemedText type="small" style={[styles.preview, { borderLeftColor: theme.frame }]}>
          {letter.preview}
        </ThemedText>
      ) : null}
      {letter.attachments.map((a, i) => (
        <ItemRow key={a.id} stack={a} names={names} detail="Pièce jointe" first={i === 0 && !letter.preview} />
      ))}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  badges: { alignItems: 'flex-end', gap: Spacing.half },
  preview: { fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: Spacing.two },
});
