import { useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Label } from '@/components/ui/label';
import { FOREIGN_COUNTRIES } from '@/lib/countries';

/** Champs de l'identifiant de l'entreprise, communs aux fiches client (création, OR, modification). */
export interface CompanyIdValues extends FieldValues {
  siret: string;
  foreign: boolean;
  country: string;
  foreign_id: string;
}

/**
 * SIRET d'un client français ; case « Client étranger » : pays et n° d'entreprise de son pays à la
 * place (pas de SIRET hors de France). Rend une ou deux cases de la grille du formulaire.
 */
export function CompanyIdFields<T extends CompanyIdValues>({
  form,
  idPrefix,
  siretRequired = false,
}: {
  form: UseFormReturn<T>;
  idPrefix: string;
  siretRequired?: boolean;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const name = (field: keyof CompanyIdValues) => field as Path<T>;
  const foreign = useWatch({ control, name: name('foreign') }) as boolean;
  const message = (field: keyof CompanyIdValues) => errors[field]?.message as string | undefined;

  const foreignBox = (
    <label className="row gap-2 text-[13px]">
      <input type="checkbox" className="size-4" {...register(name('foreign'))} />
      Client étranger
    </label>
  );

  if (!foreign) {
    return (
      <div className="col gap-1.5">
        <FormField
          id={`${idPrefix}-siret`}
          label={siretRequired ? 'SIRET *' : 'SIRET'}
          inputMode="numeric"
          placeholder="984 989 137 00018"
          className="num"
          error={message('siret')}
          {...register(name('siret'))}
        />
        {foreignBox}
      </div>
    );
  }

  const countryError = message('country');
  return (
    <>
      <div className="col gap-1.5">
        <div className="field">
          <Label htmlFor={`${idPrefix}-country`}>Pays *</Label>
          <select
            id={`${idPrefix}-country`}
            className="inp"
            aria-invalid={countryError ? true : undefined}
            {...register(name('country'))}
          >
            <option value="">Choisir le pays</option>
            {FOREIGN_COUNTRIES.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </select>
          {countryError && <p className="err">{countryError}</p>}
        </div>
        {foreignBox}
      </div>
      <FormField
        id={`${idPrefix}-foreign-id`}
        label="N° d’entreprise du pays"
        placeholder="BE 0123.456.789"
        hint="TVA ou registre du commerce, tel quel"
        error={message('foreign_id')}
        {...register(name('foreign_id'))}
      />
    </>
  );
}
