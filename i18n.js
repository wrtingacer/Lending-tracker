// ===== i18n.js - Internationalization & Onboarding =====

const translations = {
    en: {
        "app.title": "Debt Tracker",
        "app.subtitle": "Track money you owe & money owed to you",
        "app.logged_as": "Logged in as:",
        "auth.title": "Sign In or Create Account",
        "auth.email": "Email",
        "auth.password": "Password",
        "toggle.owe": "Money I Owe",
        "toggle.owed": "Money Owed To Me",
        "currency.label": "Currency:",
        "filter.title": "Search & Filter",
        "analytics.title": "Insights",
        "chart.title": "Overview",
        "reminder.title": "Reminders",
        "form.add_debt": "Add New Debt",
        "form.add_lending": "Add New Lending",
        "form.person_owe": "Creditor Name (Who you owe) *",
        "form.person_owed": "Person Name (Who owes you) *",
        "form.submit_owe": "Add Debt",
        "form.submit_owed": "Add Lending",
        "onboarding.welcome_title": "Welcome to Debt Tracker!",
        "onboarding.welcome_desc": "Your smart tool for managing debts and tracking money owed to and from others.",
        "onboarding.track_title": "Track Both Ways",
        "onboarding.track_desc": "Switch between Money I Owe and Money Owed To Me using the toggle.",
        "onboarding.currency_title": "Multi-Currency Support",
        "onboarding.currency_desc": "Add debts in KES, USD, EUR and more. Live exchange rates fetched automatically.",
        "onboarding.ready_title": "You're All Set!",
        "onboarding.ready_desc": "Start by adding your first debt or lending entry. We're here to help!",
        "privacy.title": "Privacy Policy",
        "privacy.body": "We take your privacy seriously.\n\n1. DATA STORAGE: All data is stored securely on Firebase (Google Cloud) over HTTPS with 256-bit encryption.\n\n2. CLIENT-SIDE ENCRYPTION: Sensitive fields (amounts, notes) are encrypted before being sent to the server using AES-256.\n\n3. DATA USAGE: Your data is only used to power the Debt Tracker app. We never sell or share personal data with third parties.\n\n4. COOKIES: We use minimal cookies only for authentication and theme preference.\n\n5. YOUR RIGHTS: Under Kenya's Data Protection Act 2019 and GDPR, you have the right to access, edit, or delete your data at any time.\n\n6. CONTACT: If you have concerns, email us at privacy@debttracker.app\n\nLast updated: January 2025"
    },
    sw: {
        "app.title": "Kisimisha cha Madeni",
        "app.subtitle": "Fuatilia pesa unazodeni na zinazodeni kwako",
        "app.logged_as": "Umeingia kama:",
        "auth.title": "Ingia auUnda Akaunti",
        "auth.email": "Barua pepe",
        "auth.password": "Neno la siri",
        "toggle.owe": "Pesa Ninazodeni",
        "toggle.owed": "Pesa Zinazodeni Kwangu",
        "currency.label": "Sarafi:",
        "filter.title": "Tafuta & Chagua",
        "analytics.title": "Mawazo",
        "chart.title": "Muhtasari",
        "reminder.title": "Vikumbusho",
        "form.add_debt": "Ongeza Deni Mpya",
        "form.add_lending": "Ongeza Kukopa Mpya",
        "form.person_owe": "Jina la Mkoposhaji *",
        "form.person_owed": "Jina la Mtu *",
        "form.submit_owe": "Ongeza Deni",
        "form.submit_owed": "Ongeza Kukopa",
        "onboarding.welcome_title": "Karibu Kisimisha cha Madeni!",
        "onboarding.welcome_desc": "Zana yako ya akili kwa kusimamia madeni na kufuatilia pesa.",
        "onboarding.track_title": "Fuatilia Njia Mbili",
        "onboarding.track_desc": "Badilisha kati ya Pesa Ninazodeni na Pesa Zinazodeni Kwangu.",
        "onboarding.currency_title": "Msaada wa Sarafi Nyingi",
        "onboarding.currency_desc": "Ongeza madeni katika KES, USD, EUR na zaidi. Viwango vya kubadilisha vinafanywa moja kwa moja.",
        "onboarding.ready_title": "Uko Tayari!",
        "onboarding.ready_desc": "Anza kwa kuongeza deni lako la kwanza. Tuko hapa kukusaidia!",
        "privacy.title": "Sera ya Faragha",
        "privacy.body": "Tunajali faragha yako sana.\n\n1. UHIFADHI WA DATA: Data yote imehifadhiwa salama kwenye Firebase (Google Cloud) kwa HTTPS na kisifuji cha 256-bit.\n\n2. KISIFUJI: Mashamba muhimu yamefichwa kabla ya kutumwa kwenye seva.\n\n3. MATUMIZI YA DATA: Data yako inatumika tu kwa programu ya Debt Tracker. Hatuuzi au kushiriki data ya kibinafsi.\n\n4. KUKI: Tunatumia kuki chache tu kwa uthibitisho na usanifu.\n\n5. HAKI ZAKO: Chini ya Akta ya Kulinda Data ya Kenya 2019, una haki ya kupata, kubadilisha au kufuta data yako wakati wowote.\n\nIlisasishwa: Januari 2025"
    }
};

