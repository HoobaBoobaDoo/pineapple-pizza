import React, { useState, useEffect } from 'react';
import { View, TextInput, Alert, TouchableOpacity, BackHandler } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';
import { deleteUser } from 'firebase/auth';

export default function SetupScreen() {
  const [username, setUsername] = useState('');
  const { updateUserData, user, logout, auth } = useAuth();

  // Prevent back navigation
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, []);

  const handleSetup = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username is required to continue');
      return;
    }
    try {
      await updateUserData({ nickname: username.trim() });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save username');
    }
  };

  const handleCancel = async () => {
    Alert.alert(
      'Username Required',
      'A username is required to use this app. Canceling will delete your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              if (user) {
                await deleteUser(user);
              }
              await logout();
              router.replace('/(auth)/login');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete account');
              // Force logout anyway
              await logout();
              router.replace('/(auth)/login');
            }
          }
        }
      ]
    );
  };

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <ThemedText type="title" style={{ textAlign: 'center', marginBottom: 10 }}>
        Username Required
      </ThemedText>
      <ThemedText style={{ textAlign: 'center', marginBottom: 20, color: '#666' }}>
        Please choose a username to continue using the app.
      </ThemedText>
      <TextInput
        placeholder="Enter your username"
        value={username}
        onChangeText={setUsername}
        style={{ borderWidth: 1, padding: 10, marginBottom: 20, borderRadius: 5 }}
        autoCapitalize="words"
        autoFocus={true}
      />
      <TouchableOpacity onPress={handleSetup} style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 5, alignItems: 'center', marginBottom: 10 }}>
        <ThemedText style={{ color: 'white' }}>Continue</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleCancel} style={{ backgroundColor: '#FF3B30', padding: 15, borderRadius: 5, alignItems: 'center' }}>
        <ThemedText style={{ color: 'white' }}>Cancel & Delete Account</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}