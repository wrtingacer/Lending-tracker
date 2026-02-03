// ===== firebase.js - Firebase, Auth, Currency, Sharing, Backup =====
// NOTE: Use <script type="module"> for this file in index.html:
// <script type="module" src="firebase.js"></script>
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
    getDatabase, ref, onValue, push, set, remove
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
    apiKey: "AIzaSyBsHw8C5h6nPunSbvR5ssWHdGzPCM8qcNI",
    authDomain: "lending-tracker-2ded9.firebaseapp.com",
    databaseURL: "https://lending-tracker-2ded9-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "lending-tracker-2ded9",
    storageBucket: "lending-tracker-2ded9.firebasestorage.app",
    messagingSenderId: "346512563768",
    appId: "1:346512563768:web:65095d67d7c9ff737310cd",
    measurementId: "G-HQVVP0JT52"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ===== GLOBALS (shared with app.js via window) =====
window.firebaseDb = db;
window.firebaseAuth = auth;
window.firebaseRef = ref;
window.firebasePush = push;
window.firebaseSet = set;
window.firebaseRemove = remove;
window.firebaseOnValue = onValue;

window.currentUser = null;
window.debtsRef = null;
window.debtsUnsubscribe = null;
window.currentDebts = [];
window.exchangeRates = { USD: 1 };
window.selectedCurrency = 'KES';
window.trackingMode = 'owe'; // 'owe' or 'owed'

// ===== OFFLINE DETECTION =====
function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    banner.style.display = navigator.onLine ? 'none' : 'block';
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ===== CURRENCY / EXCHANGE RATES =====
async function fetchExchangeRates() {
    try {
        // Using free ExchangeRate-API (no key needed for basic)
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await res.json();
        if (data && data.rates) {
            window.exchangeRates = data.rates;
            localStorage.setItem('exchange_rates', JSON.stringify(data.rates));
            localStorage.setItem('exchange_rates_time', Date.now());
        }
    } catch (err) {
        console.warn('Exchange rate fetch failed, using cached:', err);
        // Fallback to cached
        const cached = localStorage.getItem('exchange_rates');
        if (cached) {
            try { window.exchangeRates = JSON.parse(cached); } catch(e) {}
        } else {
            // Hardcoded fallback
            window.exchangeRates = {
                USD: 1, KES: 155, EUR: 0.92, GBP: 0.79,
                ZAR: 18.5, NGN: 900, TZS: 2300
            };
        }
    }
    updateExchangeDisplay();
}

function updateExchangeDisplay() {
    const cur = window.selectedCurrency;
    const rate = window.exchangeRates[cur] || 1;
    document.getElementById('exchange-rate-display').textContent =
        `1 USD = ${rate.toFixed(2)} ${cur}`;
    // Update all stat labels
    ['stat-currency','stat-currency2','stat-currency3','stat-currency4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = cur;
    });
}

function convertToSelectedCurrency(amountInUSD) {
    const rate = window.exchangeRates[window.selectedCurrency] || 1;
    return amountInUSD * rate;
}

// Load cached rates immediately, then refresh
(function loadCachedRates() {
    const cached = localStorage.getItem('exchange_rates');
    const time = localStorage.getItem('exchange_rates_time');
    if (cached && (Date.now() - time < 3600000)) {
        try { window.exchangeRates = JSON.parse(cached); } catch(e) {}
    }
    fetchExchangeRates(); // refresh in background
})();

// ===== CURRENCY SELECT HANDLER =====
document.getElementById('currency-select').addEventListener('change', function() {
    window.selectedCurrency = this.value;
    localStorage.setItem('selected_currency', this.value);
    updateExchangeDisplay();
    // Re-render if app is loaded
    if (window.renderDebts) window.renderDebts();
    if (window.updateStats) window.updateStats();
});

// Restore saved currency
(function restoreCurrency() {
    const saved = localStorage.getItem('selected_currency');
    if (saved) {
        window.selectedCurrency = saved;
        document.getElementById('currency-select').value = saved;
    }
})();

// ===== AUTH HANDLERS =====
function showAuthError(msg) {
    const el = document.getElementById('auth-message');
    el.textContent = msg;
    el.style.color = '#e74c3c';
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-message');

    if (!email || !password) { showAuthError('Please enter email and password'); return; }

    msg.textContent = 'Logging in...';
    msg.style.color = '#667eea';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        const codes = {
            'auth/wrong-password': 'Incorrect password.',
            'auth/user-not-found': 'No account with this email. Please sign up.',
            'auth/invalid-email': 'Invalid email format.',
            'auth/too-many-requests': 'Too many failed attempts. Try again later.'
        };
        showAuthError(codes[err.code] || err.message);
    }
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-message');

    if (!email || !password) { showAuthError('Please enter email and password'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

    msg.textContent = 'Creating account...';
    msg.style.color = '#667eea';

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // Show onboarding for new users
        if (typeof checkAndShowOnboarding === 'function') checkAndShowOnboarding();
    } catch (err) {
        const codes = {
            'auth/email-already-in-use': 'Email already registered. Log in instead.',
            'auth/invalid-email': 'Invalid email format.',
            'auth/weak-password': 'Password is too weak.'
        };
        showAuthError(codes[err.code] || err.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// ===== AUTH STATE =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.currentUser = user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app-section').style.display = 'block';
        document.getElementById('user-email').textContent = user.email;

        window.debtsRef = ref(db, 'users/' + user.uid + '/debts');
        if (window.loadDebts) window.loadDebts();
        if (window.setupNotifications) window.setupNotifications();

        // Show onboarding only once after signup
        if (!localStorage.getItem('onboarding_done') && typeof checkAndShowOnboarding === 'function') {
            checkAndShowOnboarding();
        }
    } else {
        window.currentUser = null;
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('app-section').style.display = 'none';
        document.getElementById('auth-message').textContent = '';
        if (window.debtsUnsubscribe) window.debtsUnsubscribe();
        window.currentDebts = [];
    }
});

