import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchFileMimeType, fetchFileUrls, PDF_TYPE, uploadFile, type FileCategory } from './api';
import { compressImage } from './image';

/**
 * Envoi d'un fichier ; les photos sont compressées au préalable, sauf `compress: false`
 * (logo : on garde le PNG et sa transparence). Renvoie l'identifiant du fichier.
 */
export function useUploadFile(category: FileCategory, { compress = true } = {}) {
  return useMutation({
    mutationFn: async (file: File) => uploadFile(compress ? await compressImage(file) : file, { category }),
  });
}

/** URL de lecture d'un lot de fichiers, renouvelées avant leur expiration (1 h). */
export function useFileUrls(fileIds: (string | null | undefined)[]) {
  const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id)))].sort();
  return useQuery({
    queryKey: ['file-urls', ids],
    queryFn: () => fetchFileUrls(ids),
    enabled: ids.length > 0,
    staleTime: 45 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
  });
}

/** Fichier PDF (pas d'aperçu image) ; false tant que son type n'est pas connu. */
export function useIsPdf(fileId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['file-mime', fileId],
    queryFn: () => fetchFileMimeType(fileId ?? ''),
    enabled: Boolean(fileId),
    staleTime: Infinity,
  });
  return query.data === PDF_TYPE;
}

export function useFileUrl(fileId: string | null | undefined) {
  const query = useFileUrls([fileId]);
  return { ...query, url: fileId ? query.data?.[fileId] : undefined };
}
