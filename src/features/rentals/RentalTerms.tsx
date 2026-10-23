import { rentalTerms, type RentalTermsInput } from './rental-terms';

/** Conditions générales de location, articles numérotés (page du client, comptoir). */
export function RentalTerms({ input }: { input: RentalTermsInput }) {
  return (
    <ol className="col gap-3 text-[13.5px] leading-relaxed" aria-label="Conditions générales de location">
      {rentalTerms(input).map((article, index) => (
        <li key={article.title} className="col gap-1">
          <b>
            Article {index + 1} : {article.title}
          </b>
          {article.paragraphs.map((paragraph) =>
            paragraph.startsWith('• ') ? (
              <span key={paragraph} className="pl-4">
                {paragraph}
              </span>
            ) : (
              <p key={paragraph}>{paragraph}</p>
            ),
          )}
        </li>
      ))}
    </ol>
  );
}
