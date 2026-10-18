import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createTireLine, deleteTireBrand, deleteTireLine, saveTireBrand, type TireBrand } from './api';
import {
  CATEGORY_LABELS,
  PROFILE_LABELS,
  formatTireSize,
  isTireSize,
  profilesFor,
  tiresCount,
  type TireCategory,
  type TireProfile,
} from './domain';
import { useTireBrands, useTireLines, useTireMutation } from './hooks';
import { Seg } from './Seg';

type Tab = 'brands' | 'sizes';

function BrandRow({ brand }: { brand: TireBrand }) {
  const [name, setName] = useState<string | null>(null);
  const rename = useTireMutation((value: string) => saveTireBrand(brand.id, value), 'Marque renommée');
  const remove = useTireMutation(() => deleteTireBrand(brand.id), `${brand.name} supprimée`);
  const used = brand.lots > 0;
  return (
    <li className="row items-center gap-3 border-b px-4 py-2.5 last:border-b-0" aria-label={brand.name}>
      {name === null ? (
        <div className="col min-w-0 flex-1">
          <b className="text-[14px]">{brand.name}</b>
          <span className="muted text-xs">
            {used
              ? `${brand.lots} référence${brand.lots > 1 ? 's' : ''} · ${tiresCount(brand.stock)} en stock`
              : 'Aucun pneu en stock'}
          </span>
        </div>
      ) : (
        <form
          className="row flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) rename.mutate(name, { onSuccess: () => setName(null) });
          }}
        >
          <Input
            aria-label={`Nouveau nom de ${brand.name}`}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            className="ibtn sm ghost"
            aria-label="Enregistrer le nom"
            disabled={rename.isPending}
          >
            <Check className="i s" />
          </button>
          <button type="button" className="ibtn sm ghost" aria-label="Annuler" onClick={() => setName(null)}>
            <X className="i s" />
          </button>
        </form>
      )}
      {name === null && (
        <>
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label={`Renommer ${brand.name}`}
            onClick={() => setName(brand.name)}
          >
            <Pencil className="i s" />
          </button>
          <button
            type="button"
            className="ibtn sm ghost text-destructive disabled:text-muted-foreground"
            aria-label={`Supprimer ${brand.name}`}
            title={used ? 'Marque utilisée par des pneus : renomme-la plutôt' : undefined}
            disabled={used || remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            <Trash2 className="i s" />
          </button>
        </>
      )}
    </li>
  );
}

function BrandsTab() {
  const brands = useTireBrands();
  const [name, setName] = useState('');
  const add = useTireMutation(
    (value: string) => saveTireBrand(null, value),
    (_data, value) => `${value.trim()} ajoutée`,
  );
  return (
    <div className="col gap-3">
      <form
        className="row gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) add.mutate(name, { onSuccess: () => setName('') });
        }}
      >
        <Input
          aria-label="Nouvelle marque"
          placeholder="Nouvelle marque…"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={add.isPending || !name.trim()}>
          <Plus /> Ajouter
        </Button>
      </form>
      {brands.data?.length === 0 && (
        <p className="empty">Aucune marque : elles s’ajoutent aussi à l’entrée des pneus.</p>
      )}
      {brands.data && brands.data.length > 0 && (
        <ul className="card overflow-hidden p-0!" aria-label="Marques">
          {brands.data.map((brand) => (
            <BrandRow key={brand.id} brand={brand} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SizesTab() {
  const lines = useTireLines();
  const [category, setCategory] = useState<TireCategory>('pl');
  const [profile, setProfile] = useState<TireProfile>('avant');
  const [size, setSize] = useState('');
  const [min, setMin] = useState('');
  const add = useTireMutation(createTireLine, (_data, line) => `${line.size} ajoutée`);
  const remove = useTireMutation(deleteTireLine, 'Dimension supprimée');

  return (
    <div className="col gap-3">
      <form
        className="grid items-end gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_90px_auto]"
        aria-label="Nouvelle dimension"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isTireSize(size)) return;
          add.mutate(
            { category, size, profile, min_qty: Number(min || 0) },
            {
              onSuccess: () => {
                setSize('');
                setMin('');
              },
            },
          );
        }}
      >
        <Seg
          label="Catégorie de la dimension"
          value={category}
          options={(['pl', 'vul'] as const).map((value) => ({ value, label: value.toUpperCase() }))}
          onChange={(value) => {
            setCategory(value);
            setProfile(profilesFor(value)[0] as TireProfile);
          }}
        />
        <Input
          aria-label="Dimension"
          className="num"
          placeholder="Dimension (31580225)"
          value={size}
          onChange={(event) => setSize(formatTireSize(event.target.value))}
        />
        <select
          className="inp"
          aria-label="Profil"
          value={profile}
          onChange={(event) => setProfile(event.target.value as TireProfile)}
        >
          {profilesFor(category).map((value) => (
            <option key={value} value={value}>
              {PROFILE_LABELS[value]}
            </option>
          ))}
        </select>
        <Input
          aria-label="Seuil mini"
          className="num"
          inputMode="numeric"
          placeholder="Seuil"
          value={min}
          onChange={(event) => setMin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <Button type="submit" disabled={add.isPending || !isTireSize(size)}>
          <Plus /> Ajouter
        </Button>
      </form>
      {lines.data && lines.data.length > 0 && (
        <ul className="card overflow-hidden p-0!" aria-label="Dimensions">
          {lines.data.map((line) => (
            <li
              key={line.id}
              className="row items-center gap-3 border-b px-4 py-2 last:border-b-0"
              aria-label={`${line.size} ${PROFILE_LABELS[line.profile]}`}
            >
              <b className="num font-medium">{line.size}</b>
              <span className="badge">{line.category.toUpperCase()}</span>
              <span className="flex-1 text-[13.5px]">{PROFILE_LABELS[line.profile]}</span>
              <span className="muted text-xs">
                {tiresCount(line.stock_qty)} · seuil {line.min_qty}
              </span>
              <button
                type="button"
                className="ibtn sm ghost text-destructive disabled:text-muted-foreground"
                aria-label={`Supprimer ${line.size} ${PROFILE_LABELS[line.profile]}`}
                disabled={line.stock_qty > 0 || remove.isPending}
                onClick={() => remove.mutate(line.id)}
              >
                <Trash2 className="i s" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Les tailles proposées au stock, par {CATEGORY_LABELS.pl.toLowerCase()} et{' '}
        {CATEGORY_LABELS.vul.toLowerCase()}. Une dimension avec des pneus en stock ne peut pas être supprimée.
      </p>
    </div>
  );
}

/** Marques et dimensions (P04) : listes proposées à l'entrée des pneus. */
export function BrandsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('brands');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Marques et dimensions</DialogTitle>
          <DialogDescription>
            Les listes proposées quand on ajoute un pneu. Une marque utilisée par des pneus en stock ne peut
            pas être supprimée, seulement renommée.
          </DialogDescription>
        </DialogHeader>
        <Seg
          label="Liste"
          className="w-fit self-start"
          value={tab}
          options={[
            { value: 'brands', label: 'Marques' },
            { value: 'sizes', label: 'Dimensions' },
          ]}
          onChange={setTab}
        />
        {tab === 'brands' ? <BrandsTab /> : <SizesTab />}
      </DialogContent>
    </Dialog>
  );
}