let currentLang = 'en';

function initI18n() {
    // Auto-detect language from browser
    const browserLang = navigator.language?.split('-')[0];
    const saved = localStorage.getItem('app_language');
    currentLang = saved || (browserLang === 'sw' ? 'sw' : 'en');
    localStorage.setItem('app_language', currentLang);
    applyTranslations();
    updateLangButton();
}

function applyTranslations() {
    document.querySelectorAll('[i18n]').forEach(el => {
        const key = el.getAttribute('i18n');
        if (translations[currentLang] && translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });
}

function updateLangButton() {
    const btn = document.getElementById('lang-toggle');
    btn.textContent = currentLang === 'en' ? '🇬🇧 EN' : '🇰🇪 SW';
}

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'sw' : 'en';
    localStorage.setItem('app_language', currentLang);
    applyTranslations();
    updateLangButton();
}

function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) || key;
}

// ===== ONBOARDING =====
let onboardingStep = 0;
const totalSteps = 4;

function showOnboarding() {
    document.getElementById('onboarding-modal').classList.add('active');
}

function hideOnboarding() {
    document.getElementById('onboarding-modal').classList.remove('active');
    localStorage.setItem('onboarding_done', 'true');
}

function goToStep(step) {
    document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.onboarding-dot').forEach(el => el.classList.remove('active'));

    const target = document.querySelector(`.onboarding-step[data-step="${step}"]`);
    const dot = document.querySelector(`.onboarding-dot[data-step="${step}"]`);
    if (target) target.classList.add('active');
    if (dot) dot.classList.add('active');

    const prevBtn = document.getElementById('onboarding-prev');
    const nextBtn = document.getElementById('onboarding-next');
    prevBtn.style.display = step === 0 ? 'none' : 'inline-block';

    if (step === totalSteps - 1) {
        nextBtn.textContent = '🎉 Get Started';
        nextBtn.onclick = hideOnboarding;
    } else {
        nextBtn.textContent = 'Next →';
        nextBtn.onclick = () => goToStep(step + 1);
    }

    prevBtn.onclick = () => goToStep(step - 1);
    onboardingStep = step;
}

function setupOnboarding() {
    document.getElementById('onboarding-next').addEventListener('click', () => goToStep(onboardingStep + 1));
    document.getElementById('onboarding-prev').addEventListener('click', () => goToStep(onboardingStep - 1));
    document.getElementById('onboarding-skip').addEventListener('click', hideOnboarding);

    // Show onboarding after signup if not seen
    // Called from firebase.js after new signup
}

function checkAndShowOnboarding() {
    if (!localStorage.getItem('onboarding_done')) {
        goToStep(0);
        showOnboarding();
    }
}

// ===== PRIVACY MODAL (reuses reminder modal) =====
function showPrivacy() {
    const modal = document.getElementById('reminder-modal');
    modal.querySelector('h2').textContent = t('privacy.title');
    document.getElementById('reminder-text').value = t('privacy.body');
    modal.classList.add('active');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    initI18n();
    setupOnboarding();

    // Lang toggle
    document.getElementById('lang-toggle').addEventListener('click', toggleLanguage);

    // Privacy links
    document.getElementById('privacy-link').addEventListener('click', (e) => { e.preventDefault(); showPrivacy(); });
    document.getElementById('privacy-link-footer').addEventListener('click', (e) => { e.preventDefault(); showPrivacy(); });
});
