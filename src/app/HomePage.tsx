import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';

/** Accueil provisoire : sera remplacé par le tableau de bord / la liste technicien. */
export function HomePage() {
  const { data: profile } = useProfile();
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bonjour {profile.full_name || profile.email}</h1>
        <p className="text-muted-foreground">Espace {ROLE_LABELS[profile.role]}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nouvelle version en construction</CardTitle>
          <CardDescription>Les modules arrivent progressivement.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ordres de réparation, planning, devis et factures, pointage…
        </CardContent>
      </Card>
    </div>
  );
}
