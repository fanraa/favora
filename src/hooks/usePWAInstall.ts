import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Simpan event prompt di tingkat modul JavaScript agar tidak hilang saat navigasi tab/halaman
let globalPromptEvent: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  // Tangkap event sedini mungkin jika script dieksekusi
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalPromptEvent = e as BeforeInstallPromptEvent;
    window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    globalPromptEvent = null;
    window.__pwaInstallPrompt = null;
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return globalPromptEvent || window.__pwaInstallPrompt || null;
    }
    return null;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  const [isIOS, setIsIOS] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  });

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandalone);
    };

    checkInstalled();

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvt = e as BeforeInstallPromptEvent;
      globalPromptEvent = promptEvt;
      window.__pwaInstallPrompt = promptEvt;
      setDeferredPrompt(promptEvt);
    };

    const handlePromptReady = () => {
      const current = globalPromptEvent || window.__pwaInstallPrompt;
      if (current) {
        setDeferredPrompt(current);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      globalPromptEvent = null;
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(null);
    };

    // Sinkronkan jika sudah tertangkap dari awal window
    if ((globalPromptEvent || window.__pwaInstallPrompt) && !deferredPrompt) {
      setDeferredPrompt(globalPromptEvent || window.__pwaInstallPrompt || null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    const promptEvt =
      deferredPrompt ||
      globalPromptEvent ||
      (typeof window !== 'undefined' ? window.__pwaInstallPrompt : null);

    if (!promptEvt) {
      return 'unsupported';
    }

    try {
      // Langsung munculkan dialog / popup instalasi native bawaan browser
      await promptEvt.prompt();
      const choice = await promptEvt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsInstalled(true);
        globalPromptEvent = null;
        if (typeof window !== 'undefined') {
          window.__pwaInstallPrompt = null;
        }
        setDeferredPrompt(null);
        return 'accepted';
      }
      return 'dismissed';
    } catch (err) {
      console.warn('Gagal memunculkan popup instalasi PWA:', err);
      return 'unsupported';
    }
  };

  return {
    isInstallable: Boolean(
      deferredPrompt ||
      globalPromptEvent ||
      (typeof window !== 'undefined' && window.__pwaInstallPrompt)
    ),
    isInstalled,
    isIOS,
    install,
  };
}
