import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchFileUrls, uploadFile, type FileCategory } from './api';
import { compressImage } from './image';

/** Envoi d'un fichier (photos compressées au préalable). Renvoie l'identifiant du fichier. */
export function useUploadFile(category: FileCategory) {
  return useMutation({
    mutationFn: async (file: File) => uploadFile(await compressImage(file), { category }),
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

export function useFileUrl(fileId: string | null | undefined) {
  const query = useFileUrls([fileId]);
  return { ...query, url: fileId ? query.data?.[fileId] : undefined };
}
