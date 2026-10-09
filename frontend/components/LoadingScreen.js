import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Loading, styles } from './ui';

export function LoadingScreen({ message }) {
  return <SafeAreaView style={styles.screen}><Loading message={message} /></SafeAreaView>;
}
