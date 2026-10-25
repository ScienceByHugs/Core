import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Notice, Row, Screen } from '@/components/ui';
import { environment } from '@/config/environment';
import { roleOf, useAuth } from '@/providers/AuthProvider';
import { colors, type } from '@/theme';

export default function Account() {
  const { session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = session?.user;

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign out.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ ...type.title, color: colors.text }}>Account</Text>
      <Card>
        <Row title="Email" trailing={user?.email ?? '—'} />
        <Row title="Role" trailing={roleOf(user) || '—'} />
        <Row title="Environment" trailing="Staging" trailingDetail={environment.projectRef} last />
      </Card>
      <View style={{ gap: 8 }}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button label={busy ? 'Signing out…' : 'Sign out'} onPress={handleSignOut} disabled={busy} variant="secondary" />
      </View>
    </Screen>
  );
}
