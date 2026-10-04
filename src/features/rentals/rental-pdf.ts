import type { PdfFile } from '@/components/PdfPreviewDialog';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { fetchFileUrls } from '@/features/files/api';
import {
  createPdf,
  drawLetterhead,
  GREEN,
  imageToDataUrl,
  MARGIN,
  PAGE_W,
  pdfFileName,
  pdfMoney,
  pdfText,
} from '@/lib/pdf';
import { CATEGORY_META, hasEngine, vehicleTitle } from './fleet-domain';
import type { RentalDetail } from './rental-api';
import {
  present,
  DEPOSIT_MODES,
  fuelLabel,
  RATE_PERIODS,
  rentalBase,
  round2,
  SIDE_SLOTS,
} from './rental-domain';

const paris = (iso: string, withTime = true) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: withTime ? 'long' : undefined,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));

const frDate = (value: string | null | undefined) => (value ? value.split('-').reverse().join('/') : '-');

/** Contrat de location (ou bon de prêt) : parties, véhicule, période, conditions, état des lieux, signatures. */
export async function buildRentalPdf(detail: RentalDetail): Promise<PdfFile> {
  const { rental, vehicle, client, license, photos, damages, inspections } = detail;
  const { settings, logo } = await loadPdfContext();
  const { doc, table } = await createPdf();
  const loan = rental.kind === 'loan';
  drawLetterhead(doc, settings.company, logo, loan ? 'BON DE PRÊT' : 'CONTRAT DE LOCATION');

  let y = 45;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text(`N° ${rental.number}`, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Établi le ${paris(rental.created_at)}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;

  const departure = inspections.find((item) => item.phase === 'departure');
  const period = RATE_PERIODS.find((entry) => entry.value === rental.rate_period) ?? RATE_PERIODS[0];
  const box = (
    title: string,
    rows: [string, string][],
  ): (string | { content: string; styles: object })[][] => [
    [{ content: title, styles: { fontStyle: 'bold', fillColor: [245, 247, 245] } }, ''],
    ...rows.map(([label, value]) => [label, pdfText(value)]),
  ];
  const twoColumns = (left: ReturnType<typeof box>, right: ReturnType<typeof box>) => {
    const startY = y;
    const width = (PAGE_W - 2 * MARGIN - 6) / 2;
    const options = {
      theme: 'grid' as const,
      styles: {
        fontSize: 8.5,
        cellPadding: 1.6,
        lineColor: [215, 220, 215] as [number, number, number],
        lineWidth: 0.2,
      },
      columnStyles: { 0: { cellWidth: 30, textColor: [98, 104, 98] as [number, number, number] } },
    };
    const endLeft = table({
      ...options,
      startY,
      body: left,
      margin: { left: MARGIN, right: MARGIN + width + 6 },
    });
    const endRight = table({
      ...options,
      startY,
      body: right,
      margin: { left: MARGIN + width + 6, right: MARGIN },
    });
    y = Math.max(endLeft, endRight) + 4;
  };

  twoColumns(
    box(loan ? 'BÉNÉFICIAIRE' : 'LOCATAIRE', [
      ['Nom', client.name],
      ['Adresse', client.billing_address ?? '-'],
      ['Téléphone', client.phone ?? '-'],
      ['E-mail', client.email ?? '-'],
    ]),
    box('PERMIS DE CONDUIRE', [
      ['Conducteur', license ? `${license.first_name} ${license.last_name}` : '-'],
      ['N°', license?.license_number ?? '-'],
      ['Catégories', license?.categories.join(', ') || '-'],
      ['Valide jusqu’au', frDate(license?.valid_until)],
    ]),
  );
  twoColumns(
    box('VÉHICULE', [
      ['Immatriculation', vehicle.plate],
      ['Modèle', vehicleTitle(vehicle)],
      ['Catégorie', `${CATEGORY_META[vehicle.category].label} · permis ${vehicle.license_category}`],
      ['Carburant', vehicle.fuel_type ?? '-'],
    ]),
    box('PÉRIODE', [
      ['Départ', paris(rental.departure_at)],
      ['Retour prévu', paris(rental.planned_return_at)],
      ...(rental.repair_order_number ? ([['OR', rental.repair_order_number]] as [string, string][]) : []),
    ]),
  );

  // Conditions financières
  if (rental.billable) {
    const base = rentalBase(rental);
    const vat = round2(base * 0.2);
    y = table({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Désignation', 'Qté', 'PU HT', 'Total HT']],
      body: [
        [
          pdfText(
            `${loan ? 'Prêt' : 'Location'} ${vehicleTitle(vehicle)}${rental.km_included ? ` (${rental.km_included} km inclus)` : ''}`,
          ),
          `${rental.periods} ${rental.periods > 1 ? period.units : period.unit}`,
          pdfMoney(rental.unit_price * (1 - rental.discount_percent / 100)),
          pdfMoney(base),
        ],
        [{ content: 'TVA 20 %', colSpan: 3, styles: { halign: 'right' } }, pdfMoney(vat)],
        [
          { content: 'Total TTC estimé', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: pdfMoney(round2(base + vat)), styles: { fontStyle: 'bold' } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [215, 220, 215], lineWidth: 0.2 },
      headStyles: { fillColor: GREEN, textColor: 255 },
      columnStyles: {
        1: { halign: 'right', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 26 },
        3: { halign: 'right', cellWidth: 26 },
      },
    });
    y += 3;
    doc.setFontSize(8.5);
    const deposit = DEPOSIT_MODES.find((mode) => mode.value === rental.deposit_mode)?.label;
    doc.text(
      pdfText(
        [
          present(rental.extra_km_price) ? `Km sup. : ${pdfMoney(rental.extra_km_price)} HT` : null,
          present(rental.fuel_price_per_liter)
            ? `Carburant : ${pdfMoney(rental.fuel_price_per_liter)} / L`
            : null,
          `Caution : ${pdfMoney(rental.deposit)}${deposit ? ` (${deposit})` : ''}`,
          present(rental.franchise) ? `Franchise : ${pdfMoney(rental.franchise)}` : null,
        ]
          .filter(Boolean)
          .join('   ·   '),
      ),
      MARGIN,
      y + 2,
    );
    y += 7;
  } else {
    doc.setFontSize(9);
    doc.text('Prêt gratuit pendant l’intervention de l’atelier (véhicule de courtoisie).', MARGIN, y + 2);
    y += 7;
  }

  // État des lieux de départ
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `État des lieux de départ${departure ? ` · ${paris(departure.inspected_at)}` : ''}`,
    MARGIN,
    y + 2,
  );
  doc.setFont('helvetica', 'normal');
  y += 5;
  const departurePhotos = [
    ...SIDE_SLOTS.map(({ slot, label }) => ({
      label,
      photo: photos.find((p) => p.phase === 'departure' && p.slot === slot),
    })),
    {
      label: 'Tableau de bord',
      photo: photos.find((p) => p.phase === 'departure' && p.slot === 'dashboard'),
    },
  ];
  const ids = departurePhotos.flatMap((entry) => (entry.photo ? [entry.photo.file_id] : []));
  const noUrls: Record<string, string> = {};
  const urls = ids.length ? await fetchFileUrls(ids).catch(() => noUrls) : noUrls;
  const width = (PAGE_W - 2 * MARGIN - 4 * 3) / 5;
  for (const [index, entry] of departurePhotos.entries()) {
    const x = MARGIN + index * (width + 3);
    const url = entry.photo ? urls[entry.photo.file_id] : undefined;
    const data = url ? await imageToDataUrl(url) : null;
    doc.setDrawColor(215, 220, 215);
    doc.rect(x, y, width, width * 0.66);
    if (data) {
      try {
        doc.addImage(data, x, y, width, width * 0.66);
      } catch {
        // photo illisible : cadre vide
      }
    }
    doc.setFontSize(7.5);
    doc.setTextColor(98, 104, 98);
    doc.text(entry.label, x, y + width * 0.66 + 3.5);
    doc.setTextColor(0, 0, 0);
  }
  y += width * 0.66 + 8;
  doc.setFontSize(8.5);
  const departureDamages = damages.filter((item) => item.phase === 'departure');
  const facts = [
    hasEngine(vehicle.category)
      ? `Kilométrage : ${departure?.mileage?.toLocaleString('fr-FR') ?? '-'} km`
      : null,
    hasEngine(vehicle.category) ? `Carburant : ${fuelLabel(departure?.fuel_eighths)}` : null,
    departure?.equipment.length ? `Équipements : ${departure.equipment.join(', ')}` : null,
    `Dommages existants : ${departureDamages.length ? departureDamages.map((item, index) => `${index + 1}. ${item.label}`).join(' ; ') : 'aucun'}`,
  ].filter((line): line is string => Boolean(line));
  for (const line of facts) {
    const wrapped = doc.splitTextToSize(pdfText(line), PAGE_W - 2 * MARGIN) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 4;
  }

  y += 2;
  doc.setFontSize(8);
  doc.setTextColor(98, 104, 98);
  const clause = loan
    ? 'Le bénéficiaire reconnaît avoir reçu le véhicule dans l’état décrit ci-dessus et s’engage à le restituer à la fin de l’intervention, au même niveau de carburant.'
    : 'Le locataire reconnaît avoir reçu le véhicule dans l’état décrit ci-dessus et s’engage à le restituer à la date et à l’heure prévues, au même niveau de carburant. Les kilomètres supplémentaires, le carburant manquant, les retards et les dommages constatés au retour sont facturés selon les conditions ci-dessus, dans la limite de la franchise.';
  const wrapped = doc.splitTextToSize(pdfText(clause), PAGE_W - 2 * MARGIN) as string[];
  doc.text(wrapped, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  y += wrapped.length * 3.6 + 4;

  // Signatures
  const half = (PAGE_W - 2 * MARGIN - 8) / 2;
  doc.setDrawColor(215, 220, 215);
  doc.rect(MARGIN, y, half, 28);
  doc.rect(MARGIN + half + 8, y, half, 28);
  doc.setFontSize(8.5);
  doc.text(pdfText(`Pour ${settings.company.legal_name}`), MARGIN + 2, y + 4);
  doc.text(loan ? 'Le bénéficiaire' : 'Le locataire · « lu et approuvé »', MARGIN + half + 10, y + 4);
  if (rental.signature_file_id) {
    const signatureUrl = (await fetchFileUrls([rental.signature_file_id]).catch(() => noUrls))[
      rental.signature_file_id
    ];
    const signature = signatureUrl ? await imageToDataUrl(signatureUrl) : null;
    if (signature) {
      try {
        doc.addImage(signature, 'PNG', MARGIN + half + 12, y + 6, half - 10, 17);
      } catch {
        // signature illisible
      }
    }
    if (rental.signed_at) {
      doc.setFontSize(7);
      doc.text(`signé le ${paris(rental.signed_at)}`, MARGIN + 2 * half + 6, y + 26.5, { align: 'right' });
    }
  }

  return {
    blob: doc.output('blob'),
    fileName: pdfFileName(loan ? 'Pret' : 'Contrat_location', rental.number, vehicle.plate),
  };
}