// ===== BACKUP =====
document.getElementById('backup-btn').addEventListener('click', () => {
    document.getElementById('backup-modal').classList.add('active');
});

document.getElementById('close-backup-modal').addEventListener('click', () => {
    document.getElementById('backup-modal').classList.remove('active');
});

document.getElementById('export-json-btn').addEventListener('click', () => {
    const data = { debts: window.currentDebts, exportDate: new Date().toISOString(), version: '2.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debt-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-json-btn').addEventListener('click', () => {
    const file = document.getElementById('import-json-input').files[0];
    if (!file) { alert('Please select a backup file.'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.debts || !Array.isArray(data.debts)) { alert('Invalid backup file.'); return; }
            if (confirm(`Import ${data.debts.length} entries?`)) {
                data.debts.forEach(debt => {
                    const newRef = push(window.debtsRef);
                    const { id, ...d } = debt;
                    set(newRef, d);
                });
                alert('Imported successfully!');
                document.getElementById('backup-modal').classList.remove('active');
            }
        } catch (err) { alert('Error reading file: ' + err.message); }
    };
    reader.readAsText(file);
});

// ===== SHARING =====
document.getElementById('close-share-modal').addEventListener('click', () => {
    document.getElementById('share-modal').classList.remove('active');
});

document.getElementById('copy-share-link').addEventListener('click', () => {
    const link = document.getElementById('share-link').value;
    navigator.clipboard.writeText(link).then(() => {
        const btn = document.getElementById('copy-share-link');
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy Link', 2000);
    });
});

// Called from app.js when share btn clicked
window.openShareModal = function(debtId) {
    const mode = document.getElementById('share-mode').value || 'view';
    const shareUrl = `${window.location.origin}/shared.html?id=${debtId}&mode=${mode}&user=${window.currentUser.uid}`;
    document.getElementById('share-link').value = shareUrl;
    document.getElementById('share-modal').classList.add('active');
};

document.getElementById('share-mode').addEventListener('change', function() {
    // Re-generate link with new mode if modal is open
    if (document.getElementById('share-modal').classList.contains('active')) {
        const link = document.getElementById('share-link').value;
        if (link) {
            const url = new URL(link);
            url.searchParams.set('mode', this.value);
            document.getElementById('share-link').value = url.toString();
        }
    }
});

// ===== PAYMENT INTEGRATIONS =====
document.querySelector('.mpesa-btn').addEventListener('click', () => {
    window.open('https://www.safaricom.co.ke/mpesa', '_blank');
    showPaymentIntegrationNote('M-Pesa');
});

document.querySelector('.paypal-btn').addEventListener('click', () => {
    window.open('https://www.paypal.com/signin', '_blank');
    showPaymentIntegrationNote('PayPal');
});

document.querySelector('.cashapp-btn').addEventListener('click', () => {
    window.open('https://cash.app', '_blank');
    showPaymentIntegrationNote('Cash App');
});

function showPaymentIntegrationNote(app) {
    const errEl = document.getElementById('payment-error');
    errEl.textContent = `Opening ${app}... Complete payment there, then record it here.`;
    errEl.style.color = '#3498db';
    setTimeout(() => errEl.textContent = '', 5000);
}

// ===== FEEDBACK =====
document.getElementById('feedback-btn').addEventListener('click', () => {
    document.getElementById('feedback-modal').classList.add('active');
});

document.getElementById('close-feedback-modal').addEventListener('click', () => {
    document.getElementById('feedback-modal').classList.remove('active');
});

document.getElementById('feedback-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const rating = document.querySelector('input[name="rating"]:checked');
    const type = document.getElementById('feedback-type').value;
    const text = document.getElementById('feedback-text').value.trim();

    if (!text) { alert('Please write a message.'); return; }

    const feedbackData = {
        rating: rating ? rating.value : null,
        type, text,
        email: window.currentUser ? window.currentUser.email : 'anonymous',
        timestamp: Date.now()
    };

    // Save to Firebase under /feedback
    const feedbackRef = ref(db, 'feedback');
    const newFeedback = push(feedbackRef);
    set(newFeedback, feedbackData).then(() => {
        alert('Thank you for your feedback! 🎉');
        document.getElementById('feedback-form').reset();
        document.getElementById('feedback-modal').classList.remove('active');
    }).catch(() => {
        alert('Failed to submit. Please try again.');
    });
});

// ===== REMINDER MODAL CLOSE =====
document.getElementById('close-reminder-modal').addEventListener('click', () => {
    document.getElementById('reminder-modal').classList.remove('active');
});

document.getElementById('copy-reminder-btn').addEventListener('click', () => {
    const text = document.getElementById('reminder-text').value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-reminder-btn');
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
});

