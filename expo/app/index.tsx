import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.textMuted} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Redirect href={session ? '/(tabs)' : '/sign-in'} />;
}
