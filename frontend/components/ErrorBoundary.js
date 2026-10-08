import React from 'react';
import { Text, View } from 'react-native';
import { Button, styles } from './ui';

export class ErrorBoundary extends React.Component {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <View style={[styles.screen, { justifyContent: 'center', padding: 24, gap: 16 }]}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.muted}>Please reload the app. Your saved session will be restored when possible.</Text>
      <Button title="Reload app" onPress={() => this.setState(({ revision }) => ({ failed: false, revision: revision + 1 }))} />
    </View>;
    return <React.Fragment key={this.state.revision}>{this.props.children}</React.Fragment>;
  }
}
