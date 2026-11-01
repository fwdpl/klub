import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';
import { auth, db } from './firebase';
import './install';
import { isIOS, isStandalone } from './platform';
import { listenForegroundMessages } from './push';
import { initTheme } from './theme';
import { hideSplash, toast } from './ui';
import { showHome } from './views/home';
import { showInstallIOS } from './views/install';
import { showLogin } from './views/login';
import { showPeople } from './views/people';

initTheme();

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Jest nowa wersja aplikacji.', { label: 'Odśwież', run: () => updateSW(true) });
    },
  });
}

let currentUser: User | null = null;

/** Proste trasy w adresie (#/osoby); bez frameworka. */
async function route(): Promise<void> {
  const user = currentUser;
  if (!user) {
    if (isIOS() && !isStandalone()) showInstallIOS();
    else showLogin();
    return;
  }
  if (location.hash === '#/osoby') {
    const me = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
    if (me?.get('role') === 'organizer') return showPeople(user.uid);
    history.replaceState(null, '', '#/');
  }
  await showHome(user);
}

window.addEventListener('hashchange', () => {
  void route();
  window.scrollTo(0, 0);
});

let listening = false;
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  try {
    await route();
    if (user && !listening) {
      listening = true;
      void listenForegroundMessages();
    }
  } finally {
    void hideSplash();
  }
});
