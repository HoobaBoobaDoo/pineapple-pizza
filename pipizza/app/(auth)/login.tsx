import React, { useState } from 'react';
import { View, TextInput, Alert, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/AuthContext';
import { auth, db } from '@/lib/AuthContext';
import { doc, getDoc } from 'firebase/firestore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, googleLogin } = useAuth();

  const handleLogin = async () => {
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Error', error.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await googleLogin();
      // Check if user needs to set username
      if (auth.currentUser) {
        const userDoc = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userDoc);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (!userData.nickname || userData.nickname.trim() === '') {
            router.replace('/(auth)/setup');
            return;
          }
        }
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Google Login Error', error.message);
    }
  };

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <ThemedText type="title" style={{ textAlign: 'center', marginBottom: 20 }}>
        Login
      </ThemedText>
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
      <TouchableOpacity onPress={handleLogin} style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 5, alignItems: 'center' }}>
        <ThemedText style={{ color: 'white' }}>Login</ThemedText>
      </TouchableOpacity>      <TouchableOpacity onPress={handleGoogleLogin} style={{ backgroundColor: '#DB4437', padding: 15, borderRadius: 5, alignItems: 'center', marginTop: 10 }}>
        <ThemedText style={{ color: 'white' }}>Login with Google</ThemedText>
      </TouchableOpacity>      <Link href="/(auth)/signup" style={{ marginTop: 20, textAlign: 'center' }}>
        <ThemedText>Dont have an account? Sign up</ThemedText>
      </Link>
    </ThemedView>
  );
}