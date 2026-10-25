import { Host, Icon } from '@expo/ui';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

// Same icon approach as Pulse: SF Symbols on iOS, vector drawables on Android.
const tabIcons = {
  index: Icon.select({ ios: 'house.fill', android: require('../../assets/icons/home.xml') }),
  customers: Icon.select({ ios: 'person.2.fill', android: require('../../assets/icons/customers.xml') }),
  orders: Icon.select({ ios: 'list.bullet.rectangle', android: require('../../assets/icons/orders.xml') }),
  inventory: Icon.select({ ios: 'shippingbox.fill', android: require('../../assets/icons/inventory.xml') }),
  account: Icon.select({ ios: 'person.fill', android: require('../../assets/icons/account.xml') }),
} as const;

const labels: Record<string, string> = { index: 'Home', orders: 'Orders', customers: 'Customers', inventory: 'Inventory', account: 'Account' };

function TabIcon({ routeName, color }: { routeName: string; color: ColorValue }) {
  const name = tabIcons[routeName as keyof typeof tabIcons] ?? tabIcons.index;
  return (
    <Host matchContents>
      <Icon name={name} size={22} color={color} />
    </Host>
  );
}

export default function TabsLayout() {
  const { session } = useAuth();
  // The root stack owns sign-out navigation; render nothing while it switches.
  if (!session) return null;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.line, borderTopWidth: 1 },
        tabBarLabel: labels[route.name] ?? route.name,
        tabBarIcon: ({ color }) => <TabIcon routeName={route.name} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
