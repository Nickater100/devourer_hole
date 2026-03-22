import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, serverTimestamp, setDoc, doc, getDoc, initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCUqx74Lgt2VZR30NBLERaoapsu7MFLf2g",
    authDomain: "under-hole.firebaseapp.com",
    projectId: "under-hole",
    storageBucket: "under-hole.firebasestorage.app",
    messagingSenderId: "857081135448",
    appId: "1:857081135448:web:ddd8eff9e772383b56a52d",
    measurementId: "G-BT30HT79SZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Force HTTP long-polling instead of WebSockets — required for Capacitor WebView
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
});
const provider = new GoogleAuthProvider();

// Check if returning from redirect login
getRedirectResult(auth).then((result) => {
    if (result) {
        console.log("Logged in successfully via redirect:", result.user.displayName);
    }
}).catch((error) => {
    console.error("Login redirect error:", error);
});

// Force GoogleAuth to initialize with explicit arguments rather than relying on native parser
if (window.GoogleAuthPlugin) {
    window.GoogleAuthPlugin.initialize({
      clientId: '857081135448-r4n44jakpp9lccn73527so10ai1oped1.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
}

// Expose these methods globally so game.js can call them.
window.FirebaseAPI = {
    loginWithGoogle: async () => {
        try {
            // Check if we have the native Capacitor Google Auth plugin attached
            if (window.GoogleAuthPlugin && window.CapacitorCore && window.CapacitorCore.isNativePlatform()) {
                console.log("Trying native Capacitor Google Login...");
                const googleUser = await window.GoogleAuthPlugin.signIn();
                console.log("Got idToken from Native:", googleUser.authentication.idToken);
                // Pass Native Token to Firebase Auth
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await signInWithCredential(auth, credential);
            } else {
                console.log("Fallback to Web popup login...");
                await signInWithPopup(auth, provider);
            }
        } catch (error) {
            console.error("Login Error", error);
        }
    },
    logout: async () => {
        await signOut(auth);
    },
    saveScore: async (score) => {
        if (!auth.currentUser) return;
        try {
            const userRef = doc(db, 'leaderboard', auth.currentUser.uid);
            
            // Validate if new score is higher than current saved score
            const docSnap = await getDoc(userRef);
            let currentHighScore = 0;
            if (docSnap.exists()) {
                currentHighScore = docSnap.data().score || 0;
            }

            if (score > currentHighScore) {
                await setDoc(userRef, {
                    username: auth.currentUser.displayName || "Anonymous",
                    photoURL: auth.currentUser.photoURL || "",
                    score: score,
                    timestamp: serverTimestamp()
                });
                console.log("New high score saved to Cloud!");
            }
        } catch (error) {
            console.error("Error saving score", error);
        }
    },
    getLeaderboard: async () => {
        try {
            const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(50));
            const querySnapshot = await getDocs(q);
            const scores = [];
            querySnapshot.forEach((doc) => {
                scores.push(doc.data());
            });
            return scores;
        } catch (error) {
            console.error("Error fetching leaderboard", error);
            return [];
        }
    },
    onAuthChange: (callback) => {
        onAuthStateChanged(auth, callback);
    }
};
