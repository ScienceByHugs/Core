import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createChunkedStorage } from './storageAdapter';

// Administrator sessions live in the iOS keychain, never in plain app storage.
export const authStorage = Platform.OS === 'web'
  ? AsyncStorage
  : createChunkedStorage({
      getItem: key => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
      removeItem: key => SecureStore.deleteItemAsync(key),
    });
