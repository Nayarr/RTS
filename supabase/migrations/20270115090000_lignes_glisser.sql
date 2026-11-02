-- Lignes d'un devis ou d'une facture déplacées par glisser-déposer : nouvel ordre enregistré en une fois.
-- Droits de l'appelant (bureau) : un devis accepté et une facture émise restent figés par leurs triggers.

-- Ordre des lignes d'une section du devis : position = rang dans la liste reçue.
create function public.reorder_quote_lines(p_quote_id uuid, p_line_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(p_line_ids) as l(id)
             where not exists (select 1 from public.quote_lines q where q.id = l.id and q.quote_id = p_quote_id)) then
    raise exception 'Ligne introuvable sur ce devis' using errcode = 'P0002';
  end if;
  update public.quote_lines q set position = l.ord - 1
  from unnest(p_line_ids) with ordinality as l(id, ord)
  where q.id = l.id and q.quote_id = p_quote_id and q.position is distinct from l.ord - 1;
end;
$$;

revoke execute on function public.reorder_quote_lines(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_quote_lines(uuid, uuid[]) to authenticated;

-- Ordre des lignes d'une facture en brouillon : position = rang dans la liste reçue.
create function public.reorder_invoice_lines(p_invoice_id uuid, p_line_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(p_line_ids) as l(id)
             where not exists (select 1 from public.invoice_lines i where i.id = l.id and i.invoice_id = p_invoice_id)) then
    raise exception 'Ligne introuvable sur cette facture' using errcode = 'P0002';
  end if;
  update public.invoice_lines i set position = l.ord - 1
  from unnest(p_line_ids) with ordinality as l(id, ord)
  where i.id = l.id and i.invoice_id = p_invoice_id and i.position is distinct from l.ord - 1;
end;
$$;

revoke execute on function public.reorder_invoice_lines(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_invoice_lines(uuid, uuid[]) to authenticated;
