import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { readDoc } from './data/read';
import { registerSW } from 'virtual:pwa-register';
import { auth, db } from './firebase';
import './install';
import { isIOS, isStandalone } from './platform';
import { listenForegroundMessages } from './push';
import { watchConnection } from './offline';
import { initTheme } from './theme';
import { h, hideSplash, setNavIcons, toast } from './ui';
import { showHelp } from './views/help';
import { showReads } from './views/changes';
import { showDestinations } from './views/destinations';
import { ICONS } from './views/icons';
import { showCountriesEdit } from './views/country';
import { isGuidePath, showGuide } from './views/guide';
import { showInstallIOS } from './views/install';
import { showLogin } from './views/login';
import { showPeople } from './views/people';
import { showPlanImport } from './views/planImport';
import { showPlanItemEdit } from './views/planItemEdit';
import { showSettings } from './views/settings';
import { showTrip } from './views/trip';
import { showTripDetailsEdit } from './views/tripDetailsEdit';
import { showTripEdit } from './views/tripEdit';
import { showTrips } from './views/trips';

initTheme();

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Jest nowa wersja aplikacji.', { label: 'Odśwież', run: () => updateSW(true) });
    },
  });
}

let currentUser: User | null = null;

/** ? pomoc i ⚙ ustawienia – u góry każdego ekranu po zalogowaniu (prośba Jacka z 5.11.2026). */
function navIcons(isOrganizer: boolean): HTMLElement {
  const link = (href: string, label: string, icon: 'help' | 'settings' | 'destinations' | 'reads') => {
    const a = h('a', { class: 'icon-link', href, 'aria-label': label, title: label });
    a.innerHTML = ICONS[icon]; // stała ikona
    if (location.hash === href) a.setAttribute('aria-current', 'page');
    return a;
  };
  // 🌐 kierunki – dla wszystkich; 🔭 kto przeczytał – tylko organizator (prośba Jacka z 5.11.2026)
  return h(
    'span',
    { class: 'nav-icons' },
    link('#/kierunki', 'Kierunki do rozważenia', 'destinations'),
    isOrganizer && link('#/odczyty', 'Kto przeczytał zmiany', 'reads'),
    link('#/pomoc', 'Pomoc – co oznaczają ikony', 'help'),
    link('#/ustawienia', 'Ustawienia', 'settings'),
  );
}

/** Trasy w adresie (#/…); bez frameworka. */
async function route(): Promise<void> {
  // Instrukcja dla uczestników – bez logowania, pod stałym adresem /instrukcja
  if (isGuidePath()) {
    setNavIcons(null);
    return showGuide();
  }
  const user = currentUser;
  if (!user) {
    setNavIcons(null);
    if (isIOS() && !isStandalone()) showInstallIOS();
    else showLogin();
    return;
  }
  const meDoc = await readDoc(doc(db, 'users', user.uid)).catch(() => null);
  const me = {
    uid: user.uid,
    displayName: (meDoc?.get('displayName') as string | undefined) ?? '',
    isOrganizer: meDoc?.get('role') === 'organizer',
  };
  setNavIcons(() => navIcons(me.isOrganizer));
  const path = location.hash.replace(/^#/, '') || '/';
  let m: RegExpMatchArray | null;

  if (path === '/ustawienia') return showSettings(user);
  if (path === '/pomoc') return showHelp(me.isOrganizer);
  if (path === '/kierunki') return showDestinations(me);
  if ((m = path.match(/^\/wyjazd\/([\w-]+)$/))) return showTrip(m[1], me);
  if (me.isOrganizer) {
    if (path === '/osoby') return showPeople(user.uid);
    if (path === '/odczyty') return showReads(user.uid);
    if (path === '/nowy-wyjazd') return showTripEdit(null);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/edycja$/))) return showTripEdit(m[1]);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/szczegoly$/))) return showTripDetailsEdit(m[1]);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/kraje$/))) return showCountriesEdit(m[1]);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/import$/))) return showPlanImport(m[1]);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/punkt\/nowy$/))) return showPlanItemEdit(m[1], null, null);
    if ((m = path.match(/^\/wyjazd\/([\w-]+)\/punkt\/(\d{4}-\d{2}-\d{2})\/([\w-]+)$/))) return showPlanItemEdit(m[1], m[2], m[3]);
  }
  if (path !== '/') history.replaceState(null, '', '#/');
  await showTrips(user.uid, me.isOrganizer);
}

window.addEventListener('hashchange', () => {
  void route();
  window.scrollTo(0, 0);
});

watchConnection();

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
