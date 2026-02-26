import React, { useState } from 'react';
import { View, TextInput, Alert, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const { signup } = useAuth();

  const handleSignup = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    try {
      await signup(email, password, username);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Signup Error', error.message);
    }
  };

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <ThemedText type="title" style={{ textAlign: 'center', marginBottom: 20 }}>
        Sign Up
      </ThemedText>
      <TextInput
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        style={{ borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 5 }}
        autoCapitalize="words"
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 5 }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, padding: 10, marginBottom: 20, borderRadius: 5 }}
        secureTextEntry
      />
      <TouchableOpacity onPress={handleSignup} style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 5, alignItems: 'center' }}>
        <ThemedText style={{ color: 'white' }}>Sign Up</ThemedText>
      </TouchableOpacity>
      <Link href="/(auth)/login" style={{ marginTop: 20, textAlign: 'center' }}>
        <ThemedText>Already have an account? Login</ThemedText>
      </Link>
    </ThemedView>
  );
}