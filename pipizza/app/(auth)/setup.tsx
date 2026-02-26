import React, { useState } from 'react';
import { View, TextInput, Alert, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';

export default function SetupScreen() {
  const [username, setUsername] = useState('');
  const { updateUserData } = useAuth();

  const handleSetup = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    try {
      await updateUserData({ nickname: username.trim() });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save username');
    }
  };

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <ThemedText type="title" style={{ textAlign: 'center', marginBottom: 20 }}>
        Set Your Username
      </ThemedText>
      <TextInput
        placeholder="Enter your username"
        value={username}
        onChangeText={setUsername}
        style={{ borderWidth: 1, padding: 10, marginBottom: 20, borderRadius: 5 }}
        autoCapitalize="words"
      />
      <TouchableOpacity onPress={handleSetup} style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 5, alignItems: 'center' }}>
        <ThemedText style={{ color: 'white' }}>Continue</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}