import { MyLeaveSection } from './MyLeaveSection';

/** Onglet « Congés » du technicien : ses demandes et absences, demi-journées et heures comprises. */
export function TechLeavePage() {
  return (
    <div className="col gap-[11px]">
      <h1 className="title">Congés</h1>
      <MyLeaveSection />
    </div>
  );
}
