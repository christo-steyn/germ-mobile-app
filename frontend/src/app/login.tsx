import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '../api';
import { Button, colors, ErrorNotice, styles } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { authenticate, busy, message, savedUsername, restore, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usernameEdited, setUsernameEdited] = useState(false);

  useEffect(() => {
    if (!usernameEdited && savedUsername) setUsername(savedUsername);
  }, [savedUsername, usernameEdited]);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (mode === 'register' && password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await authenticate(mode, username, password);
      setPassword('');
      setConfirmation('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.primary, fontWeight: '800', letterSpacing: 3 }}>GERM / ALARMS</Text>
          <Text style={styles.heading}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={styles.subtitle}>Follow the alarms that matter. Stay informed wherever you are.</Text>
          <ErrorNotice message={error || message} />
          {!!message && <View style={styles.row}>
            <View style={{ flex: 1 }}><Button title="Retry saved session" secondary onPress={() => void restore()} disabled={busy} /></View>
            <View style={{ flex: 1 }}><Button title="Clear saved session" secondary onPress={logout} disabled={busy} /></View>
          </View>}
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input} value={username} accessibilityLabel="Username"
            onChangeText={text => { setUsernameEdited(true); setUsername(text); }}
            autoCapitalize="none" autoCorrect={false} autoComplete="username" editable={!busy}
            placeholder="Your username" placeholderTextColor={colors.muted} returnKeyType="next"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input} value={password} onChangeText={setPassword} accessibilityLabel="Password"
            secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="Your password" placeholderTextColor={colors.muted}
            returnKeyType={mode === 'login' ? 'go' : 'next'}
            onSubmitEditing={mode === 'login' ? () => void submit() : undefined}
          />
          {mode === 'register' && <>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input} value={confirmation} onChangeText={setConfirmation}
              accessibilityLabel="Confirm password" secureTextEntry autoCapitalize="none"
              autoCorrect={false} autoComplete="new-password" editable={!busy}
              placeholder="Repeat your password" placeholderTextColor={colors.muted}
              returnKeyType="go" onSubmitEditing={() => void submit()}
            />
          </>}
          <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={() => void submit()} busy={busy} />
          <Button
            title={mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            secondary disabled={busy}
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setPassword('');
              setConfirmation('');
            }}
          />
          <Text style={styles.caption}>Notifications are optional. We will only ask for permission when you choose to enable them.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
