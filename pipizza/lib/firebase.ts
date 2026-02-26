// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAl27xnN0ai5rYwpHRNYZI1ZyYgR29YC_o",
  authDomain: "pineapple-pizza-ee50c.firebaseapp.com",
  projectId: "pineapple-pizza-ee50c",
  storageBucket: "pineapple-pizza-ee50c.firebasestorage.app",
  messagingSenderId: "436843432306",
  appId: "1:436843432306:web:39b80e97b1dedc51c0f5eb",
  measurementId: "G-H5DEDSX7NR"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firebase Analytics (only in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Export the app for use in other modules
export { app };

// Initialize Firebase Data Connect
import { getDataConnect, ConnectorConfig } from '@firebase/data-connect';

const connectorConfig: ConnectorConfig = {
  connector: 'pineapple-pizza-ee50c',
  service: 'dataconnect',
  location: 'us-central1',
};

export const dataConnect = getDataConnect(connectorConfig);