import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Button, Feedback, styles } from '../components/ui';

export function AuthScreen({ navigation, route }) {
  const register = route.name === 'Register';
  const { authenticate, notice } = useAuth();
  const [values, setValues] = useState({ username: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fields = [
    { key: 'username', label: 'Username', autoComplete: 'username', maxLength: 50 },
    ...(register ? [{ key: 'email', label: 'Email address', keyboardType: 'email-address', autoComplete: 'email', maxLength: 254 }] : []),
    { key: 'password', label: 'Password', secureTextEntry: true, autoComplete: register ? 'new-password' : 'current-password', maxLength: 128 },
    ...(register ? [{ key: 'confirm', label: 'Confirm password', secureTextEntry: true, autoComplete: 'new-password', maxLength: 128 }] : []),
  ];
  const submit = async () => {
    if (busy) return;
    const username = values.username.trim();
    const email = values.email.trim();
    if (!username || !values.password) return setError('Enter your username and password.');
    if (register) {
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) return setError('Use 3–50 letters, numbers, periods, hyphens or underscores for your username.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
      if (values.password.length < 8) return setError('Choose a password with at least 8 characters.');
      if (values.password !== values.confirm) return setError('The passwords do not match.');
    }
    setError('');
    setBusy(true);
    try {
      await authenticate(register ? 'register' : 'login', {
        username, password: values.password, ...(register ? { email } : {}),
      });
    } catch (failure) {
      setError(failure.message || 'Unable to sign in. Please retry.');
      setBusy(false);
    }
  };
  return <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={{ paddingVertical: 16, gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#166455' }}>GERM ALARM</Text>
          <Text accessibilityRole="header" style={styles.title}>{register ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.muted}>{register ? 'Follow alarms and get timely updates wherever you are.' : 'Your alarms. Your community. Stay informed.'}</Text>
        </View>
        {!!notice && <Feedback message={notice} />}
        {fields.map(({ key, label, ...props }) => <View key={key} style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput {...props} style={styles.input} accessibilityLabel={label}
            autoCapitalize="none" autoCorrect={false} editable={!busy} value={values[key]}
            onChangeText={(value) => setValues((previous) => ({ ...previous, [key]: value }))}
            returnKeyType={key === fields[fields.length - 1].key ? 'done' : 'next'}
            onSubmitEditing={key === fields[fields.length - 1].key ? submit : undefined} />
        </View>)}
        <Feedback message={error} />
        <Button title={busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'} disabled={busy} onPress={submit} />
        <Button secondary disabled={busy} title={register ? 'Already have an account? Sign in' : 'New here? Create an account'}
          onPress={() => navigation.replace(register ? 'Login' : 'Register')} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
