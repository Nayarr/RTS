import { useEffect, useState } from 'react';
import { frenchVoices } from './speech';

/** Voix françaises de l'appareil, mises à jour quand le navigateur finit de les charger. */
export function useFrenchVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(frenchVoices);
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (typeof synth?.addEventListener !== 'function') return;
    const update = () => setVoices(frenchVoices());
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}
