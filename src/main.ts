import { onAuthStateChanged } from 'firebase/auth';
import { registerSW } from 'virtual:pwa-register';
import { auth } from './firebase';
import { isIOS, isStandalone } from './platform';
import { listenForegroundMessages } from './push';
import { initTheme } from './theme';
import { hideSplash, toast } from './ui';
import { showHome } from './views/home';
import { showInstallIOS } from './views/install';
import { showLogin } from './views/login';

initTheme();

type InstallPrompt = Event & { prompt: () => Promise<void> };
let installPrompt: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as InstallPrompt;
});

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Jest nowa wersja aplikacji.', { label: 'Odśwież', run: () => updateSW(true) });
    },
  });
}

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      if (isIOS() && !isStandalone()) showInstallIOS();
      else showLogin(installPrompt);
    } else {
      await showHome(user);
      void listenForegroundMessages();
    }
  } finally {
    void hideSplash();
  }
});
