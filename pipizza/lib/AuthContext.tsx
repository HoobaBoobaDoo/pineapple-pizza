import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { router } from 'expo-router';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAl27xnN0ai5rYwpHRNYZI1ZyYgR29YC_o",
  authDomain: "pineapple-pizza-ee50c.firebaseapp.com",
  projectId: "pineapple-pizza-ee50c",
  storageBucket: "pineapple-pizza-ee50c.firebasestorage.app",
  messagingSenderId: "436843432306",
  appId: "1:436843432306:web:39b80e97b1dedc51c0f5eb",
  measurementId: "G-H5DEDSX7NR"
};

// Initialize Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const auth = getAuth(app);
const db = getFirestore(app);

// Export auth and db for use in components
export { auth, db };

interface AuthContextType {
  user: User | null;
  userData: { nickname: string; email: string; weeklyTargetPoints: number } | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserData: (data: Partial<{ nickname: string; email: string; weeklyTargetPoints: number }>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<{ nickname: string; email: string; weeklyTargetPoints: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingName, setPendingName] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Ensure user document exists in Firestore
        const userDoc = doc(db, 'users', user.uid);
        await setDoc(userDoc, {
          displayName: pendingName || user.displayName || user.email?.split('@')[0] || 'User',
          nickname: pendingName || (user.providerData[0]?.providerId === 'google.com' ? '' : (user.displayName || user.email?.split('@')[0] || 'User')),
          email: user.email,
          createdAt: new Date(),
          weeklyTargetPoints: 100,
        }, { merge: true });
        
        // Fetch user data
        const userSnap = await getDoc(userDoc);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserData({
            nickname: data.nickname || '',
            email: data.email || '',
            weeklyTargetPoints: data.weeklyTargetPoints || 100,
          });
        }
        
        setPendingName(null);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [pendingName]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, username: string) => {
    setPendingName(username);
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const googleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const updateUserData = async (data: Partial<{ nickname: string; email: string; weeklyTargetPoints: number }>) => {
    if (!user) return;
    const userDoc = doc(db, 'users', user.uid);
    await updateDoc(userDoc, data);
    // Update local state
    setUserData(prev => prev ? { ...prev, ...data } : null);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, login, signup, googleLogin, logout, updateUserData }}>
      {children}
    </AuthContext.Provider>
  );
};