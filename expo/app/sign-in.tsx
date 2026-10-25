import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice, Wordmark } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, space, touchTarget, type } from '@/theme';

export default function SignIn() {
  const { session, signIn, deniedEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/(tabs)" />;

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View style={styles.head}>
          <Wordmark size={44} />
          <Text style={styles.copy}>Sign in with a Science By Hugs administrator account.</Text>
          <Text style={styles.staging}>Staging · test accounts only</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text nativeID="email-label" style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabelledBy="email-label"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text nativeID="password-label" style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabelledBy="password-label"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
              style={styles.input}
            />
          </View>
          {deniedEmail ? (
            <Notice tone="warning">{deniedEmail} isn't a core. owner or administrator.</Notice>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', padding: space[5], gap: space[8] },
  head: { gap: space[3] },
  copy: { ...type.body, color: colors.textMuted },
  staging: { ...type.caption, color: colors.warning },
  form: { gap: space[4] },
  field: { gap: space[2] },
  label: { ...type.label, color: colors.textMuted },
  input: {
    minHeight: touchTarget + 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space[4],
    fontSize: 16,
  },
});
