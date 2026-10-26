import { useEffect, useId, useState } from 'react';
import { MapPin, Route } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/features/settings/hooks';
import { decimalValue, formatEuro } from '@/lib/numbers';
import {
  computeTrip,
  durationLabel,
  roadsideTravel,
  searchPlaces,
  type Place,
  type RoadsideValue,
} from './roadside';

const numberText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

/**
 * Dépannage extérieur : lieu d'intervention (adresses de l'IGN), trajet aller-retour calculé avec
 * le trafic (TomTom) ou saisi, prix du déplacement selon la zone (Réglages › Atelier).
 */
export function RoadsideFields({
  value,
  onChange,
  departAt = null,
}: {
  value: RoadsideValue;
  onChange: (value: RoadsideValue) => void;
  /** Départ prévu (planning) : trafic de ce moment ; sinon maintenant. */
  departAt?: string | null;
}) {
  const id = useId();
  const settings = useSettings();
  const [place, setPlace] = useState<Place | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [computing, setComputing] = useState(false);
  const [priceText, setPriceText] = useState(numberText(value.manualPrice));
  const [kmText, setKmText] = useState(numberText(value.km));

  // Adresses proposées pendant la saisie (petite pause entre deux recherches), pas une fois choisie
  const searchable = value.enabled && place?.label !== value.address && value.address.trim().length >= 3;
  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(value.address, controller.signal)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchable, value.address]);

  const app = settings.data?.app;
  const company = settings.data?.company;
  const travel =
    app && value.km !== null && value.minutes !== null
      ? roadsideTravel(value.km, value.minutes, value.manualPrice, app)
      : null;

  const calculate = async () => {
    if (!place || !company) return;
    setComputing(true);
    try {
      const [garage] = await searchPlaces(`${company.address_line} ${company.postal_code} ${company.city}`);
      if (!garage) throw new Error('Adresse de l’atelier introuvable : vérifie Réglages › Entreprise');
      const trip = await computeTrip(garage, place, departAt);
      setKmText(numberText(trip.km));
      onChange({ ...value, km: trip.km, minutes: trip.minutes });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Calcul du trajet impossible');
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="col gap-3.5">
      <label className="row items-start gap-2 text-[13.5px]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span>
          <b>Dépannage extérieur</b> : intervention hors de l’atelier, déplacement facturé selon la zone
        </span>
      </label>
      {value.enabled && (
        <>
          <div className="field relative">
            <Label htmlFor={`${id}-address`}>Lieu d’intervention</Label>
            <Input
              id={`${id}-address`}
              autoComplete="off"
              placeholder="Adresse, aire, zone d’activité…"
              value={value.address}
              aria-autocomplete="list"
              aria-controls={`${id}-places`}
              onChange={(event) => {
                setPlace(null);
                onChange({ ...value, address: event.target.value });
              }}
            />
            {searchable && suggestions.length > 0 && (
              <ul
                id={`${id}-places`}
                role="listbox"
                aria-label="Adresses trouvées"
                className="card absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto py-1"
              >
                {suggestions.map((suggestion) => (
                  <li key={`${suggestion.lat},${suggestion.lon}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="row w-full gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-hover"
                      onClick={() => {
                        setPlace(suggestion);
                        setSuggestions([]);
                        onChange({ ...value, address: suggestion.label });
                      }}
                    >
                      <MapPin className="i s shrink-0" /> {suggestion.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searchable && searching && <span className="hint">Recherche de l’adresse…</span>}
          </div>
          <div className="row wrap items-end gap-3">
            <div className="field w-[170px]">
              <Label htmlFor={`${id}-km`}>Distance aller-retour (km)</Label>
              <Input
                id={`${id}-km`}
                inputMode="decimal"
                className="num"
                value={kmText}
                onChange={(event) => {
                  setKmText(event.target.value);
                  onChange({ ...value, km: decimalValue(event.target.value) });
                }}
              />
            </div>
            <div className="field w-[170px]">
              <Label htmlFor={`${id}-minutes`}>Trajet aller-retour (min)</Label>
              <Input
                id={`${id}-minutes`}
                inputMode="numeric"
                className="num"
                value={value.minutes === null ? '' : String(value.minutes)}
                onChange={(event) => {
                  const minutes = Number.parseInt(event.target.value, 10);
                  onChange({ ...value, minutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : null });
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!place || computing}
              title={place ? undefined : 'Choisis d’abord une adresse dans la liste'}
              onClick={() => void calculate()}
            >
              <Route /> {computing ? 'Calcul…' : 'Calculer le trajet (trafic compris)'}
            </Button>
          </div>
          <div className="field w-full max-w-[320px]">
            <Label htmlFor={`${id}-price`}>
              Prix du déplacement (€ HT){travel?.zone === 4 ? '' : ', à la place du calcul'}
            </Label>
            <Input
              id={`${id}-price`}
              inputMode="decimal"
              className="num"
              placeholder={travel?.zone === 4 ? 'À saisir' : 'Facultatif'}
              value={priceText}
              onChange={(event) => {
                setPriceText(event.target.value);
                onChange({ ...value, manualPrice: decimalValue(event.target.value) });
              }}
            />
          </div>
          {travel && (
            <p className="text-[13.5px]" role="status">
              {travel.zone === 4 ? (
                travel.price === null ? (
                  <>Au-delà de la zone 3 : indique le prix du déplacement.</>
                ) : (
                  <>
                    Au-delà de la zone 3 : <b className="num">{formatEuro(travel.price)}</b> HT
                  </>
                )
              ) : (
                <>
                  Zone {travel.zone} : <b className="num">{formatEuro(travel.price)}</b> HT
                  {value.manualPrice !== null
                    ? ' (prix saisi)'
                    : travel.byTime
                      ? ` (${durationLabel(value.minutes ?? 0)} de trajet facturé)`
                      : ' (forfait)'}
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
