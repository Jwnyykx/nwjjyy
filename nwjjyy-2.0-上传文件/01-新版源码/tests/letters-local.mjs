// Local trial dispatch mirrors Supabase's JSON scalar RPC responses.
export const letterProcedures = {
  letter_list: input => ['select public.letter_list($1,$2) as result', [input.p_box, input.p_offset], 'value'],
  letter_status: () => ['select public.letter_status() as result', [], 'value'],
  letter_archive: () => ['select public.letter_archive() as result', [], 'value'],
  letter_detail: input => ['select public.letter_detail($1) as result', [input.p_id], 'value'],
  letter_save: input => ['select public.letter_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[]) as result',
    [input.p_id, input.p_recipient, input.p_title, input.p_body, input.p_theme, input.p_unlock,
      input.p_show_title, input.p_share_opened, input.p_send, input.p_expected, input.p_assets ?? null], 'value'],
  letter_stage: input => ['select public.letter_stage($1,$2,$3,$4,$5,$6)',
    [input.p_id, input.p_revision, input.p_asset, input.p_kind, input.p_mime, input.p_size], 'void'],
  letter_open: input => ['select public.letter_open($1) as result', [input.p_id], 'value'],
  letter_favorite: input => ['select public.letter_favorite($1,$2)', [input.p_id, input.p_favorite], 'void'],
  letter_discard: input => ['select public.letter_discard($1,$2) as result', [input.p_id, input.p_expected], 'value'],
  letter_cleanup: input => ['select public.letter_cleanup($1) as result', [input.p_id], 'value'],
}
